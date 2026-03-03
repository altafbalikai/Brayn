// src/controllers/copy.controller.js
const Message = require('../models/Message');
const logger = require('../config/logger');

/**
 * POST /api/messages/:messageId/copy
 *
 * Increments the copy counter and updates the lastCopiedAt timestamp
 * for the specified message. Used for analytics and tracking popular responses.
 */
async function trackMessageCopy(req, res, next) {
    try {
        const { messageId } = req.params;

        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ error: 'Message not found' });
        }

        // Use the helper method added in Phase 1.3
        await message.incrementCopyCount();

        res.status(200).json({
            success: true,
            messageId: message._id,
            copiedCount: message.copiedCount,
            lastCopiedAt: message.lastCopiedAt
        });
    } catch (err) {
        logger.error('Error tracking message copy:', { messageId: req.params.messageId, error: err.message });
        next(err);
    }
}

module.exports = {
    trackMessageCopy
};
