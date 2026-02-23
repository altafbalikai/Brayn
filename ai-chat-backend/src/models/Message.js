// src/models/Message.js
const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
  text: { type: String, required: true },
  importance: { type: Number, default: 0 },
  tokens: { type: Number },
  llmMetadata: {
    model: String,
    provider: String,
    requestId: String,
    latencyMs: Number,
    costUSD: Number
  },
  personaId: {
    type: String,
    index: true,
    default: null // Track which persona generated this
  },
}, { timestamps: true });

MessageSchema.index({ conversationId: 1, createdAt: -1 });

module.exports = mongoose.model('Message', MessageSchema);
