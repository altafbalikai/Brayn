// src/controllers/branch.controller.js
const branchService = require('../services/branch.service');
const logger = require('../config/logger');

async function branchConversation(req, res, next) {
  try {
    const userId = req.user?.id;
    const { cid } = req.params;
    const { editedMessageId } = req.body;

    const result = await branchService.branchConversation({
      userId,
      conversationId: cid,
      editedMessageId,
    });

    res.status(201).json(result);
  } catch (error) {
    logger.error('branchConversation failed', { message: error?.message, status: error?.status });
    next(error);
  }
}

module.exports = {
  branchConversation,
};
