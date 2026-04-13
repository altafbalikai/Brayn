/**
 * webSearchCache.js
 * In-memory TTL cache for web search results and fetched page content.
 * Plain-object singleton — lives in src/config/ alongside idempotencyCache.js.
 *
 * Two stores with different TTLs:
 *   queryStore   — search query string → results array  (TTL: 1 hour)
 *   contentStore — page URL           → cleaned string  (TTL: 24 hours)
 */
'use strict';

const QUERY_TTL_MS = 60 * 60 * 1000;       // 1 hour
const CONTENT_TTL_MS = 24 * 60 * 60 * 1000;  // 24 hours

const queryStore = new Map();
const contentStore = new Map();

function _get(store, key) {
    const entry = store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { store.delete(key); return null; }
    return entry.value;
}

function _set(store, key, value, ttlMs) {
    store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

// Purge expired entries every 30 minutes — .unref() so it never blocks shutdown
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of queryStore) { if (now > v.expiresAt) queryStore.delete(k); }
    for (const [k, v] of contentStore) { if (now > v.expiresAt) contentStore.delete(k); }
}, 30 * 60 * 1000).unref();

module.exports = {
    getQuery: (query) => _get(queryStore, query),
    setQuery: (query, results) => _set(queryStore, query, results, QUERY_TTL_MS),
    getContent: (url) => _get(contentStore, url),
    setContent: (url, content) => _set(contentStore, url, content, CONTENT_TTL_MS),
    stats: () => ({ queryCacheSize: queryStore.size, contentCacheSize: contentStore.size }),
};
