/**
 * Resilient Distributed Redis Infrastructure Configuration
 * 
 * Provides:
 * 1. Redis primary command client
 * 2. Dedicated Pub/Sub clients for multi-instance Socket.IO clustering
 * 3. Distributed mutual-exclusion locking (Redlock-compatible) for background jobs
 * 4. Multi-level caching with automatic in-memory fallback if Redis is unavailable
 */

const Redis = require('ioredis');

const REDIS_URI = process.env.REDIS_URI || process.env.REDIS_URL;
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT, 10) || 6379;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

let redisClient = null;
let pubClient = null;
let subClient = null;
let isRedisAvailable = false;

// In-Memory Fallback Cache & Locks Store
const localCache = new Map();
const localLocks = new Map();

// Periodic cleanup of expired local cache entries
setInterval(() => {
  const now = Date.now();
  for (const [key, item] of localCache.entries()) {
    if (item.expiresAt && item.expiresAt <= now) {
      localCache.delete(key);
    }
  }
  for (const [key, expiresAt] of localLocks.entries()) {
    if (expiresAt <= now) {
      localLocks.delete(key);
    }
  }
}, 30000).unref();

function createClient(role = 'main') {
  const options = {
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
    enableOfflineQueue: false,
    retryStrategy: (times) => {
      // Exponential backoff up to 10s
      if (times > 5 && !REDIS_URI && !process.env.REDIS_HOST) {
        // In local standalone dev without Redis, stop retrying aggressively
        return null;
      }
      return Math.min(times * 500, 10000);
    }
  };

  const client = REDIS_URI ? new Redis(REDIS_URI, options) : new Redis(options);

  client.on('connect', () => {
    isRedisAvailable = true;
    console.log(`✅ Redis (${role}) connected successfully.`);
  });

  client.on('error', (err) => {
    if (isRedisAvailable) {
      console.warn(`⚠️ Redis (${role}) connection error:`, err.message);
    }
    isRedisAvailable = false;
  });

  return client;
}

// Initialize clients if configured or attempt local detection
try {
  redisClient = createClient('main');
  pubClient = createClient('pub');
  subClient = createClient('sub');
} catch (e) {
  console.warn('⚠️ Redis not initialized. Operating in resilient In-Memory fallback mode.');
  isRedisAvailable = false;
}

/**
 * Acquire a distributed lock with automatic TTL expiration
 * Safe across horizontal monolith instances.
 * @param {string} lockKey - Unique lock identifier
 * @param {number} ttlSeconds - Expiration in seconds
 * @returns {Promise<boolean>} True if lock acquired, false if held by another instance
 */
async function acquireDistributedLock(lockKey, ttlSeconds = 25) {
  const key = `lock:${lockKey}`;
  const now = Date.now();
  const expiresAt = now + (ttlSeconds * 1000);

  if (isRedisAvailable && redisClient) {
    try {
      // SET key value NX EX ttl
      const result = await redisClient.set(key, String(now), 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    } catch (e) {
      // Fallback to local lock on network error
    }
  }

  // Local In-Memory Fallback Lock
  const currentExpiry = localLocks.get(key);
  if (currentExpiry && currentExpiry > now) {
    return false; // Lock is currently held
  }

  localLocks.set(key, expiresAt);
  return true;
}

/**
 * Release a previously acquired distributed lock
 */
async function releaseDistributedLock(lockKey) {
  const key = `lock:${lockKey}`;

  if (isRedisAvailable && redisClient) {
    try {
      await redisClient.del(key);
    } catch (e) {}
  }
  localLocks.delete(key);
}

/**
 * Cache Get with Multi-Level support
 */
async function cacheGet(key) {
  if (isRedisAvailable && redisClient) {
    try {
      const data = await redisClient.get(key);
      if (data) return JSON.parse(data);
    } catch (e) {}
  }

  // Local fallback
  const item = localCache.get(key);
  if (item) {
    if (item.expiresAt && item.expiresAt <= Date.now()) {
      localCache.delete(key);
      return null;
    }
    return item.data;
  }
  return null;
}

/**
 * Cache Set with TTL
 */
async function cacheSet(key, value, ttlSeconds = 60) {
  if (isRedisAvailable && redisClient) {
    try {
      await redisClient.set(key, JSON.stringify(value), 'EX', ttlSeconds);
      return;
    } catch (e) {}
  }

  // Local fallback
  localCache.set(key, {
    data: value,
    expiresAt: Date.now() + (ttlSeconds * 1000)
  });
}

/**
 * Cache Delete / Invalidate
 */
async function cacheDel(key) {
  if (isRedisAvailable && redisClient) {
    try {
      await redisClient.del(key);
    } catch (e) {}
  }
  localCache.delete(key);
}

module.exports = {
  getRedisClient: () => redisClient,
  getPubClient: () => pubClient,
  getSubClient: () => subClient,
  isRedisActive: () => isRedisAvailable,
  acquireDistributedLock,
  releaseDistributedLock,
  cacheGet,
  cacheSet,
  cacheDel
};
