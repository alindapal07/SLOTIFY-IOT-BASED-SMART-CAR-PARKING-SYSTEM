const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware to protect routes using JWT access token in httpOnly cookie or Authorization header
const protect = async (req, res, next) => {
  let token = req.cookies?.accessToken;

  // Fallback to Authorization header
  if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, token missing' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password');
    
    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized, user not found' });
    }

    if (req.user.status === 'BLOCKED') {
      return res.status(403).json({ message: 'Access denied. Account is blocked.' });
    }

    next();
  } catch (error) {
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

// Reusable role authorization middleware
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: `Access denied. User role '${req.user?.role || 'GUEST'}' is not authorized.` });
    }
    next();
  };
};

// Custom in-memory rate limiter for authentication routes
const rateLimitWindow = 15 * 60 * 1000; // 15 minutes
const maxRequests = 100;
const ipRequestCounts = {};

const authRateLimiter = (req, res, next) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const now = Date.now();

  if (!ipRequestCounts[ip]) {
    ipRequestCounts[ip] = [];
  }

  // Filter out request timestamps older than the rate limit window
  ipRequestCounts[ip] = ipRequestCounts[ip].filter(timestamp => now - timestamp < rateLimitWindow);

  if (ipRequestCounts[ip].length >= maxRequests) {
    return res.status(429).json({ message: 'Too many authentication attempts. Please try again in 15 minutes.' });
  }

  ipRequestCounts[ip].push(now);
  next();
};

module.exports = { protect, authorize, authRateLimiter };
