// src/controllers/branch.controller.js
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const ConversationSummary = require('../models/ConversationSummary');
const { getLatestSummary } = require('../services/summary.service');

async function branchConversation(req, res, next) {
  try {
    const userId = req.user?.id;
    const { cid } = req.params;
    const { editedMessageId, newContent } = req.body;
    void newContent;

    const parentConv = await Conversation.findById(cid);
    if (!parentConv) return res.status(404).json({ error: 'Conversation not found' });
    if (parentConv.userId.toString() !== userId) return res.status(403).json({ error: 'Forbidden' });

    const sourceMessage = await Message.findOne({ _id: editedMessageId, conversationId: cid });
    if (!sourceMessage) return res.status(404).json({ error: 'Source message not found in this conversation' });
    if (sourceMessage.role !== 'user') {
      return res.status(400).json({ error: 'Only user messages can be edited' });
    }

    const previousMessage = await Message.findOne({
      conversationId: cid,
      _id: { $lt: sourceMessage._id },
    })
      .sort({ _id: -1 })
      .select('_id')
      .lean();

    const newConv = await Conversation.create({
      userId: req.user.id,
      agentId: parentConv.agentId,
      title: parentConv.title,
      selectedModelId: parentConv.selectedModelId,
      currentPersonaId: parentConv.currentPersonaId,
      parentConversationId: parentConv._id,
      branchedFromMessageId: previousMessage?._id || null,
      editedMessageId: sourceMessage._id,
      branchEditedMessageId: null,
      messageCount: 0,
    });

    const previousSummary = await getLatestSummary(cid);
    if (previousSummary) {
      try {
        await ConversationSummary.create({
          conversationId: newConv._id,
          summaryText: previousSummary.summaryText,
          version: previousSummary.version,
          messageRangeStart: previousSummary.messageRangeStart,
          messageRangeEnd: previousSummary.messageRangeEnd,
          validUpToMessageId: previousMessage?._id || null,
        });
      } catch (summaryErr) {
        console.warn('[branchConversation] Failed to copy conversation summary:', summaryErr.message);
      }
    }

    res.status(201).json({
      newConversationId: newConv._id.toString(),
      conversation: newConv.toObject(),
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  branchConversation,
};
