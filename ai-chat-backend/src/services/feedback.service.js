const Message = require('../models/Message');
const MessageFeedback = require('../models/MessageFeedback');

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

async function submitFeedback({ userId, messageId, conversationId, feedbackType, reason, tags, ipAddress, userAgent }) {
  const message = await Message.findById(messageId);
  if (!message) throw Object.assign(new Error('Message not found'), { status: 404 });

  const existing = await MessageFeedback.getUserFeedback(userId, messageId);

  let feedback;
  if (existing) {
    if (existing.feedbackType === feedbackType) {
      await MessageFeedback.findByIdAndDelete(existing._id);
      await syncMessageFeedbackStats(messageId, null);
      return {
        success: true,
        toggled: true,
        message: 'Feedback removed',
        feedback: null,
        stats: await MessageFeedback.getStatsByMessage(messageId)
      };
    }

    existing.feedbackType = feedbackType;
    if (reason !== undefined) existing.reason = reason;
    if (tags !== undefined) existing.tags = tags;
    feedback = await existing.save();
  } else {
    feedback = await MessageFeedback.create({
      messageId,
      userId,
      conversationId: conversationId || message.conversationId,
      feedbackType,
      reason,
      tags,
      ipAddress,
      userAgent
    });
  }

  await syncMessageFeedbackStats(messageId, feedbackType);
  const stats = await MessageFeedback.getStatsByMessage(messageId);

  return {
    status: existing ? 200 : 201,
    body: {
      success: true,
      userFeedback: feedback.feedbackType,
      feedback: feedback.toJSON(),
      stats
    }
  };
}

async function getFeedback({ userId, messageId }) {
  const messageExists = await Message.exists({ _id: messageId });
  if (!messageExists) throw Object.assign(new Error('Message not found'), { status: 404 });

  let userFeedback = null;
  if (userId) {
    const fb = await MessageFeedback.getUserFeedback(userId, messageId);
    userFeedback = fb ? fb.feedbackType : null;
  }

  const stats = await MessageFeedback.getStatsByMessage(messageId);

  return {
    messageId,
    userFeedback,
    stats
  };
}

module.exports = {
  submitFeedback,
  getFeedback
};

