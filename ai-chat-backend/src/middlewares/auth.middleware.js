const { verifyAccessToken } = require('../utils/jwt');
const User = require('../models/User');

/**
 * Mandatory Authentication Middleware
 */
async function authenticate(req, res, next) {
  // 🔥 Allow CORS preflight requests
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  try {
    const h = req.headers.authorization;
    if (!h) return res.status(401).json({ error: 'Missing Authorization' });
    const parts = h.split(' ');
    if (parts.length !== 2) return res.status(401).json({ error: 'Invalid Authorization' });
    const token = parts[1];

    const payload = verifyAccessToken(token);
    // payload should contain { id, email, role, tokenVersion }
    const user = await User.findById(payload.id);
    if (!user) return res.status(401).json({ error: 'User not found' });

    // tokenVersion check (useful for invalidating issued tokens when password reset)
    if (payload.tokenVersion !== undefined && payload.tokenVersion !== user.tokenVersion) {
      return res.status(401).json({ error: 'Token revoked' });
    }

    // req.user = { id: user._id.toString(), email: user.email, role: user.role };
    req.user = {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Optional Authentication Middleware
 * Populates req.user if a valid token is present, but doesn't fail if missing.
 */
async function optionalAuth(req, res, next) {
  try {
    const h = req.headers.authorization;
    if (!h) return next();

    const parts = h.split(' ');
    if (parts.length !== 2) return next();
    const token = parts[1];

    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.id);
    if (!user) return next();

    if (payload.tokenVersion !== undefined && payload.tokenVersion !== user.tokenVersion) {
      return next();
    }

    req.user = {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
    };
    next();
  } catch (err) {
    // If token is invalid/expired, we just treat them as anonymous
    next();
  }
}

/**
 * Role-based authorization middleware
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Forbidden: required roles - [${roles.join(', ')}]`,
      });
    }
    next();
  };
}

module.exports = authenticate;
module.exports.authenticate = authenticate;
module.exports.optionalAuth = optionalAuth;
module.exports.authorize = authorize;

