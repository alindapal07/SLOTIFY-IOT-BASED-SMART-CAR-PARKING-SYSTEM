/**
 * Production Authentication & Authorization Middleware
 * Enforces JWT access verification, multi-tier RBAC (DRIVER, PROVIDER, ADMIN, SUPER_ADMIN),
 * and brute-force protection with IP-based sliding window rate limiters.
 */
const jwt = require('jsonwebtoken');
const config = require('../config/environment');
const User = require('../models/User');

const JWT_SECRET = config.jwt.secret || process.env.JWT_SECRET || 'supersecret_ai_parking_key_12345';

/**
 * Route protection middleware using JWT access tokens
 * Supports both httpOnly cookies and Authorization: Bearer <token>
 */
const protect = async (req, res, next) => {
  let token = req.cookies?.accessToken;

  // Fallback to Bearer token in Authorization header
  if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized. Authentication token missing.',
      code: 'TOKEN_MISSING'
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized. User account not found.',
        code: 'USER_NOT_FOUND'
      });
    }

    if (user.status === 'BLOCKED') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Your account has been blocked.',
        code: 'ACCOUNT_BLOCKED'
      });
    }

    if (user.status === 'SUSPENDED') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Your account is temporarily suspended.',
        code: 'ACCOUNT_SUSPENDED'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Authentication token expired. Please refresh your session.',
        code: 'TOKEN_EXPIRED'
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Not authorized. Invalid authentication token.',
      code: 'TOKEN_INVALID'
    });
  }
};

/**
 * Multi-tier Role-Based Access Control (RBAC)
 * Supports DRIVER, PROVIDER, ADMIN, SUPER_ADMIN.
 * SUPER_ADMIN inherits all ADMIN and PROVIDER administrative privileges.
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required before checking permissions.',
        code: 'AUTH_REQUIRED'
      });
    }

    const userRole = req.user.role;

    // SUPER_ADMIN has full access to ADMIN and PROVIDER routes
    if (userRole === 'SUPER_ADMIN') {
      return next();
    }

    // Role check
    if (!roles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Role '${userRole}' is not authorized to access this resource.`,
        code: 'FORBIDDEN_ROLE'
      });
    }

    next();
  };
};

/**
 * Sliding Window In-Memory Rate Limiter Factory
 */
const createRateLimiter = ({ windowMs, maxRequests, message, code }) => {
  const store = new Map();

  // Periodic cleanup of stale entries every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [ip, timestamps] of store.entries()) {
      const active = timestamps.filter(t => now - t < windowMs);
      if (active.length === 0) {
        store.delete(ip);
      } else {
        store.set(ip, active);
      }
    }
  }, 5 * 60 * 1000).unref();

  return (req, res, next) => {
    const rawIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
    const now = Date.now();

    const timestamps = store.get(rawIp) || [];
    const validTimestamps = timestamps.filter(t => now - t < windowMs);

    if (validTimestamps.length >= maxRequests) {
      const oldest = validTimestamps[0];
      const retryAfterSeconds = Math.ceil((oldest + windowMs - now) / 1000);
      res.setHeader('Retry-After', retryAfterSeconds);
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', 0);

      return res.status(429).json({
        success: false,
        message,
        code,
        retryAfterSeconds
      });
    }

    validTimestamps.push(now);
    store.set(rawIp, validTimestamps);

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', maxRequests - validTimestamps.length);

    // Reset rate limiter bucket upon successful authentication
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        store.delete(rawIp);
      }
    });

    next();
  };
};

// General auth rate limiter (100 attempts / 15 minutes)
const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 100,
  message: 'Too many authentication attempts. Please try again in 15 minutes.',
  code: 'AUTH_RATE_LIMIT_EXCEEDED'
});

// Stricter brute-force protection for login (10 attempts / 5 minutes)
const loginRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  maxRequests: 10,
  message: 'Too many failed or repeated login attempts. Please wait 5 minutes before trying again.',
  code: 'LOGIN_RATE_LIMIT_EXCEEDED'
});

module.exports = {
  protect,
  authorize,
  authRateLimiter,
  loginRateLimiter
};
