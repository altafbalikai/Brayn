// src/services/userMemory.service.js
const UserMemory = require('../models/UserMemory');
const UserMemoryAuditLog = require('../models/UserMemoryAuditLog');
const { extractMemoryCandidate } = require('../utils/memoryExtraction.utils');
const { classifyMemory } = require('../utils/memoryClassification.utils');
const { validateMemory } = require('../utils/memoryValidation.utils');

/**
 * Orchestrates extraction, classification, validation, and storage of user memory.
 * Fire-and-forget background task.
 */
async function processAndStoreMemory(text, role, userId, conversationId) {
    try {
        // Step 1: Extract
        const candidate = extractMemoryCandidate(text, role);
        if (!candidate) return { stored: false, reason: 'NO_EXTRACTION' };

        // Step 2: Classify
        const classified = classifyMemory(candidate);
        if (classified.logReason === 'EXTRACTION_UNMAPPED') {
            console.warn('[userMemory] EXTRACTION_UNMAPPED — no key resolved for:', candidate.triggerPhrase);
            return { stored: false, reason: 'EXTRACTION_UNMAPPED' };
        }

        // Step 3: Validate
        const validation = validateMemory(classified);
        if (!validation.valid) {
            console.warn('[userMemory] validation failed:', validation.reason);
            return { stored: false, reason: validation.reason };
        }

        // Step 4: Duplicate check
        const existing = await UserMemory.findOne({ userId, key: classified.key });
        if (existing && existing.value === classified.value) {
            console.warn('[userMemory] VALIDATION_DUPLICATE — value unchanged for key:', classified.key);
            return { stored: false, reason: 'VALIDATION_DUPLICATE' };
        }

        // Step 5: Upsert and audit
        if (existing) {
            // OVERWRITE
            await UserMemoryAuditLog.create({
                userId,
                action: 'OVERWRITE',
                key: classified.key,
                previousValue: existing.value,
                newValue: classified.value,
                sourceConversationId: conversationId
            });

            existing.value = classified.value;
            existing.updatedAt = new Date();
            await existing.save();
        } else {
            // WRITE
            await UserMemory.create({
                userId,
                key: classified.key,
                value: classified.value,
                category: classified.category,
                sourceConversationId: conversationId,
                importance: 5, // Default for extracted memories
                confidence: 0.9 // High confidence for explicit triggers
            });

            await UserMemoryAuditLog.create({
                userId,
                action: 'WRITE',
                key: classified.key,
                previousValue: null,
                newValue: classified.value,
                sourceConversationId: conversationId
            });
        }

        // Step 6: Return success
        return { stored: true, key: classified.key, value: classified.value };

    } catch (err) {
        console.error('[userMemory] processAndStoreMemory error:', err);
        return { stored: false, reason: 'INTERNAL_ERROR' };
    }
}

/**
 * Retrieves all memories for a user, sorted by importance and recency.
 */
async function getUserMemories(userId) {
    try {
        return await UserMemory.find({ userId })
            .sort({ importance: -1, updatedAt: -1 });
    } catch (err) {
        console.error('[userMemory] getUserMemories error:', err);
        return [];
    }
}

/**
 * Deletes a specific memory document and logs the action.
 */
async function deleteUserMemory(userId, key) {
    try {
        const doc = await UserMemory.findOne({ userId, key });
        if (!doc) {
            return { deleted: false, reason: 'NOT_FOUND' };
        }

        await UserMemoryAuditLog.create({
            userId,
            action: 'DELETE',
            key: key,
            previousValue: doc.value,
            newValue: null,
            sourceConversationId: null
        });

        await UserMemory.deleteOne({ _id: doc._id });
        return { deleted: true };
    } catch (err) {
        console.error('[userMemory] deleteUserMemory error:', err);
        return { deleted: false, reason: 'INTERNAL_ERROR' };
    }
}

/**
 * Wipes all memories for a user and creates a single audit log entry.
 */
async function wipeUserMemory(userId) {
    try {
        const count = await UserMemory.countDocuments({ userId });
        await UserMemory.deleteMany({ userId });

        await UserMemoryAuditLog.create({
            userId,
            action: 'WIPE',
            key: null,
            previousValue: null,
            newValue: null,
            sourceConversationId: null
        });

        return { wiped: true, count };
    } catch (err) {
        console.error('[userMemory] wipeUserMemory error:', err);
        return { wiped: false, reason: 'INTERNAL_ERROR' };
    }
}

/**
 * Logs a fire-and-forget memory injection event.
 */
function logMemoryInjection(userId, key, value) {
    // Fire and forget
    UserMemoryAuditLog.create({
        userId,
        action: 'INJECTED',
        key: key,
        previousValue: null,
        newValue: value,
        sourceConversationId: null
    }).catch(err => {
        console.warn('[userMemory] logMemoryInjection failed:', err);
    });
}

/**
 * Toggles a memory's enabled status and logs the action.
 */
async function toggleUserMemory(userId, key, enabled) {
    try {
        const doc = await UserMemory.findOne({ userId, key });
        if (!doc) return { toggled: false, reason: 'NOT_FOUND' };

        const previousEnabled = doc.enabled;

        doc.enabled = enabled;
        doc.updatedAt = new Date();
        await doc.save();

        await UserMemoryAuditLog.create({
            userId,
            action: enabled ? 'ENABLED' : 'DISABLED',
            key,
            previousValue: String(previousEnabled),
            newValue: String(enabled),
            sourceConversationId: null
        });

        return { toggled: true, key, enabled };
    } catch (err) {
        console.error('[userMemory] toggleUserMemory error:', err);
        return { toggled: false, reason: 'INTERNAL_ERROR' };
    }
}

/**
 * Edits a memory's value and logs the action.
 */
async function editUserMemory(userId, key, newValue) {
    try {
        const trimmed = newValue.trim();
        if (trimmed.length < 2 || trimmed.length > 50) {
            return { edited: false, reason: 'VALIDATION_VALUE_LENGTH' };
        }

        const doc = await UserMemory.findOne({ userId, key });
        if (!doc) return { edited: false, reason: 'NOT_FOUND' };

        const previousValue = doc.value;

        doc.value = trimmed;
        doc.updatedAt = new Date();
        await doc.save();

        await UserMemoryAuditLog.create({
            userId,
            action: 'OVERWRITE',
            key,
            previousValue,
            newValue: trimmed,
            sourceConversationId: null
        });

        return { edited: true, key, value: trimmed };
    } catch (err) {
        console.error('[userMemory] editUserMemory error:', err);
        return { edited: false, reason: 'INTERNAL_ERROR' };
    }
}

/**
 * Retrieves retrieval log for user memory actions.
 */
async function getMemoryAuditLog(userId) {
    try {
        return await UserMemoryAuditLog.find({ userId })
            .sort({ timestamp: -1 })
            .limit(100)
            .lean();
    } catch (err) {
        console.error('[userMemory] getMemoryAuditLog error:', err);
        throw err;
    }
}

module.exports = {
    processAndStoreMemory,
    getUserMemories,
    deleteUserMemory,
    wipeUserMemory,
    logMemoryInjection,
    toggleUserMemory,
    editUserMemory,
    getMemoryAuditLog
};
