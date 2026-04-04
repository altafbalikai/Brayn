const express = require('express');
const router = express.Router();
const retryController = require('../controllers/retry.controller');
const feedbackController = require('../controllers/feedback.controller');
const copyController = require('../controllers/copy.controller');
const convController = require('../controllers/conversation.controller');
const { authenticate, optionalAuth } = require('../middlewares/auth.middleware');
const { handleValidationErrors } = require('../middlewares/validation.middleware');
const {
    switchVersionValidation,
    deleteVersionValidation
} = require('../validators/retry.validator');
const {
    submitFeedbackValidation,
    getFeedbackValidation
} = require('../validators/feedback.validator');
const { param } = require('express-validator');
const mongoose = require('mongoose');

// Shared validation for messageId param
const messageIdParam = [
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

/**
 * PATHS ARE RELATIVE TO /api/messages
 */

/**
 * POST /api/messages/:messageId/feedback
 * Submit or update feedback.
 */
router.post(
    '/:messageId/feedback',
    authenticate,
    submitFeedbackValidation,
    handleValidationErrors,
    feedbackController.submitFeedback
);

/**
 * GET /api/messages/:messageId/feedback
 * Get user feedback and aggregate stats.
 */
router.get(
    '/:messageId/feedback',
    optionalAuth,
    getFeedbackValidation,
    handleValidationErrors,
    feedbackController.getFeedback
);

/**
 * PATCH /api/messages/:messageId/version
 * Switch to a different version.
 */
router.patch(
    '/:messageId/version',
    authenticate,
    switchVersionValidation,
    handleValidationErrors,
    retryController.switchVersion
);

router.patch(
    '/:nodeId/activate',
    authenticate,
    [
        param('nodeId').isMongoId().withMessage('nodeId must be a valid MongoDB ObjectId'),
    ],
    handleValidationErrors,
    convController.activateNode
);

/**
 * DELETE /api/messages/:messageId/versions/:versionId
 * Delete a specific version.
 */
router.delete(
    '/:messageId/versions/:versionId',
    authenticate,
    deleteVersionValidation,
    handleValidationErrors,
    retryController.deleteVersion
);

/**
 * POST /api/messages/:messageId/copy
 * Track copy analytics.
 */
router.post(
    '/:messageId/copy',
    authenticate,
    messageIdParam,
    handleValidationErrors,
    copyController.trackMessageCopy
);

module.exports = router;
