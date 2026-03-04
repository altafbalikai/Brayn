require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const logger = require('./config/logger');

const authRoutes = require('./routes/auth.routes');
const convRoutes = require('./routes/conversation.routes');
const llmRoutes = require('./routes/llm.routes');
const summaryRoutes = require('./routes/summary.routes');
const llmmodelRoutes = require('./routes/llmmodel.routes');
const promptSettingsRoutes = require('./routes/promptSettings.routes')
const userMemoryRoutes = require('./routes/userMemory.routes');
const personaRoutes = require('./routes/persona.routes');
const messageRoutes = require('./routes/messages.routes');

const app = express();

// Security middleware - must be before other middleware
app.use(helmet());

// Trust first proxy if behind one (e.g., Vercel, Heroku)
app.set('trust proxy', 1);

const isAllowedOrigin = (origin) => {
  if (!origin) return true; // Postman, server-to-server

  // Local development
  if (
    origin === "http://localhost:3000" ||
    origin === "http://localhost:5173" ||
    origin === "http://localhost:4000"
  ) {
    return true;
  }

  // Production frontend (custom domain)
  if (origin === "https://brayn-ai.vercel.app") {
    return true;
  }

  // ✅ ALL Vercel preview deployments of YOUR project
  if (origin.endsWith("-altafbalikais-projects.vercel.app")) {
    return true;
  }

  return false;
};


// Dynamic CORS for Vercel + local dev
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (Postman, server-to-server)
      if (!origin) return callback(null, true);

      // Allow local dev
      if (isAllowedOrigin(origin)) {
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
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With', 'X-Request-Idempotency-Key'],
  })
);

// ✅ Handle preflight requests explicitly
app.options(/.*/, cors());
// Rate limiting (global)
const limiter = process.env.NODE_ENV === 'test'
  ? null
  : rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '15', 10) * 60 * 1000,
    max: process.env.NODE_ENV === 'production'
      ? parseInt(process.env.RATE_LIMIT_MAX || '100', 10)
      : parseInt(process.env.RATE_LIMIT_DEV_MAX || '1000', 10),
    skip: (req) =>
      req.path === '/api/auth/refresh' ||
      req.path === '/api/auth/me' ||
      req.path === '/api/health' ||
      req.path === '/metrics',
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: ipKeyGenerator,
    message: 'Too many requests, please try again later.',
  });

if (limiter) {
  app.use(limiter);
}

// Stricter rate limiting for auth endpoints
const authLimiter = process.env.NODE_ENV === 'test'
  ? null
  : rateLimit({
    windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '15', 10) * 60 * 1000,
    max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '5', 10),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: ipKeyGenerator,
    message: 'Too many authentication attempts, please try again later.',
  });

const authLimitMiddleware = authLimiter ? authLimiter : (req, res, next) => next();

// enable JSON body parsing with size limit
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '10mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.URL_ENCODED_LIMIT || '10mb' }));
app.use(cookieParser());

// configure and enable CORS before routes
// const allowedOrigins = [
//   'http://localhost:3000',
//   'http://localhost:5173',
// ];

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
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

// define routes
app.use('/api/auth/login', authLimitMiddleware);
app.use('/api/auth/signup', authLimitMiddleware);
app.use('/api/auth/reset-password', authLimitMiddleware);
app.use('/api/auth/forgot-password', authLimitMiddleware);
app.use('/api/auth', authRoutes);
app.use('/api/conversations', convRoutes);
app.use('/api/llm', llmRoutes);
app.use('/api/summary', summaryRoutes);
app.use('/api', llmmodelRoutes); // Using /api to support /admin and /llm-models namespaces
app.use('/api/prompt-settings', promptSettingsRoutes);
app.use('/api/user/memory', userMemoryRoutes);
app.use('/api/personas', personaRoutes);
app.use('/api/messages', messageRoutes);

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
// app.use((err, req, res, next) => {
//   logger.error('Error:', {
//     message: err.message,
//     stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
//     status: err.status,
//     path: req.path,
//     method: req.method,
//   });
//   res
//     .status(err.status || 500)
//     .json({ error: err.message || 'Internal Server Error' });
// });

app.use((err, req, res, next) => {
  // ✅ Ensure CORS headers are always present
  const origin = req.headers.origin;
  if (origin && origin.endsWith("-altafbalikais-projects.vercel.app")) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }

  if (origin === "https://brayn-ai.vercel.app") {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }

  logger.error("Error:", {
    message: err.message,
    status: err.status,
    path: req.path,
  });

  res.status(err.status || 500).json({
    error: err.message || "Internal Server Error",
  });
});


module.exports = app;
