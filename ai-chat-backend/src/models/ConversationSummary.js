const mongoose = require('mongoose');

const ConversationSummarySchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    summaryText: { type: String, required: true },
    version: { type: Number, default: 1 },
    messageRangeStart: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
    },
    messageRangeEnd: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
    },
  },
  { timestamps: true }
);

ConversationSummarySchema.index({ conversationId: 1, version: -1 });

module.exports = mongoose.model('ConversationSummary', ConversationSummarySchema);
