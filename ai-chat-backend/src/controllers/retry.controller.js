// src/controllers/retry.controller.js
const mongoose = require('mongoose');
const llmService = require('../services/llm.service');
const logger = require('../config/logger');
const { idempotencyCache } = require('../config/idempotencyCache');
const retryService = require('../services/retry.service');

// ─── Retry Message (Regenerate AI Response) ────────────────────────────────────

/**
 * POST /api/conversations/:conversationId/messages/:messageId/retry
 *
 * Regenerates an assistant response, saves the new output as a new
 * MessageVersion, and streams the result back via SSE.
 *
 * Flow:
 *  1. Validate ownership (user → conversation → message).
 *  2. Ensure the first version is captured if the message has never been retried.
 *  3. Find the preceding user message that prompted this response.
 *  4. Stream a new response from the LLM.
 *  5. Save the new version and update the parent Message.
 */
async function retryMessage(req, res, next) {
    try {
        const userId = req.user.id;
        // Support both short (cid/mid from legacy/compact routes) and long (conversationId/messageId from standard routes)
        const conversationId = req.params.conversationId || req.params.cid;
        const messageId = req.params.messageId || req.params.mid;
        const { overrideModelId } = req.body || {};  // ✅ NEW: Support model failover

        // ================================================================================
        // NEW: Get idempotency key from header
        // ================================================================================
        const requestKey = req.headers['x-request-idempotency-key'];
        if (!requestKey) {
            return res.status(400).json({
                error: 'X-Request-Idempotency-Key header required'
            });
        }

        // ================================================================================
        // NEW: Check idempotency cache BEFORE processing
        // ================================================================================
        const cached = idempotencyCache.get(requestKey);
        if (cached) {
            if (cached.status === 'pending') {
                // Request already in flight
                return res.status(409).json({
                    error: 'Duplicate request in progress'
                });
            }
            if (cached.status === 'completed') {
                // Return cached result
                return res.json({
                    versionId: cached.result.versionId,
                    cached: true
                });
            }
            if (cached.status === 'failed') {
                // Return cached error
                return res.status(500).json({
                    error: cached.error.message,
                    cached: true
                });
            }
        }

        // ================================================================================
        // NEW: Mark request as in-flight
        // ================================================================================
        idempotencyCache.set(requestKey, 'pending');

        const { conversation, originalMessage, userMessage, ordered } = await retryService.prepareRetry({
            userId,
            conversationId,
            messageId
        });

        // ================================================================================
        // NEW: Wrap entire operation in timeout
        // ================================================================================
        const STREAM_TIMEOUT = 120000; // 2 minutes
        const timeoutHandle = setTimeout(() => {
            if (!res.headersSent) {
                // Pre-stream timeout → retriable
                idempotencyCache.set(requestKey, 'failed', null, {
                    message: 'Stream timeout (pre-start)'
                });
                return res.status(504).json({ error: 'Stream timeout (pre-start)' });
            }
            // Already streaming → close connection
            res.write('\n\n⚠️ Stream timeout: LLM response took too long');
            res.end();
        }, STREAM_TIMEOUT);

        try {
            // ✅ NEW: Pass overrideModelId for model failover support
            const { stream, modelId } = await llmService.askConversationStream(
                conversationId,
                ordered,
                userId,
                null, // summaryText — not needed for retry
                [originalMessage._id, userMessage._id],
                overrideModelId // ✅ NEW: Support model failover
            );

            // ── 6. Start SSE response and collect the full reply ───────────────────
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders?.();

            let fullReply = '';

            // ================================================================================
            // STREAMING LOOP - Errors here are NOT retriable
            // ================================================================================
            try {
                for await (const chunk of stream) {
                    const content = chunk.choices[0]?.delta?.content;
                    if (content) {
                        fullReply += content;
                        res.write(content);
                    }
                }
            } catch (streamErr) {
                // Stream interrupted mid-transfer (NOT retriable)
                logger.error('Stream iteration error (non-retriable):', {
                    requestKey,
                    message: streamErr.message,
                    messageId
                });

                if (res.writable) {
                    res.write(`\n\n⚠️ Connection interrupted. Response was not saved.`);
                }
                res.end();

                // Cache the error (don't auto-retry stream failures)
                idempotencyCache.set(requestKey, 'failed', null, {
                    message: 'Stream interrupted'
                });
                return;
            }

            // ── 7. Validate that we received content ────────────────────────────────
            if (!fullReply || !fullReply.trim()) {
                const errorMsg = 'LLM returned empty response';
                logger.error(errorMsg, { conversationId, messageId, fullReply: fullReply.length });

                if (res.headersSent) {
                    res.write(`\n\n⚠️ ${errorMsg}`);
                }
                res.end();

                // Cache this error for duplicate prevention
                idempotencyCache.set(requestKey, 'failed', null, {
                    message: errorMsg
                });
                return;
            }

            // ── 8. Save the new version ────────────────────────────────────────────
            const { newVersion } = await retryService.persistRetryResult({
                conversation,
                originalMessage,
                conversationId,
                fullReply,
                modelId
            });

            // ================================================================================
            // SUCCESS: Cache the result
            // ================================================================================
            idempotencyCache.set(requestKey, 'completed', {
                versionId: newVersion._id
            });

            res.end();

        } finally {
            clearTimeout(timeoutHandle); // ✅ Always clear timeout
        }

    } catch (err) {
        // ================================================================================
        // Pre-stream or persistence errors (retriable)
        // ================================================================================
        const requestKey = req.headers['x-request-idempotency-key'];

        logger.error('Retry prep error (retriable):', {
            requestKey,
            message: err.message,
            status: err.status || 500
        });

        if (requestKey) {
            idempotencyCache.set(requestKey, 'failed', null, {
                message: err.message,
                status: err.status || 500
            });
        }

        // If headers already sent (SSE started), write error into stream
        if (res.headersSent) {
            res.write(`\n\n⚠️ ${err.message}`);
            res.end();
        } else {
            res.status(err.status || 500).json({
                error: err.message || 'Retry failed',
                retriable: true
            });
        }
    }
}

// ─── Switch Active Version ─────────────────────────────────────────────────────

/**
 * PATCH /api/messages/:messageId/version
 *
 * Body: { versionId } OR { versionNumber }
 *
 * Sets the specified version as active and updates the parent Message's
 * displayed text and currentVersionId.
 */
async function switchVersion(req, res, next) {
    try {
        const userId = req.user.id;
        const { messageId } = req.params;
        const { versionId, versionNumber } = req.body;
        const result = await retryService.switchVersion({ userId, messageId, versionId, versionNumber });
        res.status(200).json(result);
    } catch (err) {
        logger.error('switchVersion error', { message: err.message, stack: err.stack });
        next(err);
    }
}

// ─── Delete Version ────────────────────────────────────────────────────────────

/**
 * DELETE /api/messages/:messageId/versions/:versionId
 *
 * Removes a single version. Guards:
 *  • Cannot delete the last remaining version.
 *  • Cannot delete the currently active version.
 */
async function deleteVersion(req, res, next) {
    try {
        const userId = req.user.id;
        const { messageId, versionId } = req.params;
        const result = await retryService.deleteVersion({ userId, messageId, versionId });
        res.status(200).json(result);
    } catch (err) {
        next(err);
    }
}

module.exports = {
    retryMessage,
    switchVersion,
    deleteVersion
};
