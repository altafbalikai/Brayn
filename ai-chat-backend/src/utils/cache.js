// src/utils/cache.js
const logger = require('../config/logger');

// Simple in-memory cache with TTL
class SimpleCache {
  constructor() {
    this.cache = new Map();
    this.timers = new Map();
  }

  set(key, value, ttlMs = 3600000) { // Default 1 hour
    // Clear existing timer if any
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
    }

    // Set the value
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });

    // Set timer to auto-delete
    const timer = setTimeout(() => {
      this.delete(key);
    }, ttlMs);

    this.timers.set(key, timer);
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) {
      return null;
    }

    // Check if expired
    if (Date.now() > item.expiresAt) {
      this.delete(key);
      return null;
    }

    return item.value;
  }

  delete(key) {
    this.cache.delete(key);
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
      this.timers.delete(key);
    }
  }

  clear() {
    // Clear all timers
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();
    this.cache.clear();
  }

  has(key) {
    const item = this.cache.get(key);
    if (!item) {
      return false;
    }

    // Check if expired
    if (Date.now() > item.expiresAt) {
      this.delete(key);
      return false;
    }

    return true;
  }

  size() {
    return this.cache.size;
  }
}

// Create singleton instance
const cache = new SimpleCache();

// Cleanup on process exit
process.on('SIGINT', () => {
  cache.clear();
  logger.info('Cache cleared on shutdown');
});

module.exports = cache;

