// src/models/UserMemoryAuditLog.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const UserMemoryAuditLogSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        required: true
    },
    action: {
        type: String,
        enum: ['WRITE', 'OVERWRITE', 'DELETE', 'WIPE', 'INJECTED'],
        required: true
    },
    key: {
        type: String,
        default: null
    },
    previousValue: {
        type: String,
        default: null
    },
    newValue: {
        type: String,
        default: null
    },
    sourceConversationId: {
        type: Schema.Types.ObjectId,
        default: null
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});

// Index for efficient retrieval of user activity
UserMemoryAuditLogSchema.index({ userId: 1, timestamp: -1 });

/**
 * Pre-save hook to enforce newValue: null for DELETE and WIPE actions.
 * This ensures the append-only log remains consistent with schema rules.
 */
UserMemoryAuditLogSchema.pre('save', function (next) {
    if (this.action === 'DELETE' || this.action === 'WIPE') {
        this.newValue = null;
    }
    next();
});

module.exports = mongoose.model('UserMemoryAuditLog', UserMemoryAuditLogSchema);
