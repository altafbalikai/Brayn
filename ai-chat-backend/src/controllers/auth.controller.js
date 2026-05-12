// controllers/auth.controller.js
const authService = require('../services/auth.service');
const HttpError = require('../utils/httpError');
const validator = require('validator');
const { setRefreshCookie, clearRefreshCookie } = require('../utils/cookie.helper');
const logger = require('../config/logger');

const REFRESH_COOKIE_NAME = process.env.REFRESH_COOKIE_NAME || 'refreshToken';
const REFRESH_COOKIE_SECURE = process.env.NODE_ENV === 'production';
const REFRESH_COOKIE_HTTPONLY = true;
const REFRESH_COOKIE_SAMESITE = process.env.REFRESH_COOKIE_SAMESITE || 'Strict'; // 'Lax' often useful for SPA flows
const REFRESH_COOKIE_MAX_AGE = parseInt(process.env.REFRESH_COOKIE_MAX_AGE || String(7 * 24 * 60 * 60 * 1000), 10);
const REFRESH_COOKIE_PATH = process.env.REFRESH_COOKIE_PATH || '/';
const REFRESH_COOKIE_DOMAIN = process.env.REFRESH_COOKIE_DOMAIN; // optional
// Toggle: if true, controller will include refreshToken in JSON body (not recommended in production)
const RETURN_REFRESH_IN_BODY = (process.env.RETURN_REFRESH_IN_BODY || 'false').toLowerCase() === 'true';

// Helper: normalize + sanitize an email
function normalizeEmail(email) {
  if (!email) return '';
  return validator.normalizeEmail(String(email).trim(), { gmail_remove_dots: false }) || String(email).trim().toLowerCase();
}
// small helpers to keep responses consistent
function badRequest(res, message = 'Bad Request', details = []) {
  return res.status(400).json({ error: message, details });
}
function unauthorized(res, message = 'Unauthorized') {
  return res.status(401).json({ error: message });
}
function conflict(res, message = 'Conflict') {
  return res.status(409).json({ error: message });
}
function sendJson(res, status, payload) {
  res.type('application/json');
  return res.status(status).json(payload);
}
// Audit log function using Winston
function auditLog(event, meta = {}) {
  // Do NOT log passwords or sensitive data
  const sanitizedMeta = { ...meta };
  if (sanitizedMeta.password) delete sanitizedMeta.password;
  if (sanitizedMeta.currentPassword) delete sanitizedMeta.currentPassword;
  if (sanitizedMeta.newPassword) delete sanitizedMeta.newPassword;

  logger.info(`[AUDIT] ${event}`, sanitizedMeta);
}

/* -------------------------
   Controller functions
   ------------------------- */
async function signup(req, res, next) {
  try {
    let { email, password, name } = req.body;
    // Normalized in signupValidation middleware with .normalizeEmail()
    name = (name || '').toString().trim();

    // anti-abuse hook (optional): check rate-limiter or captcha
    // if (req.rateLimit && req.rateLimit.remaining === 0) return res.status(429).json({ error: 'Too many requests' });

    const user = await authService.signup({ email, password, name });

    auditLog('user.signup', { userId: user._id.toString(), email });

    // RESTful: Location header for created resource
    res.location(`/users/${user._id}`);
    return sendJson(res, 201, { id: user._id, email: user.email, name: user.name });
  } catch (err) {
    if (err instanceof HttpError) {
      // Map expected HttpError codes; do not leak internal details.
      if (err.status === 409) return conflict(res, 'User already exists');
      return res.status(err.status).json({ error: err.message });
    }

    // Mongoose schema validation errors -> 400
    if (err && err.name === 'ValidationError' && err.errors) {
      const details = Object.keys(err.errors).map((k) => ({ field: k, message: err.errors[k].message }));
      return badRequest(res, 'Validation failed', details);
    }

    logger.error('[SIGNUP] unexpected error', {
      message: err?.message,
      stack: process.env.NODE_ENV === 'development' ? err?.stack : undefined,
    });
    return next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};

    // call service and wait for tokens + user
    const result = await authService.login({ email, password });
    // result expected shape: { user, accessToken, refreshToken }
    if (!result || !result.accessToken || !result.user) {
      // defensive: unexpected service response
      logger.error('[LOGIN] unexpected service response', { result: result ? 'present' : 'missing' });
      return res.status(500).json({ error: 'Authentication failed' });
    }

    // destructure after result is available
    const { user, accessToken, refreshToken } = result;

    // set refresh token as cookie (only if refreshToken present)
    if (refreshToken) {
      // setRefreshCookie should use the same cookie options as clearRefreshCookie
      setRefreshCookie(res, refreshToken);
    }

    // respond with user + access token (do NOT include refreshToken when using cookie mode)
    return res.json({
      user: { id: user._id, email: user.email, name: user.name, role: user.role },
      accessToken
    });
  } catch (err) {
    // map known service errors or let global handler handle unexpected ones
    if (err instanceof HttpError) {
      return res.status(err.status || 400).json({ error: err.message });
    }
    logger.error('[LOGIN] unexpected error', {
      message: err?.message,
      stack: process.env.NODE_ENV === 'development' ? err?.stack : undefined,
    });
    return next(err);
  }
}

async function me(req, res) {
  res.json(req.user);
}

async function refresh(req, res, next) {
  try {
    // prefer cookie, fallback to body
    const incomingRefresh = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;
    if (!incomingRefresh) {
      return unauthorized(res, 'Unauthorized');
    }

    // call service to rotate / validate
    const { accessToken, refreshToken: newRefresh, user } = await authService.refreshTokens(incomingRefresh);

    // rotate cookie when backend produced a new refresh token
    if (newRefresh) {
      // setRefreshCookie should encapsulate cookie options (httpOnly, sameSite, secure, path, maxAge)
      setRefreshCookie(res, newRefresh);
    }

    // audit (do not include token values)
    try {
      auditLog('token.refresh', { userId: user._id.toString(), ip: req.ip });
    } catch (auditErr) {
      // do not break the flow for audit failures; just log server-side
      logger.warn('[REFRESH] audit failed', {
        message: auditErr?.message,
      });
    }

    // If you're using cookie-mode for refresh tokens, don't send the token in JSON.
    // Return only access token + user. If you explicitly want the refresh token in the body,
    // include `refreshToken: newRefresh` here (but avoid doing that in production).
    return sendJson(res, 200, {
      user: { id: user._id, email: user.email, name: user.name },
      accessToken
    });
  } catch (err) {
    // expected authentication failures -> 401
    if (
      err &&
      (err.code === 'INVALID_REFRESH_TOKEN' ||
        err.code === 'REFRESH_NOT_FOUND' ||
        (err instanceof HttpError && err.status === 401))
    ) {
      return unauthorized(res, 'Invalid or expired refresh token');
    }

    // unexpected -> log and forward
    logger.error('[REFRESH] unexpected error', {
      message: err?.message,
      stack: process.env.NODE_ENV === 'development' ? err?.stack : undefined,
    });
    return next(err);
  }
}

async function logout(req, res, next) {
  try {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;
    if (!refreshToken) return badRequest(res, 'refreshToken required');

    await authService.revokeRefreshToken(refreshToken);

    // clear cookie
    clearRefreshCookie(res);

    auditLog('user.logout', { ip: req.ip });

    // 204 No Content — logout succeeded
    return res.status(204).send();
  } catch (err) {
    logger.error('[LOGOUT] unexpected error', {
      message: err?.message,
      stack: process.env.NODE_ENV === 'development' ? err?.stack : undefined,
    });
    return next(err);
  }
}

// POST /auth/request-password-reset
async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;
    // optional: pass origin so the service can build frontend link
    const origin = req.headers.origin || req.body.origin;
    await authService.forgotPassword({ email, origin });
    // Always return 200 OK to avoid user enumeration
    return res.json({ ok: true });
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    logger.error('[forgotPassword] unexpected error', {
      message: err?.message,
      stack: process.env.NODE_ENV === 'development' ? err?.stack : undefined,
    });
    return next(err);
  }
}

// POST /auth/reset-password
async function resetPasswordController(req, res, next) {
  try {
    const { token, newPassword } = req.body;
    await authService.resetPassword({ token, newPassword });
    return res.json({ ok: true });
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    logger.error('[PASSWORD_RESET] unexpected error', {
      message: err?.message,
      stack: process.env.NODE_ENV === 'development' ? err?.stack : undefined,
    });
    return next(err);
  }
}

// POST /auth/change-password (authenticated route)
// expects req.user.id (ensure your auth middleware sets req.user)
async function changePasswordController(req, res, next) {
  try {
    const userId = req.user && req.user.id;
    const { currentPassword, newPassword } = req.body;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    await authService.changePassword({ userId, currentPassword, newPassword });
    return res.json({ ok: true });
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    logger.error('[CHANGE_PASSWORD] unexpected error', {
      message: err?.message,
      stack: process.env.NODE_ENV === 'development' ? err?.stack : undefined,
    });
    return next(err);
  }
}

async function googleAuth(req, res, next) {
  try {
    const { credential } = req.body || {};
    const result = await authService.googleAuth({ credential });
    const { user, accessToken, refreshToken } = result;

    if (refreshToken) {
      setRefreshCookie(res, refreshToken);
    }

    auditLog('user.google_auth', { userId: user._id.toString(), email: user.email });

    return res.json({
      user: { id: user._id, email: user.email, name: user.name, role: user.role },
      accessToken,
    });
  } catch (err) {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message });
    }
    logger.error('[GOOGLE_AUTH] unexpected error', {
      message: err?.message,
      stack: process.env.NODE_ENV === 'development' ? err?.stack : undefined,
    });
    return next(err);
  }
}

module.exports = {
  signup, login, me, refresh, logout,
  forgotPassword,
  resetPasswordController,
  changePasswordController,
  googleAuth
};

