// src/models/MessageVersion.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

// ─── Schema ────────────────────────────────────────────────────────────────────
const MessageVersionSchema = new Schema({
    // The message this version belongs to
    messageId: {
        type: Schema.Types.ObjectId,
        ref: 'Message',
        required: [true, 'messageId is required'],
        index: true
    },

    // Parent conversation (denormalized for fast per-conversation queries)
    conversationId: {
        type: Schema.Types.ObjectId,
        ref: 'Conversation',
        index: true
    },

    // If this version was generated as a retry, reference to the original response
    parentMessageId: {
        type: Schema.Types.ObjectId,
        ref: 'Message',
        default: null
    },

    // Sequential version number starting from 1
    version: {
        type: Number,
        required: [true, 'version is required'],
        min: [1, 'version must be a positive integer'],
        validate: {
            validator: Number.isInteger,
            message: '{VALUE} is not a valid version (must be an integer)'
        }
    },

    // The actual response text for this version
    content: {
        type: String,
        default: '' // Allow empty string for snapshots of empty messages
    },

    // Which persona generated this version
    personaId: {
        type: String,
        default: null
    },

    // Which LLM model generated this version
    modelId: {
        type: String,
        default: null
    },

    // Generation temperature parameter used
    temperature: {
        type: Number,
        default: null
    },

    // Token usage breakdown for this generation
    tokens: {
        prompt: { type: Number, default: 0 },
        completion: { type: Number, default: 0 },
        total: { type: Number, default: 0 }
    },

    // When this version was generated (may differ from createdAt if delayed insert)
    generatedAt: {
        type: Date,
        default: Date.now
    },

    // Whether this version is the currently displayed one
    isActive: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: { createdAt: true, updatedAt: false } // only need createdAt
});

// ─── Indexes ───────────────────────────────────────────────────────────────────

// Fast lookup for the active version of a message
MessageVersionSchema.index({ messageId: 1, isActive: 1 });

// Unique version number per message
MessageVersionSchema.index({ messageId: 1, version: 1 }, { unique: true });

// ─── Instance Methods ──────────────────────────────────────────────────────────

/**
 * Override toJSON to return only relevant fields for API responses.
 */
MessageVersionSchema.methods.toJSON = function () {
    const obj = this.toObject();
    delete obj.__v;
    return obj;
};

// ─── Static Methods ────────────────────────────────────────────────────────────

/**
 * Get all versions for a message, sorted by version number ascending.
 * @param  {ObjectId} messageId
 * @return {Promise<MessageVersion[]>}
 */
MessageVersionSchema.statics.getVersionsByMessage = async function (messageId) {
    return this.find({ messageId }).sort({ version: 1 }).lean();
};

/**
 * Get the currently active version for a message.
 * @param  {ObjectId} messageId
 * @return {Promise<MessageVersion|null>}
 */
MessageVersionSchema.statics.getActiveVersion = async function (messageId) {
    return this.findOne({ messageId, isActive: true });
};

/**
 * Set one version as active and deactivate all others for that message.
 * Uses a bulk-write for atomicity — deactivate all, then activate the target.
 * @param  {ObjectId} messageId
 * @param  {ObjectId} versionId  - the _id of the version to activate
 * @return {Promise<MessageVersion>}  the newly activated version
 * @throws {Error} if the versionId is not found for this message
 */
MessageVersionSchema.statics.setActiveVersion = async function (messageId, versionId) {
    // Deactivate all versions for this message
    await this.updateMany(
        { messageId },
        { $set: { isActive: false } }
    );

    // Activate the target version
    const activated = await this.findOneAndUpdate(
        { _id: versionId, messageId },
        { $set: { isActive: true } },
        { new: true }
    );

    if (!activated) {
        throw new Error(`Version ${versionId} not found for message ${messageId}`);
    }

    return activated;
};

// ─── Export ────────────────────────────────────────────────────────────────────
module.exports = mongoose.model('MessageVersion', MessageVersionSchema);
