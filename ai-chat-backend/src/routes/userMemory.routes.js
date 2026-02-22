// src/routes/userMemory.routes.js
const express = require('express');
const router = express.Router();
const { getUserMemories, deleteUserMemory, wipeUserMemory } = require('../services/userMemory.service');
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

module.exports = router;
