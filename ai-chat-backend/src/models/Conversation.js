// src/models/Conversation.js
const mongoose = require('mongoose');

const ConversationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  agentId: { type: String, index: true }, // e.g. 'technical', 'medical'
  title: { type: String, default: 'New Conversation' },
  selectedModelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "LLMModel",
    index: true,
  },
  isArchived: { type: Boolean, default: false, index: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  messageCount: { type: Number, default: 0 },
  currentPersonaId: {
    type: String,
    index: true,
    default: null // Will be set to a default persona on creation
  },
}, { timestamps: true });

// Sort by most-recent updates for user dashboards
ConversationSchema.index({ userId: 1, updatedAt: -1 });

module.exports = mongoose.model('Conversation', ConversationSchema);
