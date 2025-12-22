// src/middlewares/cache.middleware.js
const cache = require('../utils/cache');
const logger = require('../config/logger');

/**
 * Cache middleware for GET requests
 * @param {number} ttlMs - Time to live in milliseconds
 * @param {function} keyGenerator - Optional function to generate cache key from request
 */
function cacheMiddleware(ttlMs = 300000, keyGenerator = null) {
  return (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Generate cache key
    const cacheKey = keyGenerator
      ? keyGenerator(req)
      : `cache:${req.originalUrl}:${JSON.stringify(req.query)}:${req.user?.id || 'anonymous'}`;

    // Try to get from cache
    const cached = cache.get(cacheKey);
    if (cached) {
      logger.debug(`Cache hit: ${cacheKey}`);
      return res.json(cached);
    }

    // Store original json method
    const originalJson = res.json.bind(res);

    // Override json method to cache response
    res.json = function (data) {
      // Cache successful responses (status 200)
      if (res.statusCode === 200) {
        cache.set(cacheKey, data, ttlMs);
        logger.debug(`Cache set: ${cacheKey}`);
      }
      return originalJson(data);
    };

    next();
  };
}

/**
 * Invalidate cache by pattern
 */
function invalidateCache(pattern) {
  // Simple pattern matching - in production, use Redis or more sophisticated cache
  logger.info(`Cache invalidation requested for pattern: ${pattern}`);
  // For simple cache, we'd need to implement pattern matching
  // For now, this is a placeholder
}

module.exports = { cacheMiddleware, invalidateCache };

