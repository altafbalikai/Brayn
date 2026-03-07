// src/middlewares/validation.middleware.js
const { validationResult } = require('express-validator');
const logger = require('../config/logger');

/**
 * Middleware to handle validation errors
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorDetails = errors.array();
    console.error("❌ VALIDATION FAILED", {
      path: req.path,
      method: req.method,
      body: req.body,
      params: req.params,
      errors: errorDetails,
    });
    logger.warn('Validation errors:', {
      path: req.path,
      method: req.method,
      errors: errorDetails,
    });
    return res.status(400).json({
      error: 'Validation failed',
      details: errorDetails.map(err => ({
        field: err.path || err.param,
        message: err.msg,
        value: err.value,
      })),
    });
  }
  next();
}

module.exports = { handleValidationErrors };

