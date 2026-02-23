// src/routes/userMemory.routes.js
const express = require('express');
const router = express.Router();
const { getUserMemories, deleteUserMemory, wipeUserMemory, toggleUserMemory, editUserMemory } = require('../services/userMemory.service');
const UserMemoryAuditLog = require('../models/UserMemoryAuditLog');
const auth = require('../middlewares/auth.middleware');

// Protect all routes
router.use(auth);

/**
 * GET /
 * Retrieves all memories for the authenticated user.
 */
router.get('/', async (req, res) => {
    try {
        const userId = req.user.id;
        const memories = await getUserMemories(userId);
        res.status(200).json({ memories });
    } catch (err) {
        console.error('[userMemoryRoutes] GET / error:', err);
        res.status(500).json({ error: 'Failed to retrieve memories' });
    }
});

/**
 * DELETE /:key
 * Deletes a specific memory key for the authenticated user.
 */
router.delete('/:key', async (req, res) => {
    try {
        const userId = req.user.id;
        const key = req.params.key;
        const result = await deleteUserMemory(userId, key);

        if (result.deleted) {
            res.status(200).json({ deleted: true, key });
        } else if (result.reason === 'NOT_FOUND') {
            res.status(404).json({ error: 'Memory key not found' });
        } else {
            res.status(500).json({ error: 'Failed to delete memory' });
        }
    } catch (err) {
        console.error('[userMemoryRoutes] DELETE /:key error:', err);
        res.status(500).json({ error: 'Failed to delete memory' });
    }
});

/**
 * DELETE /
 * Wipes all memories for the authenticated user.
 */
router.delete('/', async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await wipeUserMemory(userId);

        if (result.wiped) {
            res.status(200).json({ wiped: true, count: result.count });
        } else {
            res.status(500).json({ error: 'Failed to wipe memory' });
        }
    } catch (err) {
        console.error('[userMemoryRoutes] DELETE / error:', err);
        res.status(500).json({ error: 'Failed to wipe memory' });
    }
});

/**
 * GET /audit
 * Retrieves retrieval log for user memory actions.
 */
router.get('/audit', async (req, res) => {
    try {
        const userId = req.user.id;
        const log = await UserMemoryAuditLog.find({ userId })
            .sort({ timestamp: -1 })
            .limit(100)
            .lean();

        res.status(200).json({ log });
    } catch (err) {
        console.error('[userMemoryRoutes] GET /audit error:', err);
        res.status(500).json({ error: 'Failed to retrieve audit log' });
    }
});

/**
 * PATCH /:key/toggle
 * Toggles a memory's enabled status.
 */
router.patch('/:key/toggle', async (req, res) => {
    try {
        const userId = req.user.id;
        const key = req.params.key;
        const { enabled } = req.body;

        if (typeof enabled !== 'boolean') {
            return res.status(400).json({ error: 'enabled must be a boolean' });
        }

        const result = await toggleUserMemory(userId, key, enabled);

        if (result.toggled) {
            res.status(200).json({ toggled: true, key, enabled });
        } else if (result.reason === 'NOT_FOUND') {
            res.status(404).json({ error: 'Memory key not found' });
        } else {
            res.status(500).json({ error: 'Failed to toggle memory' });
        }
    } catch (err) {
        console.error('[userMemoryRoutes] PATCH /:key/toggle error:', err);
        res.status(500).json({ error: 'Failed to toggle memory' });
    }
});

/**
 * PATCH /:key/value
 * Edits a memory's value.
 */
router.patch('/:key/value', async (req, res) => {
    try {
        const userId = req.user.id;
        const key = req.params.key;
        const { value } = req.body;

        if (typeof value !== 'string') {
            return res.status(400).json({ error: 'value must be a string' });
        }

        const result = await editUserMemory(userId, key, value);

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
        console.error('[userMemoryRoutes] PATCH /:key/value error:', err);
        res.status(500).json({ error: 'Failed to edit memory' });
    }
});

module.exports = router;
