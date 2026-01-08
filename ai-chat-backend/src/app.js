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
const llmmodelRoutes = require('./routes/llmmodel.routes');

const app = express();

// Security middleware - must be before other middleware
app.use(helmet());

// Trust first proxy if behind one (e.g., Vercel, Heroku)
app.set('trust proxy', 1);

const allowedOrigins = [
  "https://brayn-ai.vercel.app", // prod frontend
  "https://brayn-ai-git-feature-development-altafbalikais-projects.vercel.app", // preview frontend
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

// ✅ Handle preflight requests explicitly
app.options('*', cors());

// Rate limiting (global)
const limiter = rateLimit({
  windowMs:
    parseInt(process.env.RATE_LIMIT_WINDOW_MS || '15', 10) * 60 * 1000,

  max:
    process.env.NODE_ENV === 'production'
      ? parseInt(process.env.RATE_LIMIT_MAX || '100', 10)
      : parseInt(process.env.RATE_LIMIT_DEV_MAX || '1000', 10),

  skip: (req) =>
    req.path === '/api/auth/refresh' ||
    req.path === '/api/auth/me' ||
    req.path === '/api/health' ||
    req.path === '/metrics',

  standardHeaders: true,
  legacyHeaders: false,

  keyGenerator: (req) => {
    return req.ip; // ✅ safe after trust proxy
  },

  message: 'Too many requests, please try again later.',
});

// Apply rate limiting to all requests
app.use(limiter);

// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '15', 10) * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '5', 10),

  standardHeaders: true,
  legacyHeaders: false,

  keyGenerator: (req) => req.ip,

  message: 'Too many authentication attempts, please try again later.',
});

// enable JSON body parsing with size limit
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '10mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.URL_ENCODED_LIMIT || '10mb' }));
app.use(cookieParser());

// configure and enable CORS before routes
// const allowedOrigins = [
//   'http://localhost:3000',
//   'http://localhost:5173',
// ];

// define routes
// app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/conversations', convRoutes);
app.use('/api/llm', llmRoutes);
app.use('/api/summary', summaryRoutes);
app.use('/api/llm-models', llmmodelRoutes); // new LLM model routes

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
