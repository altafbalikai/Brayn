// src/controllers/summary.controller.js
const summaryService = require('../services/summary.service');

/**
 * POST /api/summary/:conversationId
 * Summarizes a conversation.
 */
async function summarizeConversation(req, res, next) {
    try {
        const { conversationId } = req.params;
        const summary = await summaryService.generateConversationSummary(conversationId);
        res.json(summary);
    } catch (err) {
        next(err);
    }
}

module.exports = {
    summarizeConversation
};
