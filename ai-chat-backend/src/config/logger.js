// src/config/logger.js
const winston = require('winston');
const path = require('path');

// Detect serverless (Vercel)
const isServerless =
  process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';

// Log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

winston.addColors(colors);

// Log format
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    ({ timestamp, level, message }) =>
      `${timestamp} ${level}: ${message}`
  )
);

// Always-safe transports
const transports = [
  new winston.transports.Console({ format }),
];

// ❌ File logging ONLY for NON-serverless environments
if (!isServerless) {
  const logDir = process.env.LOG_DIR || 'logs';

  transports.push(
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
    })
  );

  transports.push(
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
    })
  );
}

// Create logger
const logger = winston.createLogger({
  level:
    process.env.LOG_LEVEL ||
    (isServerless ? 'info' : 'debug'),
  levels,
  transports,

  // ❌ Disable file-based handlers in serverless
  exceptionHandlers: isServerless
    ? []
    : [new winston.transports.File({ filename: 'logs/exceptions.log' })],

  rejectionHandlers: isServerless
    ? []
    : [new winston.transports.File({ filename: 'logs/rejections.log' })],
});

module.exports = logger;
