// src/controllers/userMemory.controller.js
const userMemoryService = require('../services/userMemory.service');

/**
 * GET /api/user-memory
 * Retrieves all memories for the authenticated user.
 */
async function getMemories(req, res, next) {
    try {
        const userId = req.user.id;
        const memories = await userMemoryService.getUserMemories(userId);
        res.status(200).json({ memories });
    } catch (err) {
        next(err);
    }
}

/**
 * DELETE /api/user-memory/:key
 * Deletes a specific memory key for the authenticated user.
 */
async function deleteMemory(req, res, next) {
    try {
        const userId = req.user.id;
        const key = req.params.key;
        const result = await userMemoryService.deleteUserMemory(userId, key);

        if (result.deleted) {
            res.status(200).json({ deleted: true, key });
        } else if (result.reason === 'NOT_FOUND') {
            res.status(404).json({ error: 'Memory key not found' });
        } else {
            res.status(500).json({ error: 'Failed to delete memory' });
        }
    } catch (err) {
        next(err);
    }
}

/**
 * DELETE /api/user-memory
 * Wipes all memories for the authenticated user.
 */
async function wipeMemory(req, res, next) {
    try {
        const userId = req.user.id;
        const result = await userMemoryService.wipeUserMemory(userId);

        if (result.wiped) {
            res.status(200).json({ wiped: true, count: result.count });
        } else {
            res.status(500).json({ error: 'Failed to wipe memory' });
        }
    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/user-memory/audit
 * Retrieves retrieval log for user memory actions.
 */
async function getAuditLog(req, res, next) {
    try {
        const userId = req.user.id;
        const log = await userMemoryService.getMemoryAuditLog(userId);
        res.status(200).json({ log });
    } catch (err) {
        next(err);
    }
}

/**
 * PATCH /api/user-memory/:key/toggle
 * Toggles a memory's enabled status.
 */
async function toggleMemory(req, res, next) {
    try {
        const userId = req.user.id;
        const key = req.params.key;
        const { enabled } = req.body;

        if (typeof enabled !== 'boolean') {
            return res.status(400).json({ error: 'enabled must be a boolean' });
        }

        const result = await userMemoryService.toggleUserMemory(userId, key, enabled);

        if (result.toggled) {
            res.status(200).json({ toggled: true, key, enabled });
        } else if (result.reason === 'NOT_FOUND') {
            res.status(404).json({ error: 'Memory key not found' });
        } else {
            res.status(500).json({ error: 'Failed to toggle memory' });
        }
    } catch (err) {
        next(err);
    }
}

/**
 * PATCH /api/user-memory/:key/value
 * Edits a memory's value.
 */
async function editMemory(req, res, next) {
    try {
        const userId = req.user.id;
        const key = req.params.key;
        const { value } = req.body;

        if (typeof value !== 'string') {
            return res.status(400).json({ error: 'value must be a string' });
        }

        const result = await userMemoryService.editUserMemory(userId, key, value);

        if (result.edited) {
            res.status(200).json({ edited: true, key, value: result.value });
        } else if (result.reason === 'VALIDATION_VALUE_LENGTH') {
            res.status(400).json({ error: 'Value must be between 2 and 50 characters' });
        } else if (result.reason === 'NOT_FOUND') {
            res.status(404).json({ error: 'Memory key not found' });
        } else {
            res.status(500).json({ error: 'Failed to edit memory' });
        }
    } catch (err) {
        next(err);
    }
}

module.exports = {
    getMemories,
    deleteMemory,
    wipeMemory,
    getAuditLog,
    toggleMemory,
    editMemory
};
