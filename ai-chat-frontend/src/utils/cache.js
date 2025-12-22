// Simple cache utility using localStorage with IndexedDB-like structure
const CACHE_PREFIX = 'ai-chat-cache-';
const CACHE_EXPIRY = 1000 * 60 * 30; // 30 minutes

export const cache = {
  // Get cached data
  get: (key) => {
    try {
      const cached = localStorage.getItem(CACHE_PREFIX + key);
      if (!cached) return null;
      
      const { data, timestamp } = JSON.parse(cached);
      
      // Check if cache is expired
      if (Date.now() - timestamp > CACHE_EXPIRY) {
        localStorage.removeItem(CACHE_PREFIX + key);
        return null;
      }
      
      return data;
    } catch (error) {
      console.warn('Cache get error:', error);
      return null;
    }
  },

  // Set cached data
  set: (key, data) => {
    try {
      const cacheData = {
        data,
        timestamp: Date.now(),
      };
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(cacheData));
    } catch (error) {
      console.warn('Cache set error:', error);
      // If storage is full, clear old cache entries
      if (error.name === 'QuotaExceededError') {
        cache.clearOld();
      }
    }
  },

  // Clear specific cache entry
  remove: (key) => {
    try {
      localStorage.removeItem(CACHE_PREFIX + key);
    } catch (error) {
      console.warn('Cache remove error:', error);
    }
  },

  // Clear all cache
  clear: () => {
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(CACHE_PREFIX)) {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.warn('Cache clear error:', error);
    }
  },

  // Clear expired cache entries
  clearOld: () => {
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(CACHE_PREFIX)) {
          const cached = localStorage.getItem(key);
          if (cached) {
            const { timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp > CACHE_EXPIRY) {
              localStorage.removeItem(key);
            }
          }
        }
      });
    } catch (error) {
      console.warn('Cache clearOld error:', error);
    }
  },
};

// Cache keys
export const CACHE_KEYS = {
  CONVERSATIONS: 'conversations',
  MESSAGES: (conversationId) => `messages-${conversationId}`,
};

