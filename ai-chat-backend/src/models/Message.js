// src/models/Message.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const MessageSchema = new Schema({
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
  text: {
    type: String,
    required: function () {
      return this.role === 'user';
    },
    default: ''
  },
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

  // ── Feedback (denormalized counts for fast reads) ────────────────────────────
  feedback: {
    positive: { type: Number, default: 0, min: [0, 'positive count cannot be negative'] },
    negative: { type: Number, default: 0, min: [0, 'negative count cannot be negative'] },
    // What the current requesting user gave (populated per-request, not stored globally)
    userFeedback: {
      type: String,
      enum: ['positive', 'negative', null],
      default: null
    }
  },

  // ── Tree structure ───────────────────────────────────────────────────────────
  // Tree structure — pointer to this node's parent in the message tree
  parentMessageId: {
    type: Schema.Types.ObjectId,
    ref: 'Message',
    default: null,
    index: true
  },
  activeChildId: {
    type: Schema.Types.ObjectId,
    ref: 'Message',
    default: null,
    sparse: true
  },
  status: {
    type: String,
    enum: ['streaming', 'sent', 'error'],
    default: 'sent'
  },

  // ── Copy analytics ───────────────────────────────────────────────────────────
  copiedCount: { type: Number, default: 0, min: [0, 'copiedCount cannot be negative'] },
  lastCopiedAt: { type: Date, default: null }
}, { timestamps: true });

// ─── Indexes ───────────────────────────────────────────────────────────────────
MessageSchema.index({ conversationId: 1, createdAt: -1 });

// ─── Instance Methods ──────────────────────────────────────────────────────────

/**
 * Update denormalized feedback counts and optionally set the requesting user's feedback.
 * @param {string} feedbackType - 'positive' or 'negative'
 * @param {string|null} previousType - the user's previous feedback on this message (or null)
 * @return {Promise<Message>}
 */
MessageSchema.methods.updateFeedbackStats = async function (feedbackType, previousType = null) {
  // Undo the previous feedback if the user is changing their vote
  if (previousType && previousType !== feedbackType) {
    this.feedback[previousType] = Math.max(0, (this.feedback[previousType] || 0) - 1);
  }

  // Increment new feedback type (only if it's different from previous)
  if (previousType !== feedbackType) {
    this.feedback[feedbackType] = (this.feedback[feedbackType] || 0) + 1;
  }

  this.feedback.userFeedback = feedbackType;
  return this.save();
};

/**
 * Increment the copy counter and update lastCopiedAt.
 * @return {Promise<Message>}
 */
MessageSchema.methods.incrementCopyCount = async function () {
  this.copiedCount = (this.copiedCount || 0) + 1;
  this.lastCopiedAt = new Date();
  return this.save();
};

/**
 * Append a version ID to the versions array.
 * @param {ObjectId} versionId
 * @return {Promise<Message>}
 */
MessageSchema.methods.addVersion = async function (versionId) {
  this.versions.push(versionId);
  return this.save();
};

/**
 * Set the currently active/displayed version.
 * @param {ObjectId} versionId
 * @return {Promise<Message>}
 */
MessageSchema.methods.setCurrentVersion = async function (versionId) {
  this.currentVersionId = versionId;
  return this.save();
};

module.exports = mongoose.model('Message', MessageSchema);
