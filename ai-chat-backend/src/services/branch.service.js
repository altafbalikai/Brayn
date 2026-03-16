const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const ConversationSummary = require('../models/ConversationSummary');
const { getLatestSummary } = require('./summary.service');

async function branchConversation({ userId, conversationId, editedMessageId }) {
  const parentConv = await Conversation.findById(conversationId);
  if (!parentConv) throw Object.assign(new Error('Conversation not found'), { status: 404 });
  if (parentConv.userId.toString() !== userId) throw Object.assign(new Error('Forbidden'), { status: 403 });

  const sourceMessage = await Message.findOne({ _id: editedMessageId, conversationId });
  if (!sourceMessage) throw Object.assign(new Error('Source message not found in this conversation'), { status: 404 });
  if (sourceMessage.role !== 'user') throw Object.assign(new Error('Only user messages can be edited'), { status: 400 });

  const previousMessage = await Message.findOne({
    conversationId,
    _id: { $lt: sourceMessage._id },
  })
    .sort({ _id: -1 })
    .select('_id')
    .lean();

  const newConv = await Conversation.create({
    userId,
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

  const previousSummary = await getLatestSummary(conversationId);
  if (previousSummary) {
    await ConversationSummary.create({
      conversationId: newConv._id,
      summaryText: previousSummary.summaryText,
      version: previousSummary.version,
      messageRangeStart: previousSummary.messageRangeStart,
      messageRangeEnd: previousSummary.messageRangeEnd,
      validUpToMessageId: previousMessage?._id || null,
    });
  }

  return {
    newConversationId: newConv._id.toString(),
    conversation: newConv.toObject(),
  };
}

module.exports = { branchConversation };

