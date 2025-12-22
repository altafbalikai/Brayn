// src/test/setup.js
require('dotenv').config({ path: '.env.test' });

// Set test environment variables if not set
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'test-refresh-secret';
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/ai-chat-test';

// Increase timeout for async operations
jest.setTimeout(10000);

