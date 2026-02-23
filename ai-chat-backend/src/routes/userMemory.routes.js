// src/routes/userMemory.routes.js
const express = require('express');
const router = express.Router();
const userMemoryController = require('../controllers/userMemory.controller');
const auth = require('../middlewares/auth.middleware');

// Protect all routes
router.use(auth);

/**
 * GET /
 * Retrieves all memories for the authenticated user.
 */
router.get('/', userMemoryController.getMemories);

/**
 * DELETE /:key
 * Deletes a specific memory key for the authenticated user.
 */
router.delete('/:key', userMemoryController.deleteMemory);

/**
 * DELETE /
 * Wipes all memories for the authenticated user.
 */
router.delete('/', userMemoryController.wipeMemory);

/**
 * GET /audit
 * Retrieves retrieval log for user memory actions.
 */
router.get('/audit', userMemoryController.getAuditLog);

/**
 * PATCH /:key/toggle
 * Toggles a memory's enabled status.
 */
router.patch('/:key/toggle', userMemoryController.toggleMemory);

/**
 * PATCH /:key/value
 * Edits a memory's value.
 */
router.patch('/:key/value', userMemoryController.editMemory);

module.exports = router;
