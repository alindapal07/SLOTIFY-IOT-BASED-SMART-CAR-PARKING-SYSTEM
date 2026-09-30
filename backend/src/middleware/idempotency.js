/**
 * Idempotency Middleware
 * 
 * Prevents duplicate processing of critical state-mutating requests
 * (Bookings, Wallet Top-ups, Cancellations, Payments) under high concurrency
 * or network retries.
 * 
 * Supported Header: `Idempotency-Key` or `X-Idempotency-Key`
 * Storage: Distributed Redis cache with In-Memory fallback (TTL: 1 Hour)
 */

const { cacheGet, cacheSet, cacheDel, acquireDistributedLock, releaseDistributedLock } = require('../config/redis');

const idempotency = (ttlSeconds = 3600) => {
  return async (req, res, next) => {
    const rawKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];

    // Only apply if client explicitly sends an idempotency key on mutation methods
    if (!rawKey || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      return next();
    }

    const userId = req.user?._id?.toString() || 'anonymous';
    const compositeKey = `idempotency:${userId}:${req.method}:${req.originalUrl}:${rawKey.trim()}`;
    const lockKey = `lock:${compositeKey}`;

    try {
      // 1. Check if response is already cached from previous execution
      const cached = await cacheGet(compositeKey);
      if (cached) {
        res.setHeader('Idempotent-Replay', 'true');
        return res.status(cached.status).json(cached.body);
      }

      // 2. Acquire lock to prevent concurrent duplicate in-flight requests
      const acquired = await acquireDistributedLock(lockKey, 30);
      if (!acquired) {
        return res.status(409).json({
          success: false,
          message: 'A request with this Idempotency-Key is currently being processed. Please wait for it to complete.',
          code: 'CONCURRENT_REQUEST_IN_FLIGHT'
        });
      }

      // 3. Intercept response to capture and cache output
      const originalJson = res.json.bind(res);
      res.json = (body) => {
        // Cache successful and client-error responses (2xx, 4xx). Do not cache 5xx server errors
        if (res.statusCode < 500) {
          cacheSet(compositeKey, { status: res.statusCode, body }, ttlSeconds).catch(() => {});
        }
        releaseDistributedLock(lockKey).catch(() => {});
        return originalJson(body);
      };

      // Ensure lock is released if connection closes prematurely
      res.on('close', () => {
        releaseDistributedLock(lockKey).catch(() => {});
      });

      next();
    } catch (err) {
      console.warn('Idempotency error, bypassing:', err.message);
      next();
    }
  };
};

module.exports = idempotency;
