// src/validators/feedback.validator.js
const { body, param } = require('express-validator');
const mongoose = require('mongoose');

// ─── Shared: validate messageId param ──────────────────────────────────────────
const messageIdValidation = [
    param('messageId')
        .notEmpty()
        .withMessage('messageId is required')
        .custom((value) => {
            if (!mongoose.isValidObjectId(value)) {
                throw new Error('Invalid messageId format');
            }
            return true;
        }),
];

// ─── POST /api/messages/:messageId/feedback ────────────────────────────────────
const submitFeedbackValidation = [
    ...messageIdValidation,

    body('feedbackType')
        .notEmpty()
        .withMessage('feedbackType is required')
        .isIn(['positive', 'negative', 'neutral'])
        .withMessage('feedbackType must be one of: positive, negative, neutral'),

    body('conversationId')
        .optional()
        .custom((value) => {
            if (!mongoose.isValidObjectId(value)) {
                throw new Error('Invalid conversationId format');
            }
            return true;
        }),

    body('reason')
        .optional()
        .trim()
        .isLength({ max: 1000 })
        .withMessage('Reason must be less than 1000 characters'),

    body('tags')
        .optional()
        .isArray()
        .withMessage('Tags must be an array'),

    body('tags.*')
        .optional()
        .isString()
        .withMessage('Each tag must be a string')
        .trim()
        .isLength({ max: 50 })
        .withMessage('Each tag must be less than 50 characters'),
];

// ─── GET /api/messages/:messageId/feedback ─────────────────────────────────────
const getFeedbackValidation = [
    ...messageIdValidation,
];

module.exports = {
    submitFeedbackValidation,
    getFeedbackValidation
};
