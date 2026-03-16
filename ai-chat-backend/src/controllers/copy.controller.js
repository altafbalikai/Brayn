// src/controllers/copy.controller.js
const copyService = require('../services/copy.service');
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
        const data = await copyService.trackCopy({ messageId });
        res.status(200).json(data);
    } catch (err) {
        logger.error('Error tracking message copy:', { messageId: req.params.messageId, error: err.message });
        next(err);
    }
}

module.exports = {
    trackMessageCopy
};
