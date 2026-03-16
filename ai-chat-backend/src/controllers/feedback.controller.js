// src/controllers/feedback.controller.js
const feedbackService = require('../services/feedback.service');

// ─── Submit / Toggle Feedback ──────────────────────────────────────────────────

/**
 * POST /api/messages/:messageId/feedback
 *
 * Body: { feedbackType, conversationId, reason?, tags? }
 *
 * • First-time: creates a new MessageFeedback document.
 * • Same type again (toggle off): deletes the existing feedback.
 * • Different type (switch): updates the existing feedback in place.
 * • Always syncs the denormalized counts on the parent Message.
 */
async function submitFeedback(req, res, next) {
    try {
        const userId = req.user.id;
        const { messageId } = req.params;
        const { feedbackType, conversationId, reason, tags } = req.body;
        const result = await feedbackService.submitFeedback({
            userId,
            messageId,
            conversationId,
            feedbackType,
            reason,
            tags,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        if (result?.body) {
            return res.status(result.status || 200).json(result.body);
        }

        res.status(200).json(result);
    } catch (err) {
        next(err);
    }
}

// ─── Get Feedback ──────────────────────────────────────────────────────────────

/**
 * GET /api/messages/:messageId/feedback
 *
 * Returns the requesting user's feedback (if any) together with aggregate stats.
 */
async function getFeedback(req, res, next) {
    try {
        const userId = req.user?.id || null;
        const { messageId } = req.params;
        const data = await feedbackService.getFeedback({ userId, messageId });
        res.status(200).json(data);
    } catch (err) {
        next(err);
    }
}

module.exports = {
    submitFeedback,
    getFeedback
};
