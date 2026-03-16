const Message = require('../models/Message');

async function trackCopy({ messageId }) {
  const message = await Message.findById(messageId);
  if (!message) throw Object.assign(new Error('Message not found'), { status: 404 });

  await message.incrementCopyCount();

  return {
    success: true,
    messageId: message._id,
    copiedCount: message.copiedCount,
    lastCopiedAt: message.lastCopiedAt
  };
}

module.exports = { trackCopy };

