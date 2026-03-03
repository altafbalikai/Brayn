// src/controllers/retry.controller.js
const mongoose = require('mongoose');
const Message = require('../models/Message');
const MessageVersion = require('../models/MessageVersion');
const Conversation = require('../models/Conversation');
const llmService = require('../services/llm.service');
const logger = require('../config/logger');

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

        // ── 1. Verify conversation ownership ───────────────────────────────────
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }
        if (conversation.userId.toString() !== userId) {
            return res.status(403).json({ error: 'Not authorized to retry in this conversation' });
        }

        // ── 2. Fetch the original assistant message ────────────────────────────
        const originalMessage = await Message.findOne({
            _id: messageId,
            conversationId,
            role: 'assistant'
        });
        if (!originalMessage) {
            return res.status(404).json({ error: 'Assistant message not found in this conversation' });
        }
        logger.info('Original message found:', { messageId: originalMessage._id, textLength: originalMessage.text?.length || 0 });

        // ── 3. Get the highest existing version number ──────────────────────────
        const existingVersions = await MessageVersion.find({ messageId: originalMessage._id })
            .sort({ version: -1 })
            .limit(1)
            .lean();

        const highestVersion = existingVersions.length > 0 ? existingVersions[0].version : 0;
        logger.info('Current versions', { messageId, highestVersion, versionsCount: originalMessage.versions.length });

        // ── 4. Snapshot version 1 if it doesn't exist yet ────────────────────────
        //    On the very first retry, we need to capture the original message
        if (highestVersion === 0 && originalMessage.text && originalMessage.text.trim()) {
            try {
                const v1 = await MessageVersion.create({
                    messageId: originalMessage._id,
                    conversationId,
                    version: 1,
                    content: originalMessage.text,
                    personaId: originalMessage.personaId,
                    modelId: originalMessage.llmMetadata?.model || null,
                    generatedAt: originalMessage.createdAt,
                    isActive: false // will be superseded by the new version
                });

                originalMessage.versions.push(v1._id);
                logger.info('Created version 1 snapshot', { messageId, v1Id: v1._id });
            } catch (err) {
                // Handle race condition: another request may have created v1 simultaneously
                if (err.code === 11000 && err.message.includes('version_1')) {
                    logger.warn('Version 1 already exists (race condition handled)', { messageId });
                    // Refresh to get the latest version number
                    const latestVersions = await MessageVersion.find({ messageId: originalMessage._id })
                        .sort({ version: -1 })
                        .limit(1)
                        .lean();
                    if (latestVersions.length > 0) {
                        // Update highestVersion for the subsequent operations
                        // We'll need to recalculate nextVersion below
                    }
                } else {
                    throw err;
                }
            }
        } else if (highestVersion === 0) {
            logger.warn('Original message has empty text, skipping version snapshot', { messageId });
        }

        // ── 4. Find the user message that prompted this response (Deterministic) ───────────────
        const messages = await Message.find({ conversationId })
            .sort({ createdAt: 1 })
            .lean();

        // Find index of assistant message
        const index = messages.findIndex(
            m => m._id.toString() === originalMessage._id.toString()
        );

        if (index <= 0) {
            return res.status(400).json({
                error: 'Could not determine previous user message'
            });
        }

        // Walk backwards to find nearest user message
        const userMessage = messages
            .slice(0, index)
            .reverse()
            .find(m => m.role === 'user');

        if (!userMessage) {
            return res.status(400).json({ error: 'Could not find the user message that prompted this response' });
        }

        // ── 5. Build context and start LLM stream ──────────────────────────────
        const MAX_CONTEXT = 4;
        const recentMessages = await Message.find({ conversationId })
            .sort({ createdAt: -1 })
            .limit(MAX_CONTEXT)
            .lean();
        const ordered = recentMessages.reverse();

        // Ensure the user prompt is in context
        if (!ordered.some(m => m._id.toString() === userMessage._id.toString())) {
            ordered.push({ role: userMessage.role, text: userMessage.text, _id: userMessage._id });
        }

        const { stream, modelId } = await llmService.askConversationStream(
            conversationId,
            ordered,
            userId,
            null, // summaryText — not needed for retry
            [originalMessage._id, userMessage._id]
        );

        // ── 6. Start SSE response and collect the full reply ───────────────────
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders?.();

        let fullReply = '';

        try {
            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content;
                if (content) {
                    fullReply += content;
                    res.write(content);
                }
            }
        } catch (streamErr) {
            logger.error('Stream iteration error:', { message: streamErr.message, stack: streamErr.stack });
            fullReply = '';
        }

        // ── 7. Validate that we received content ────────────────────────────────
        if (!fullReply || !fullReply.trim()) {
            const errorMsg = 'LLM returned empty response';
            logger.error(errorMsg, { conversationId, messageId, fullReply: fullReply.length });

            if (res.headersSent) {
                res.write(`\n\n⚠️ ${errorMsg}`);
            }
            res.end();
            return;
        }

        // ── 8. Save the new version ────────────────────────────────────────────
        // Recalculate highest version right before creating to handle race conditions
        const finalVersionCheck = await MessageVersion.find({ messageId: originalMessage._id })
            .sort({ version: -1 })
            .limit(1)
            .lean();
        
        const nextVersion = (finalVersionCheck.length > 0 ? finalVersionCheck[0].version : 0) + 1;
        logger.info('Creating version', { messageId, nextVersion });

        const newVersion = await MessageVersion.create({
            messageId: originalMessage._id,
            conversationId,
            parentMessageId: originalMessage._id,
            version: nextVersion,
            content: fullReply,
            personaId: conversation.currentPersonaId,
            modelId: modelId?.toString() || null,
            isActive: true
        });

        logger.info('Created new version', { messageId, version: nextVersion, contentLength: fullReply.length });

        // Deactivate all other versions
        await MessageVersion.updateMany(
            { messageId: originalMessage._id, _id: { $ne: newVersion._id } },
            { $set: { isActive: false } }
        );

        // ── 9. Update the parent Message ───────────────────────────────────────
        originalMessage.versions.push(newVersion._id);
        originalMessage.currentVersionId = newVersion._id;
        originalMessage.text = fullReply; // update displayed text
        originalMessage.isRetried = true;

        const savedMessage = await originalMessage.save();
        logger.info('Message saved after retry', {
            messageId: savedMessage._id,
            versions: savedMessage.versions.length,
            currentVersionId: savedMessage.currentVersionId
        });

        // Update conversation timestamp
        conversation.updatedAt = new Date();
        await conversation.save();

        res.end();
    } catch (err) {
        logger.error('Retry error:', { message: err.message, stack: err.stack });
        // If headers already sent (SSE started), write error into stream
        if (res.headersSent) {
            res.write(`\n\n⚠️ Retry failed. Please try again shortly.`);
            res.end();
        } else {
            next(err);
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

        logger.info('switchVersion called', { messageId, versionId, versionNumber, userId });

        // ── 1. Find message and verify ownership ───────────────────────────────
        let message = await Message.findById(messageId);

        // Fallback: try as string ID if not found (sometimes Mongoose has issues with conversion)
        if (!message) {
            logger.warn('Message not found by ID, trying string query', { messageId });
            message = await Message.findOne({ _id: messageId });
        }

        if (!message) {
            logger.error('Message not found in switchVersion', { messageId, userId });
            return res.status(404).json({ error: 'Message not found' });
        }

        logger.info('Message found', { messageId, versions: message.versions.length, conversationId: message.conversationId });

        const conversation = await Conversation.findById(message.conversationId);
        if (!conversation || conversation.userId.toString() !== userId) {
            logger.error('Not authorized for switchVersion', { conversationId: message.conversationId, userId });
            return res.status(403).json({ error: 'Not authorized' });
        }

        // ── 2. Find the target version ─────────────────────────────────────────
        let targetVersion;

        if (versionId) {
            targetVersion = await MessageVersion.findOne({ _id: versionId, messageId });
            logger.info('Looking for version by ID', { versionId, messageId, found: !!targetVersion });
        } else if (versionNumber) {
            targetVersion = await MessageVersion.findOne({ messageId, version: versionNumber });
            logger.info('Looking for version by number', { versionNumber, messageId, found: !!targetVersion });
        } else {
            return res.status(400).json({ error: 'Provide versionId or versionNumber' });
        }

        if (!targetVersion) {
            logger.error('Target version not found', { messageId, versionId, versionNumber });
            return res.status(404).json({ error: 'Version not found for this message' });
        }

        // ── 3. Activate the target, deactivate others ──────────────────────────
        await MessageVersion.setActiveVersion(messageId, targetVersion._id);

        // ── 4. Update Message with new displayed text ──────────────────────────
        message.currentVersionId = targetVersion._id;
        message.text = targetVersion.content;
        await message.save();

        // ── 5. Get total versions for response ─────────────────────────────────
        const allVersions = await MessageVersion.getVersionsByMessage(messageId);

        logger.info('Version switched successfully', { messageId, targetVersion: targetVersion.version, totalVersions: allVersions.length });

        res.status(200).json({
            success: true,
            message: {
                messageId: message._id,
                currentVersionId: targetVersion._id,
                content: targetVersion.content,
                version: targetVersion.version,
                totalVersions: allVersions.length
            }
        });
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

        // ── 1. Find message and verify ownership ───────────────────────────────
        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ error: 'Message not found' });
        }

        const conversation = await Conversation.findById(message.conversationId);
        if (!conversation || conversation.userId.toString() !== userId) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        // ── 2. Find the version ────────────────────────────────────────────────
        const version = await MessageVersion.findOne({ _id: versionId, messageId });
        if (!version) {
            return res.status(404).json({ error: 'Version not found' });
        }

        // ── 3. Safety checks ──────────────────────────────────────────────────
        if (message.versions.length <= 1) {
            return res.status(400).json({ error: 'Cannot delete the last remaining version' });
        }

        if (version.isActive) {
            return res.status(400).json({ error: 'Cannot delete the active version. Switch to another version first.' });
        }

        // ── 4. Remove from versions array and delete document ──────────────────
        message.versions = message.versions.filter(
            v => v.toString() !== versionId
        );
        await message.save();

        await MessageVersion.findByIdAndDelete(versionId);

        res.status(200).json({
            success: true,
            message: 'Version deleted',
            remainingVersions: message.versions.length
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    retryMessage,
    switchVersion,
    deleteVersion
};
