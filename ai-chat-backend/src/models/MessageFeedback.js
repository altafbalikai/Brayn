// src/models/MessageFeedback.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

// ─── Feedback Types ────────────────────────────────────────────────────────────
const FEEDBACK_TYPES = ['positive', 'negative', 'neutral'];

// ─── Schema ────────────────────────────────────────────────────────────────────
const MessageFeedbackSchema = new Schema({
    // Reference to the message being rated
    messageId: {
        type: Schema.Types.ObjectId,
        ref: 'Message',
        required: [true, 'messageId is required'],
        index: true
    },

    // The user who submitted the feedback
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'userId is required'],
        index: true
    },

    // Parent conversation (denormalized for fast per-conversation analytics)
    conversationId: {
        type: Schema.Types.ObjectId,
        ref: 'Conversation',
        index: true
    },

    // The sentiment of the feedback
    feedbackType: {
        type: String,
        enum: {
            values: FEEDBACK_TYPES,
            message: '{VALUE} is not a valid feedback type'
        },
        required: [true, 'feedbackType is required']
    },

    // Optional free-text reason (why the user liked/disliked)
    reason: {
        type: String,
        maxlength: [1000, 'Reason cannot exceed 1000 characters'],
        trim: true
    },

    // Optional categorical tags (e.g. "helpful", "wrong", "off-topic")
    tags: {
        type: [String],
        default: []
    },

    // ── Analytics fields (excluded from JSON by default) ───────────────────────
    ipAddress: { type: String, select: false },
    userAgent: { type: String, select: false }
}, {
    timestamps: true // adds createdAt & updatedAt automatically
});

// ─── Indexes ───────────────────────────────────────────────────────────────────

// Sorting feedback chronologically
MessageFeedbackSchema.index({ createdAt: -1 });

// Compound: one feedback per user per message (also enables fast lookup)
MessageFeedbackSchema.index({ messageId: 1, userId: 1 }, { unique: true });

// ─── Instance Methods ──────────────────────────────────────────────────────────

/**
 * Override toJSON to strip sensitive analytics fields from API responses.
 */
MessageFeedbackSchema.methods.toJSON = function () {
    const obj = this.toObject();
    delete obj.ipAddress;
    delete obj.userAgent;
    delete obj.__v;
    return obj;
};

// ─── Static Methods ────────────────────────────────────────────────────────────

/**
 * Get aggregated feedback counts for a message.
 * @param  {ObjectId} messageId
 * @return {Promise<{ positive: number, negative: number, neutral: number, total: number }>}
 */
MessageFeedbackSchema.statics.getStatsByMessage = async function (messageId) {
    const results = await this.aggregate([
        { $match: { messageId: new mongoose.Types.ObjectId(messageId) } },
        { $group: { _id: '$feedbackType', count: { $sum: 1 } } }
    ]);

    const stats = { positive: 0, negative: 0, neutral: 0, total: 0 };
    for (const r of results) {
        stats[r._id] = r.count;
        stats.total += r.count;
    }
    return stats;
};

/**
 * Get a specific user's feedback on a message (or null if none).
 * @param  {ObjectId} userId
 * @param  {ObjectId} messageId
 * @return {Promise<MessageFeedback|null>}
 */
MessageFeedbackSchema.statics.getUserFeedback = async function (userId, messageId) {
    return this.findOne({ userId, messageId });
};

// ─── Export ────────────────────────────────────────────────────────────────────
module.exports = mongoose.model('MessageFeedback', MessageFeedbackSchema);
