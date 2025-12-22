// src/db/mongoose.js
const mongoose = require('mongoose');
const logger = require('../config/logger');

const MAX_RETRIES = parseInt(process.env.MONGO_MAX_RETRIES || '5', 10);
const RETRY_DELAY = parseInt(process.env.MONGO_RETRY_DELAY_MS || '5000', 10);

let isConnected = false;
let reconnectAttempts = 0;

async function connect() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    const error = new Error('MONGO_URI not set in .env');
    logger.error(error.message);
    throw error;
  }

  try {
    await mongoose.connect(uri, {
      maxPoolSize: parseInt(process.env.MONGO_POOL_SIZE || '50'),
      minPoolSize: parseInt(process.env.MONGO_MIN_POOL_SIZE || '0'),
      retryWrites: true,
      w: 'majority',
      serverSelectionTimeoutMS: parseInt(process.env.MONGO_SERVER_SELECTION_TIMEOUT || '5000', 10),
      socketTimeoutMS: parseInt(process.env.MONGO_SOCKET_TIMEOUT || '45000', 10),
    });

    isConnected = true;
    reconnectAttempts = 0;
    logger.info('✅ MongoDB connected successfully');
    
    // Setup connection event handlers
    setupConnectionHandlers();
  } catch (err) {
    logger.error('MongoDB connection failed:', {
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
    
    // Retry connection if not exceeded max retries
    if (reconnectAttempts < MAX_RETRIES) {
      reconnectAttempts++;
      logger.warn(`Retrying MongoDB connection (attempt ${reconnectAttempts}/${MAX_RETRIES})...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return connect();
    }
    
    throw err;
  }
}

function setupConnectionHandlers() {
  mongoose.connection.on('error', (err) => {
    logger.error('MongoDB connection error:', {
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
    isConnected = false;
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
    isConnected = false;
    
    // Attempt to reconnect
    if (reconnectAttempts < MAX_RETRIES) {
      reconnectAttempts++;
      logger.info(`Attempting to reconnect to MongoDB (attempt ${reconnectAttempts}/${MAX_RETRIES})...`);
      setTimeout(() => {
        connect().catch(err => {
          logger.error('Reconnection attempt failed:', err.message);
        });
      }, RETRY_DELAY);
    } else {
      logger.error('Max reconnection attempts reached. Please check MongoDB connection.');
    }
  });

  mongoose.connection.on('reconnected', () => {
    logger.info('MongoDB reconnected successfully');
    isConnected = true;
    reconnectAttempts = 0;
  });

  mongoose.connection.on('connecting', () => {
    logger.info('Connecting to MongoDB...');
  });

  mongoose.connection.on('connected', () => {
    logger.info('MongoDB connection established');
    isConnected = true;
  });
}

// Graceful shutdown
process.on('SIGINT', async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
    logger.info('MongoDB connection closed through app termination');
    process.exit(0);
  }
});

module.exports = { connect, mongoose, isConnected: () => isConnected };
