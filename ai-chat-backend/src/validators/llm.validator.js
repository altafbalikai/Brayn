// src/validators/llm.validator.js
const { body } = require('express-validator');
const mongoose = require('mongoose');

const askValidation = [
  body('message')
    .notEmpty()
    .withMessage('Message is required')
    .trim()
    .isLength({ min: 1, max: 10000 })
    .withMessage('Message must be between 1 and 10000 characters'),
  body('conversationId')
    .notEmpty()
    .withMessage('Conversation ID is required')
    .custom((value) => {
      if (!mongoose.isValidObjectId(value)) {
        throw new Error('Invalid conversation ID format');
      }
      return true;
    }),
];

module.exports = {
  askValidation,
};

