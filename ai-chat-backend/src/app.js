require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const logger = require('./config/logger');

const authRoutes = require('./routes/auth.routes');
const convRoutes = require('./routes/conversation.routes');
const llmRoutes = require('./routes/llm.routes');
const summaryRoutes = require('./routes/summary.routes');

const app = express();

// Security middleware - must be before other middleware
app.use(helmet());

// Rate limiting (global)
const limiter = rateLimit({
  windowMs:
    parseInt(process.env.RATE_LIMIT_WINDOW_MS || '15', 10) * 60 * 1000, // minutes → ms

  max:
    process.env.NODE_ENV === 'production'
      ? parseInt(process.env.RATE_LIMIT_MAX || '100', 10)   // prod
      : parseInt(process.env.RATE_LIMIT_DEV_MAX || '1000', 10), // dev

  message: 'Too many requests from this IP, please try again later.',

  standardHeaders: true,   // Adds RateLimit-* headers
  legacyHeaders: false,    // Disable X-RateLimit-* headers
});


// Apply rate limiting to all requests
app.use(limiter);

// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '15', 10) * 60 * 1000, // 15 minutes
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '5', 10), // limit each IP to 5 requests per windowMs
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// enable JSON body parsing with size limit
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '10mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.URL_ENCODED_LIMIT || '10mb' }));
app.use(cookieParser());


// configure and enable CORS before routes
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
];

// Dynamic CORS for Vercel + local dev
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (Postman, server-to-server)
      if (!origin) return callback(null, true);

      // Allow local dev
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Allow all Vercel preview + prod domains
      if (origin.endsWith('.vercel.app')) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
  })
);

// define routes
// app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/conversations', convRoutes);
app.use('/api/llm', llmRoutes);
app.use('/api/summary', summaryRoutes);

// API Documentation
if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === 'true') {
  const { swaggerSpec, swaggerUi } = require('./config/swagger');
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  logger.info('Swagger UI available at /api-docs');
}

// health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// metrics endpoint
app.get('/metrics', (req, res) => {
  const { isConnected } = require('./db/mongoose');
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
    database: {
      connected: isConnected(),
    },
    environment: process.env.NODE_ENV || 'development',
  });
});

// global error handler
app.use((err, req, res, next) => {
  logger.error('Error:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    status: err.status,
    path: req.path,
    method: req.method,
  });
  res
    .status(err.status || 500)
    .json({ error: err.message || 'Internal Server Error' });
});

module.exports = app;
