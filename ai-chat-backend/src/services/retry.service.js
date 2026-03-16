const Message = require('../models/Message');
const MessageVersion = require('../models/MessageVersion');
const Conversation = require('../models/Conversation');
const logger = require('../config/logger');

async function prepareRetry({ userId, conversationId, messageId }) {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) throw Object.assign(new Error('Conversation not found'), { status: 404 });
  if (conversation.userId.toString() !== userId) {
    throw Object.assign(new Error('Not authorized to retry in this conversation'), { status: 403 });
  }

  const originalMessage = await Message.findOne({
    _id: messageId,
    conversationId,
    role: 'assistant'
  });
  if (!originalMessage) throw Object.assign(new Error('Assistant message not found in this conversation'), { status: 404 });

  const existingVersions = await MessageVersion.find({ messageId: originalMessage._id })
    .sort({ version: -1 })
    .limit(1)
    .lean();

  const highestVersion = existingVersions.length > 0 ? existingVersions[0].version : 0;

  if (highestVersion === 0) {
    const v1 = await MessageVersion.findOneAndUpdate(
      { messageId: originalMessage._id, version: 1 },
      {
        $setOnInsert: {
          messageId: originalMessage._id,
          conversationId,
          version: 1,
          content: originalMessage.text || '',
          personaId: originalMessage.personaId ?? null,
          modelId: originalMessage.llmMetadata?.model || null,
          temperature: originalMessage.temperature ?? null,
          tokens: originalMessage.tokens || { prompt: 0, completion: 0, total: 0 },
          isActive: false,
          generatedAt: originalMessage.createdAt || new Date()
        }
      },
      { upsert: true, new: false }
    );

    if (!v1) {
      const inserted = await MessageVersion.findOne({ messageId: originalMessage._id, version: 1 }, { _id: 1 });
      if (inserted) {
        originalMessage.versions.push(inserted._id);
      }
    }
  }

  const messages = await Message.find({ conversationId })
    .sort({ createdAt: 1 })
    .lean();

  const index = messages.findIndex(m => m._id.toString() === originalMessage._id.toString());
  if (index <= 0) throw Object.assign(new Error('Could not determine previous user message'), { status: 400 });

  const userMessage = messages
    .slice(0, index)
    .reverse()
    .find(m => m.role === 'user');
  if (!userMessage) throw Object.assign(new Error('Could not find the user message that prompted this response'), { status: 400 });

  const MAX_CONTEXT = 4;
  const recentMessages = await Message.find({ conversationId })
    .sort({ createdAt: -1 })
    .limit(MAX_CONTEXT)
    .lean();
  const ordered = recentMessages.reverse();

  if (!ordered.some(m => m._id.toString() === userMessage._id.toString())) {
    ordered.push({ role: userMessage.role, text: userMessage.text, _id: userMessage._id });
  }

  return { conversation, originalMessage, userMessage, ordered };
}

async function persistRetryResult({ conversation, originalMessage, conversationId, fullReply, modelId }) {
  const finalVersionCheck = await MessageVersion.find({ messageId: originalMessage._id })
    .sort({ version: -1 })
    .limit(1)
    .lean();

  const nextVersion = (finalVersionCheck.length > 0 ? finalVersionCheck[0].version : 0) + 1;

  const newVersion = await MessageVersion.create({
    messageId: originalMessage._id,
    conversationId,
    parentMessageId: originalMessage._id,
    version: nextVersion,
    content: fullReply,
    personaId: conversation.currentPersonaId,
    modelId: modelId?.toString() || null,
    isActive: true
  });

  await MessageVersion.updateMany(
    { messageId: originalMessage._id, _id: { $ne: newVersion._id } },
    { $set: { isActive: false } }
  );

  originalMessage.versions.push(newVersion._id);
  originalMessage.currentVersionId = newVersion._id;
  originalMessage.text = fullReply;
  originalMessage.isRetried = true;
  await originalMessage.save();

  conversation.updatedAt = new Date();
  await conversation.save();

  logger.info('Retry persisted', { messageId: originalMessage._id.toString(), version: nextVersion });

  return { newVersion };
}

async function switchVersion({ userId, messageId, versionId, versionNumber }) {
  let message = await Message.findById(messageId);
  if (!message) message = await Message.findOne({ _id: messageId });
  if (!message) throw Object.assign(new Error('Message not found'), { status: 404 });

  const conversation = await Conversation.findById(message.conversationId);
  if (!conversation || conversation.userId.toString() !== userId) {
    throw Object.assign(new Error('Not authorized'), { status: 403 });
  }

  let targetVersion;
  if (versionId) {
    targetVersion = await MessageVersion.findOne({ _id: versionId, messageId });
  } else if (versionNumber) {
    targetVersion = await MessageVersion.findOne({ messageId, version: versionNumber });
  } else {
    throw Object.assign(new Error('Provide versionId or versionNumber'), { status: 400 });
  }

  if (!targetVersion) throw Object.assign(new Error('Version not found for this message'), { status: 404 });

  await MessageVersion.setActiveVersion(messageId, targetVersion._id);
  message.currentVersionId = targetVersion._id;
  message.text = targetVersion.content;
  await message.save();

  const allVersions = await MessageVersion.getVersionsByMessage(messageId);

  return {
    success: true,
    message: {
      messageId: message._id,
      currentVersionId: targetVersion._id,
      content: targetVersion.content,
      version: targetVersion.version,
      totalVersions: allVersions.length
    }
  };
}

async function deleteVersion({ userId, messageId, versionId }) {
  const message = await Message.findById(messageId);
  if (!message) throw Object.assign(new Error('Message not found'), { status: 404 });

  const conversation = await Conversation.findById(message.conversationId);
  if (!conversation || conversation.userId.toString() !== userId) {
    throw Object.assign(new Error('Not authorized'), { status: 403 });
  }

  const version = await MessageVersion.findOne({ _id: versionId, messageId });
  if (!version) throw Object.assign(new Error('Version not found'), { status: 404 });

  if (message.versions.length <= 1) throw Object.assign(new Error('Cannot delete the last remaining version'), { status: 400 });
  if (version.isActive) throw Object.assign(new Error('Cannot delete the active version. Switch to another version first.'), { status: 400 });

  message.versions = message.versions.filter(v => v.toString() !== versionId);
  await message.save();
  await MessageVersion.findByIdAndDelete(versionId);

  return {
    success: true,
    message: 'Version deleted',
    remainingVersions: message.versions.length
  };
}

module.exports = {
  prepareRetry,
  persistRetryResult,
  switchVersion,
  deleteVersion,
};

