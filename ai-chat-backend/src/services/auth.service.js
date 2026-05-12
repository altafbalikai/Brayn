// services/auth.service.js
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const dayjs = require('dayjs');
const validator = require('validator'); // npm i validator
const ms = require('ms'); // npm i ms
const mongoose = require('mongoose');
const { OAuth2Client } = require('google-auth-library');
const logger = require('../config/logger');

const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const PasswordResetToken = require('../models/PasswordResetToken');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const HttpError = require('../utils/httpError');
const mailer = require('../utils/mailer'); // implement sendPasswordResetEmail(email, link)
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);
const REFRESH_TOKEN_EXPIRES = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';
const REFRESH_TOKEN_EXPIRES_MS = parseDurationToMs(REFRESH_TOKEN_EXPIRES) || 7 * 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TOKEN_EXPIRES = process.env.PASSWORD_RESET_TOKEN_EXPIRES || '1h'; // e.g. 1h
const PASSWORD_RESET_TOKEN_EXPIRES_MS = parseDurationToMs(process.env.PASSWORD_RESET_TOKEN_EXPIRES || '1h') || 3600_000;

// --- safe transaction & optional-session helpers ----------------
/**
 * Attempts to start a real transaction; returns session or null.
 * Does NOT throw when transactions are unsupported (standalone mongod).
 */
async function safeStartTransaction() {
  // immediate opt-out via env var (useful for dev or standalone mongod)
  if (process.env.DISABLE_MONGO_TRANSACTIONS === 'true') {
    return null;
  }

  let session;
  try {
    session = await mongoose.startSession();
  } catch (e) {
    return null;
  }
  try {
    session.startTransaction();
    return session;
  } catch (e) {
    try { await session.endSession(); } catch (_) { /* ignore */ }
    return null;
  }
}

/**
 * UpdateMany that only passes session option when session exists.
 */
async function updateManyOptionalSession(Model, filter, update, session, options = {}) {
  if (session) {
    const opts = Object.assign({}, options, { session });
    return Model.updateMany(filter, update, opts);
  }
  return Model.updateMany(filter, update, options);
}

function normalizeEmail(email) {
  return validator.normalizeEmail(String(email || '').trim(), { gmail_remove_dots: false }) || String(email || '').trim().toLowerCase();
}

function ensurePasswordPolicy(password) {
  // simple policy: min 8 chars. You can plug zxcvbn for strength checks.
  if (!password || String(password).length < 8) {
    throw new HttpError('Password must be at least 8 characters long.', 400, 'WEAK_PASSWORD');
  }
}

async function signup({ email, name, password }) {
  email = normalizeEmail(email);
  if (!validator.isEmail(email)) throw new HttpError('Invalid email', 400, 'INVALID_EMAIL');
  ensurePasswordPolicy(password);

  // Do not reveal whether user exists in high-security apps — but on signup it's ok to return 409
  const existing = await User.findOne({ email }).lean();
  if (existing) throw new HttpError('User already exists', 409, 'USER_EXISTS');

  const user = new User({
    email,
    name: String(name || '').trim(),
    // default role etc.
  });

  // assume User model has setPassword helper that salts + hashes
  await user.setPassword(password);
  await user.save();

  // Optionally enqueue email verification here (send verification link)
  return user;
}

async function login({ email, password }) {
  email = normalizeEmail(email);
  if (!validator.isEmail(email)) {
    // generic message to avoid user enumeration
    throw new HttpError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }
  if (!password) throw new HttpError('Invalid credentials', 401, 'INVALID_CREDENTIALS');

  const user = await User.findOne({ email });
  if (!user) {
    // generic message
    throw new HttpError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  const ok = await user.validatePassword(password);
  if (!ok) {
    // optionally increment failed login counter and lock account after N tries
    // user.incrementFailedLogins && await user.incrementFailedLogins()
    throw new HttpError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  // Optionally reset failed login counter here on success

  // access token payload - avoid embedding secrets
  const accessToken = signAccessToken({
    id: user._id.toString(),
    email: user.email,
    role: user.role,
    tokenVersion: user.tokenVersion // supports forced logout if you bump tokenVersion
  });

  const { refreshToken } = await createRefreshTokenForUser(user);
  logger.debug('Refresh token created for user', { userId: user._id.toString() });
  return { user, accessToken, refreshToken };
}

async function createRefreshTokenForUser(user, session = null) {
  // Generate a random token id (jti)
  const jti = crypto.randomBytes(32).toString('hex');
  // Hash the token id before storing (we store only hash)
  const tokenHash = await bcrypt.hash(jti, BCRYPT_ROUNDS);

  const expiresIn = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';
  const expiresMs = parseDurationToMs(expiresIn);

  let expiresAt;
  if (expiresMs > 0) {
    expiresAt = dayjs().add(expiresMs, 'ms').toDate();
  } else {
    expiresAt = dayjs().add(7, 'day').toDate();
  }

  // create document using session if provided (so it participates in transaction)
  if (session) {
    // use Model.create with session option or create + save with session
    const doc = new RefreshToken({
      userId: user._id,
      tokenHash,
      jti,
      expiresAt
    });
    await doc.save({ session });
  } else {
    await RefreshToken.create({
      userId: user._id,
      tokenHash,
      jti,
      expiresAt
    });
  }

  // sign refresh token JWT containing jti & userId
  const refreshToken = signRefreshToken({ id: user._id.toString(), jti });

  return { refreshToken, jti };
}

// Rotate refresh tokens - atomic using mongoose session
// Rotate refresh tokens - session-safe
// Rotate refresh tokens - session-safe, robust, and production-friendly
async function refreshTokens(refreshTokenStr) {
  // refreshTokenStr may be provided from request body or cookie at controller level
  if (!refreshTokenStr) {
    const e = new HttpError('Unauthorized', 401, 'MISSING_REFRESH_TOKEN');
    throw e;
  }

  let payload;
  try {
    payload = verifyRefreshToken(refreshTokenStr);
  } catch (err) {
    // JWT verify failed -> invalid token
    const e = new HttpError('Invalid refresh token (verify failed)', 401, 'INVALID_REFRESH_TOKEN');
    throw e;
  }

  const { id: userId, jti } = payload || {};
  if (!userId || !jti) {
    throw new HttpError('Invalid refresh token payload', 401, 'INVALID_REFRESH_TOKEN');
  }

  // Try to start a real transaction; safeStartTransaction returns null if unsupported
  const session = await safeStartTransaction(); // may be null
  const usedTransaction = !!session;

  try {
    // Query matching non-revoked tokens for this user (attach session only if available)
    let candidatesQuery = RefreshToken.find({ userId, revoked: false }).sort({ createdAt: -1 });
    if (usedTransaction) candidatesQuery = candidatesQuery.session(session);
    const candidates = await candidatesQuery.exec();

    // find the record whose hashed jti matches (and is not expired)
    let tokenRecord = null;
    for (const rec of candidates) {
      if (rec.expiresAt && rec.expiresAt < new Date()) continue;
      // compare hashed jti -> tokenHash using bcrypt
      // eslint-disable-next-line no-await-in-loop
      const match = await bcrypt.compare(jti, rec.tokenHash);
      if (match) {
        tokenRecord = rec;
        break;
      }
    }

    // no matching record -> not found or revoked
    if (!tokenRecord) {
      if (usedTransaction && session) {
        try { await session.abortTransaction(); } catch (_) { /* ignore */ }
        try { await session.endSession(); } catch (_) { /* ignore */ }
      }
      throw new HttpError('Refresh token not found or revoked', 401, 'REFRESH_NOT_FOUND');
    }

    // If token found but already revoked (defensive)
    if (tokenRecord.revoked) {
      if (usedTransaction && session) {
        try { await session.abortTransaction(); } catch (_) { /* ignore */ }
        try { await session.endSession(); } catch (_) { /* ignore */ }
      }
      throw new HttpError('Refresh token already revoked', 401, 'REFRESH_REVOKED');
    }

    // mark old token revoked & update lastUsedAt (use session if available)
    tokenRecord.revoked = true;
    tokenRecord.lastUsedAt = new Date();
    if (usedTransaction && session) await tokenRecord.save({ session });
    else await tokenRecord.save();

    // fetch user (attach session if available)
    let userQuery = User.findById(userId);
    if (usedTransaction && session) userQuery = userQuery.session(session);
    const user = await userQuery.exec();

    if (!user) {
      if (usedTransaction && session) {
        try { await session.abortTransaction(); } catch (_) { /* ignore */ }
        try { await session.endSession(); } catch (_) { /* ignore */ }
      }
      throw new HttpError('User not found', 401, 'USER_NOT_FOUND');
    }

    // Optionally bump tokenVersion to force logout across devices when necessary
    // (uncomment if you want refresh rotation to also invalidate older access tokens)
    // user.tokenVersion = (user.tokenVersion || 0) + 1;
    // if (usedTransaction && session) await user.save({ session }); else await user.save();

    // create new tokens (createRefreshTokenForUser accepts optional session)
    const accessToken = signAccessToken({
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion
    });

    const { refreshToken, jti: newJti } = await createRefreshTokenForUser(user, session);

    // commit transaction if used
    if (usedTransaction && session) {
      await session.commitTransaction();
      await session.endSession();
    }

    // return the new tokens and the user object (lean if you want to strip fields)
    return { accessToken, refreshToken, user };
  } catch (err) {
    // cleanup if transaction was used
    if (usedTransaction && session) {
      try { await session.abortTransaction(); } catch (_) { /* ignore */ }
      try { await session.endSession(); } catch (_) { /* ignore */ }
    }
    // Rethrow the error so controller can map codes -> status
    throw err;
  }
}

async function revokeRefreshToken(refreshTokenStr) {
  // verify signature first - but don't throw raw errors
  let payload;
  try {
    payload = verifyRefreshToken(refreshTokenStr);
  } catch (err) {
    return false;
  }
  const { id: userId, jti } = payload || {};
  if (!userId || !jti) return false;

  // find candidates for user and compare hashed jti (we avoid raw jti storage)
  const candidates = await RefreshToken.find({ userId });
  for (const rec of candidates) {
    // eslint-disable-next-line no-await-in-loop
    const match = await bcrypt.compare(jti, rec.tokenHash);
    if (match) {
      rec.revoked = true;
      await rec.save();
      return true;
    }
  }
  return false;
}

function parseDurationToMs(s) {
  if (!s) return 0;
  try {
    // prefer ms package
    const val = ms(s);
    if (typeof val === 'number') return val;
  } catch (e) { /* ignore */ }

  // fallback to custom parsing like "7d", "15m", "1h"
  const m = /^(\d+)([mhd])$/.exec(s);
  if (m) {
    const num = parseInt(m[1], 10);
    const unit = m[2];
    switch (unit) {
      case 'm': return num * 60 * 1000;
      case 'h': return num * 60 * 60 * 1000;
      case 'd': return num * 24 * 60 * 60 * 1000;
      default: return 0;
    }
  }
  const parsed = parseInt(s, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * forgotPassword - Request password reset (no user enumeration).
 * - Invalidates old reset tokens
 * - Creates a single-use, time-bound token
 * - Sends reset email
 */
async function forgotPassword({ email, origin }) {
  if (!email) {
    throw new HttpError('Invalid request', 400, 'INVALID_REQUEST');
  }

  const user = await User.findOne({ email });

  // Always return success (avoid enumeration)
  if (!user) {
    return { ok: true };
  }

  // Invalidate previous unused tokens for this user
  await PasswordResetToken.updateMany(
    { userId: user._id, used: false },
    { $set: { used: true, usedAt: new Date() } }
  );

  // Generate secure token
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = await bcrypt.hash(rawToken, BCRYPT_ROUNDS);

  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_EXPIRES_MS);

  await PasswordResetToken.create({
    userId: user._id,
    tokenHash,
    expiresAt,
    used: false,
  });

  const frontendOrigin =
    origin || process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
  const resetPath = process.env.PASSWORD_RESET_PATH || '/reset-password';

  const resetUrl = `${frontendOrigin.replace(/\/$/, '')}${resetPath}?token=${rawToken}`;

  try {
    await mailer.sendPasswordResetEmail(user.email, resetUrl, {
      name: user.name || '',
    });
  } catch (err) {
    logger.error('[forgotPassword] email failed', {
      message: err?.message,
      userId: user._id.toString(),
    });
  }

  return { ok: true };
}

/**
 * Reset password using email token.
 * - Validates token (hashed)
 * - Sets new password
 * - Revokes refresh tokens
 * - Invalidates all auth sessions
 */
async function resetPassword({ token: rawToken, newPassword }) {
  if (!rawToken || !newPassword) {
    logger.warn('[resetPassword] missing parameters', { hasToken: !!rawToken, hasPassword: !!newPassword });
    throw new HttpError('Invalid request', 400, 'INVALID_REQUEST');
  }


  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    throw new HttpError('Password too weak', 400, 'WEAK_PASSWORD');
  }

  const now = new Date();

  // Fetch recent valid tokens for this user only
  const candidates = await PasswordResetToken.find({
    used: false,
    expiresAt: { $gt: now },
  })
    .sort({ createdAt: -1 })
    .limit(10);

  let tokenRecord = null;

  for (const record of candidates) {
    if (await bcrypt.compare(rawToken, record.tokenHash)) {
      tokenRecord = record;
      break;
    }
  }

  if (!tokenRecord) {
    throw new HttpError(
      'Invalid or expired password reset token',
      400,
      'INVALID_RESET_TOKEN'
    );
  }
  const userId = tokenRecord.userId;
  const session = await safeStartTransaction();
  const useTxn = !!session;

  try {
    const user = useTxn
      ? await User.findById(userId).session(session)
      : await User.findById(userId);

    if (!user) {
      throw new HttpError('User not found', 400, 'USER_NOT_FOUND');
    }

    // Mark token as used
    tokenRecord.used = true;
    tokenRecord.usedAt = new Date();
    await tokenRecord.save(useTxn ? { session } : undefined);

    // Set new password
    await user.setPassword(newPassword);
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save(useTxn ? { session } : undefined);

    // Revoke all refresh tokens
    await RefreshToken.updateMany(
      { userId: user._id },
      { $set: { revoked: true } },
      useTxn ? { session } : undefined
    );

    if (useTxn) {
      await session.commitTransaction();
      await session.endSession();
    }

    // Notify user (best effort)
    try {
      await mailer.sendPasswordChangedNotification(user.email, {
        name: user.name || '',
      });
    } catch (e) {
      logger.warn('[resetPassword] email notification failed', {
        message: e?.message,
      });
    }

    return { ok: true };
  } catch (err) {
    if (useTxn && session) {
      try {
        await session.abortTransaction();
        await session.endSession();
      } catch (_) { }
    }
    throw err;
  }
}


/**
 * changePassword for logged-in user (must pass current password)
 */
async function changePassword({ userId, currentPassword, newPassword }) {
  if (!userId || !currentPassword || !newPassword) {
    throw new HttpError('Invalid request', 400, 'INVALID_REQUEST');
  }
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    throw new HttpError('Password must be at least 8 characters long', 400, 'WEAK_PASSWORD');
  }
  const user = await User.findById(userId);
  if (!user) {
    throw new HttpError('User not found', 404, 'USER_NOT_FOUND');
  }

  const ok = await user.validatePassword(currentPassword);
  if (!ok) {
    // increment failed attempt counters if you have them
    throw new HttpError('Current password is incorrect', 401, 'INVALID_CREDENTIALS');
  }

  // Everything fine — update password & revoke refresh tokens
  user.setPassword && await user.setPassword(newPassword);
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();

  // revoke refresh tokens
  await revokeAllRefreshTokensForUser(user._id);

  // notify user
  try {
    await mailer.sendPasswordChangedNotification(user.email, { name: user.name });
  } catch (e) {
    logger.warn('Failed to send password changed notification', {
      message: e?.message,
      userId: user._id.toString(),
    });
  }

  return { ok: true };
}

/**
 * Revoke all refresh tokens for a user (mark revoked = true)
 * Accepts optional mongoose session for transactional use.
 */
// Revoke all refresh tokens for a user (supports optional session)
async function revokeAllRefreshTokensForUser(userId, session = null) {
  if (session) {
    return RefreshToken.updateMany({ userId }, { $set: { revoked: true } }, { session });
  }
  return RefreshToken.updateMany({ userId }, { $set: { revoked: true } });
}

async function googleAuth({ credential }) {
  if (!GOOGLE_CLIENT_ID) {
    throw new HttpError('Google auth not configured', 500, 'GOOGLE_NOT_CONFIGURED');
  }
  if (!credential) {
    throw new HttpError('Missing credential', 400, 'MISSING_CREDENTIAL');
  }

  let ticket;
  try {
    ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
  } catch (err) {
    logger.warn('[googleAuth] token verification failed', { message: err?.message });
    throw new HttpError('Invalid Google token', 401, 'INVALID_GOOGLE_TOKEN');
  }

  const payload = ticket.getPayload();
  const { sub: googleId, email, name, email_verified } = payload;

  if (!email_verified) {
    throw new HttpError('Google email not verified', 400, 'UNVERIFIED_EMAIL');
  }

  const normalizedEmail = normalizeEmail(email);
  let user = await User.findOne({ email: normalizedEmail });

  if (user) {
    if (!user.googleId) {
      // link Google account to existing email account
      user.googleId = googleId;
      await user.save();
      logger.info('[googleAuth] linked Google account to existing user', { userId: user._id.toString() });
    } else if (user.googleId !== googleId) {
      throw new HttpError('Account conflict', 409, 'ACCOUNT_CONFLICT');
    }
  } else {
    try {
      user = await User.create({
        email: normalizedEmail,
        name: String(name || '').trim(),
        googleId,
      });
    } catch (err) {
      if (err.code === 11000) {
        user = await User.findOne({ email: normalizedEmail });
        if (!user) throw new HttpError('Account creation failed', 500, 'CREATE_FAILED');
        if (!user.googleId) {
          user.googleId = googleId;
          await user.save();
        }
      } else {
        throw err;
      }
    }
    logger.info('[googleAuth] created new user via Google', { userId: user._id.toString() });
  }

  const accessToken = signAccessToken({
    id: user._id.toString(),
    email: user.email,
    role: user.role,
    tokenVersion: user.tokenVersion,
  });

  const { refreshToken } = await createRefreshTokenForUser(user);

  return { user, accessToken, refreshToken };
}

module.exports = {
  signup,
  login,
  refreshTokens,
  revokeRefreshToken,
  forgotPassword,
  resetPassword,
  changePassword,
  revokeAllRefreshTokensForUser,
  googleAuth
};

