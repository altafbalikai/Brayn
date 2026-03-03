// src/controllers/feedback.controller.js
const mongoose = require('mongoose');
const Message = require('../models/Message');
const MessageFeedback = require('../models/MessageFeedback');
const logger = require('../config/logger');

// ─── Valid feedback types ──────────────────────────────────────────────────────
const VALID_FEEDBACK_TYPES = ['positive', 'negative', 'neutral'];

// ─── Helper ────────────────────────────────────────────────────────────────────

/**
 * Recalculate and persist the denormalized feedback counts on a Message.
 * Reads from the MessageFeedback collection so counts stay in sync even if
 * direct edits or races occur.
 *
 * @param {ObjectId} messageId
 * @param {string|null} userFeedbackType - the requesting user's current feedback
 */
async function syncMessageFeedbackStats(messageId, userFeedbackType) {
    const stats = await MessageFeedback.getStatsByMessage(messageId);
    await Message.findByIdAndUpdate(messageId, {
        $set: {
            'feedback.positive': stats.positive,
            'feedback.negative': stats.negative,
            'feedback.userFeedback': userFeedbackType
        }
    });
}

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

        // ── 1. Look up the parent message ──────────────────────────────────────
        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ error: 'Message not found' });
        }

        // ── 2. Check for existing feedback ─────────────────────────────────────
        const existing = await MessageFeedback.getUserFeedback(userId, messageId);

        let feedback;

        if (existing) {
            if (existing.feedbackType === feedbackType) {
                // Same type clicked again → toggle OFF (remove feedback)
                await MessageFeedback.findByIdAndDelete(existing._id);

                // Sync counts (user now has no feedback)
                await syncMessageFeedbackStats(messageId, null);

                return res.status(200).json({
                    success: true,
                    toggled: true,
                    message: 'Feedback removed',
                    feedback: null,
                    stats: await MessageFeedback.getStatsByMessage(messageId)
                });
            }

            // Different type → update in place
            existing.feedbackType = feedbackType;
            if (reason !== undefined) existing.reason = reason;
            if (tags !== undefined) existing.tags = tags;
            feedback = await existing.save();
        } else {
            // ── 3. Create new feedback ───────────────────────────────────────────
            feedback = await MessageFeedback.create({
                messageId,
                userId,
                conversationId: conversationId || message.conversationId,
                feedbackType,
                reason,
                tags,
                ipAddress: req.ip,
                userAgent: req.get('User-Agent')
            });
        }

        // ── 4. Sync denormalized counts on Message ─────────────────────────────
        await syncMessageFeedbackStats(messageId, feedbackType);

        // ── 5. Respond ─────────────────────────────────────────────────────────
        const stats = await MessageFeedback.getStatsByMessage(messageId);

        res.status(existing ? 200 : 201).json({
            success: true,
            userFeedback: feedback.feedbackType,
            feedback: feedback.toJSON(),
            stats
        });
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

        // ── 1. Verify message exists ───────────────────────────────────────────
        const messageExists = await Message.exists({ _id: messageId });
        if (!messageExists) {
            return res.status(404).json({ error: 'Message not found' });
        }

        // ── 2. Fetch user's own feedback (if authenticated) ────────────────────
        let userFeedback = null;
        if (userId) {
            const fb = await MessageFeedback.getUserFeedback(userId, messageId);
            userFeedback = fb ? fb.feedbackType : null;
        }

        // ── 3. Aggregate stats ─────────────────────────────────────────────────
        const stats = await MessageFeedback.getStatsByMessage(messageId);

        // ── 4. Respond ─────────────────────────────────────────────────────────
        res.status(200).json({
            messageId,
            userFeedback,
            stats
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    submitFeedback,
    getFeedback
};
