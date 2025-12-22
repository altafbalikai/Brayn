// src/validators/conversation.validator.js
const { body, param, query } = require('express-validator');
const mongoose = require('mongoose');

const createConversationValidation = [
  body('agentId')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Agent ID must be less than 100 characters'),
  body('title')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Title must be less than 200 characters'),
];

const listConversationsValidation = [
  query('agent')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Agent filter must be less than 100 characters'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 200 })
    .withMessage('Limit must be between 1 and 200'),
];

const conversationIdValidation = [
  param('cid')
    .notEmpty()
    .withMessage('Conversation ID is required')
    .custom((value) => {
      if (!mongoose.isValidObjectId(value)) {
        throw new Error('Invalid conversation ID format');
      }
      return true;
    }),
];

const addMessageValidation = [
  ...conversationIdValidation,
  body('text')
    .notEmpty()
    .withMessage('Message text is required')
    .trim()
    .isLength({ min: 1, max: 10000 })
    .withMessage('Message text must be between 1 and 10000 characters'),
  body('role')
    .optional()
    .isIn(['user', 'assistant', 'system'])
    .withMessage('Role must be one of: user, assistant, system'),
];

const getMessagesValidation = [
  ...conversationIdValidation,
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 200 })
    .withMessage('Limit must be between 1 and 200'),
];

module.exports = {
  createConversationValidation,
  listConversationsValidation,
  addMessageValidation,
  getMessagesValidation,
};

