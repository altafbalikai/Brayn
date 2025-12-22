// src/middlewares/validation.middleware.js
const { validationResult } = require('express-validator');
const logger = require('../config/logger');

/**
 * Middleware to handle validation errors
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn('Validation errors:', {
      path: req.path,
      method: req.method,
      errors: errors.array(),
    });
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map(err => ({
        field: err.path || err.param,
        message: err.msg,
        value: err.value,
      })),
    });
  }
  next();
}

module.exports = { handleValidationErrors };

