/**
 * In-memory idempotency cache for duplicate request prevention
 * 
 * ⚠️ IMPORTANT: Single-Instance Only
 * 
 * This implementation uses an in-process Map() and is designed for:
 * - Single Node.js server instance
 * - Vercel single-region deployment
 * - Development/testing environments
 * 
 * Limitations:
 * - Cache is NOT shared across multiple Node instances
 * - Multiple containers/replicas will have separate caches
 * - Duplicate requests MAY be processed if they hit different instances
 * 
 * Scaling Strategy (if needed):
 * 1. Deploy to single region first (current approach)
 * 2. Monitor duplicate rate in production
 * 3. If horizontal scaling needed → migrate to Redis:
 *    - Replace Map() with Redis client
 *    - Use same TTL and interface
 *    - Zero code changes to controllers
 * 
 * Migration Path:
 * ```js
 * // From this:
 * this.cache = new Map();
 * 
 * // To this (future):
 * this.redis = redis.createClient();
 * async get(key) { return this.redis.get(key); }
 * async set(key, value, ttl) { return this.redis.setex(key, ttl, value); }
 * ```
 */

class IdempotencyCache {
    constructor(ttlMs = 120000) {
        this.cache = new Map();
        this.ttlMs = ttlMs;

        // ✅ Improvement: Start periodic cleanup instead of per-entry timers
        this.startPeriodicCleanup();
    }

    startPeriodicCleanup() {
        // Every 30 seconds, scan for expired entries
        this.cleanupInterval = setInterval(() => {
            const now = Date.now();
            let removed = 0;

            for (const [key, entry] of this.cache.entries()) {
                if (now - entry.createdAt > this.ttlMs) {
                    this.cache.delete(key);
                    removed++;
                }
            }

            if (removed > 0) {
                console.debug(`[Idempotency] Cleaned up ${removed} expired entries`);
            }
        }, 30000);
    }

    stop() {
        // For graceful shutdown
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
    }

    has(requestKey) {
        if (!this.cache.has(requestKey)) return false;

        const entry = this.cache.get(requestKey);
        if (Date.now() - entry.createdAt > this.ttlMs) {
            this.cache.delete(requestKey);
            return false;
        }

        return true;
    }

    get(requestKey) {
        if (!this.has(requestKey)) return null;
        return this.cache.get(requestKey);
    }

    set(requestKey, status, result = null, error = null) {
        this.cache.set(requestKey, {
            status,
            result,
            error,
            createdAt: Date.now()
        });
    }

    cleanup(requestKey) {
        this.cache.delete(requestKey);
    }

    size() {
        return this.cache.size;
    }
}

const idempotencyCache = new IdempotencyCache(120000);

module.exports = { idempotencyCache };
