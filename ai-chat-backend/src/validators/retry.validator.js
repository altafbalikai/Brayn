// src/validators/retry.validator.js
const { body, param } = require('express-validator');
const mongoose = require('mongoose');

// ─── Shared: ObjectId param validator ──────────────────────────────────────────
const objectIdParam = (name, label) => [
    param(name)
        .notEmpty()
        .withMessage(`${label} is required`)
        .custom((value) => {
            if (!mongoose.isValidObjectId(value)) {
                throw new Error(`Invalid ${label} format`);
            }
            return true;
        }),
];

// ─── POST /api/conversations/:conversationId/messages/:messageId/retry ─────────
const retryMessageValidation = [
    ...objectIdParam('conversationId', 'conversationId'),
    ...objectIdParam('messageId', 'messageId'),
];

// ─── PATCH /api/messages/:messageId/version ────────────────────────────────────
const switchVersionValidation = [
    ...objectIdParam('messageId', 'messageId'),

    body('versionId')
        .optional()
        .custom((value) => {
            if (!mongoose.isValidObjectId(value)) {
                throw new Error('Invalid versionId format');
            }
            return true;
        }),

    body('versionNumber')
        .optional()
        .isInt({ min: 1 })
        .withMessage('versionNumber must be a positive integer'),

    // At least one of versionId or versionNumber must be present
    body()
        .custom((value) => {
            if (!value.versionId && !value.versionNumber) {
                throw new Error('Provide either versionId or versionNumber');
            }
            return true;
        }),
];

// ─── DELETE /api/messages/:messageId/versions/:versionId ───────────────────────
const deleteVersionValidation = [
    ...objectIdParam('messageId', 'messageId'),
    ...objectIdParam('versionId', 'versionId'),
];

module.exports = {
    retryMessageValidation,
    switchVersionValidation,
    deleteVersionValidation
};
