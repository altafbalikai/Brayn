// src/models/UserMemory.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const UserMemorySchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        required: true
    },
    key: {
        type: String,
        required: true
    },
    value: {
        type: String,
        required: true,
        minlength: 2,
        maxlength: 50
    },
    category: {
        type: String,
        enum: ['preference', 'trait', 'goal'],
        required: true
    },
    importance: {
        type: Number,
        default: 5,
        min: 0,
        max: 10
    },
    confidence: {
        type: Number,
        default: 1.0,
        min: 0.0,
        max: 1.0
    },
    sourceConversationId: {
        type: Schema.Types.ObjectId,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        immutable: true // Never updated after creation
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    enabled: {
        type: Boolean,
        default: true
    }
});

// Indexes
UserMemorySchema.index({ userId: 1, key: 1 }, { unique: true });
UserMemorySchema.index({ userId: 1, importance: -1 });
UserMemorySchema.index({ userId: 1, updatedAt: -1 });

// Pre-save hook to update updatedAt
UserMemorySchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('UserMemory', UserMemorySchema);
