const llmService = require('../services/llm.service');
const { idempotencyCache } = require('../config/idempotencyCache');
const logger = require('../config/logger');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');

async function ask(req, res, next) {
  try {
    const userId = req.user && req.user.id;
    const { cid: conversationId } = req.params;
    const {
      message,
      overrideModelId,
      editNodeId = null,
      regenerateNodeId = null,
      useWebSearch = false
    } = req.body;

    // ================================================================================
    // NEW: Get idempotency key from header
    // ================================================================================
    const requestKey = req.headers['x-request-idempotency-key'];
    if (!requestKey) {
      return res.status(400).json({
        error: 'X-Request-Idempotency-Key header required'
      });
    }

    if (!message && !regenerateNodeId) {
      return res.status(400).json({ error: 'message or regenerateNodeId required' });
    }

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!conversationId || (!message?.trim() && !regenerateNodeId)) {
      return res.status(400).json({ error: "conversationId and message or regenerateNodeId required" });
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
        // Return cached message ID
        return res.status(200).json({
          messageId: cached.result.messageId,
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

    const abortController = new AbortController();
    let clientDisconnected = false;
    req.on('close', () => {
      clientDisconnected = true;
      abortController.abort();
      logger.info('Client disconnected mid-stream', { conversationId, requestKey });
    });

    logger.info('Entered LLM ask controller', { conversationId, requestKey });

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
      // Prepare context and start LLM stream via Service Orchestrator
      // ✅ NEW: Support Node Tree ask flow if editNodeId is provided
      let context;
      if (editNodeId) {
            context = await llmService.prepareAskContextNodeTree(
              userId,
              conversationId,
              message,
              overrideModelId,
              editNodeId,
              useWebSearch,
              abortController.signal
            );
          } else if (regenerateNodeId) {
            context = await llmService.prepareRegenerateContextNodeTree(
              userId,
              conversationId,
              overrideModelId,
              regenerateNodeId,
              useWebSearch,
              abortController.signal
            );
          } else {
            const useNodeTree = process.env.USE_NODE_TREE === 'true';
            if (useNodeTree) {
              context = await llmService.prepareAskContextNodeTree(
                userId,
                conversationId,
                message,
                overrideModelId,
                null,
                useWebSearch,
                abortController.signal
              );
            } else {
              context = await llmService.prepareAskContext(
                userId,
                conversationId,
                message,
                overrideModelId,
                useWebSearch,
                abortController.signal
              );
            }
          }
      if (!context) return; // Request aborted before stream started
      const { stream, userMsg, assistantMsg } = context;

      // START SSE RESPONSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();

      // 1. Send Metadata Event FIRST
      res.write(`event: metadata\n`);
      res.write(`data: ${JSON.stringify({
        messageId: assistantMsg._id,
        userMessageId: userMsg?._id,
      })}\n\n`);

      let fullReply = "";

      // ================================================================================
      // STREAMING LOOP - Errors here are NOT retriable
      // ================================================================================
      try {
        for await (const chunk of stream) {
          if (clientDisconnected || abortController.signal.aborted) break;
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            fullReply += content;
            // 2. Stream JSON-Safe Chunk Events
            res.write(`event: chunk\n`);
            res.write(`data: ${JSON.stringify(content)}\n\n`);
            if (res.flush) res.flush();
          }
        }

        if (clientDisconnected || abortController.signal.aborted) {
          // Save whatever partial text was collected and mark as cancelled
          await Message.findByIdAndUpdate(
            assistantMsg._id,
            { $set: { text: fullReply || '', status: 'cancelled' } }
          );
          return; // do not send SSE done event, connection is already gone
        }

        if (!fullReply || !fullReply.trim()) {
          res.write(`\n\n⚠️ LLM returned empty response`);
          res.end();

          // Cache this error for duplicate prevention
          idempotencyCache.set(requestKey, 'failed', null, {
            message: 'LLM returned empty response'
          });
          return;
        }

        // Final safety guard: catch the race where signal aborts in the same tick
        if (clientDisconnected || abortController.signal.aborted) {
          await Message.findByIdAndUpdate(
            assistantMsg._id,
            { $set: { text: fullReply || '', status: 'cancelled' } }
          );
          return;
        }

        // Finalize persistence and side effects via Service Orchestrator
        if (assistantMsg.status === 'streaming') {
          await llmService.handlePostStreamTasksNodeTree(userId, conversationId, fullReply, userMsg, assistantMsg);
        } else {
          await llmService.handlePostStreamTasks(userId, conversationId, fullReply, userMsg, assistantMsg);
        }

        // ================================================================================
        // SUCCESS: Cache the result
        // ================================================================================
        idempotencyCache.set(requestKey, 'completed', {
          messageId: assistantMsg._id
        });

        res.write("event: done\ndata: [DONE]\n\n");
        res.end();

      } catch (streamErr) {
        if (clientDisconnected || abortController.signal.aborted || streamErr.name === 'AbortError') {
          await Message.findByIdAndUpdate(
            assistantMsg._id,
            { $set: { text: fullReply || '', status: 'cancelled' } }
          );
          return;
        }
        // Stream interrupted mid-transfer (NOT retriable)
        logger.error('Stream iteration error (non-retriable)', {
          requestKey,
          error: streamErr.message,
          messageId: assistantMsg._id
        });

        if (res.writable) {
          res.write(`\n\n⚠️ Connection interrupted. Response was not saved.`);
        }
        res.end();

        // Cache the error (don't auto-retry stream failures)
        idempotencyCache.set(requestKey, 'failed', null, {
          message: 'Stream interrupted'
        });
      }

    } finally {
      clearTimeout(timeoutHandle); // ✅ Always clear timeout
    }

  } catch (err) {
    // ================================================================================
    // Pre-stream errors (retriable)
    // ================================================================================
    const requestKey = req.headers['x-request-idempotency-key'];

    logger.error("Ask prep error (retriable)", {
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

    if (!res.headersSent) {
      // If streaming hasn't started, return standard JSON error
      return res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error',
        code: err.code || null,
        retriable: err.retriable ?? false
      });
    }

    // If streaming has started, push the error directly to the active stream
    res.write(`\n\n⚠️ ${err.message}`);
    res.end();
  }
}

module.exports = { ask };


// command to check streaming from terminal:
//   curl.exe -N -X POST "http://localhost:4000/api/llm/ask" ^
// -H "Content-Type: application/json" ^
// -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4ZjcwNzg1MWRhYWVkMTI0MWUxNTg0YyIsImVtYWlsIjoiaHVzc2FpbmJhbGlrYWlAZ21haWwuY29tIiwicm9sZSI6InVzZXIiLCJ0b2tlblZlcnNpb24iOjAsImlhdCI6MTc2NzA0MzAzMywiZXhwIjoxNzY3MDQzOTMzfQ.OWIIazxaPTVkzBAbwr-awpM4iblmIIIIvtRz0YrNT88" ^
// -d "{\"conversationId\":\"6952f00ddede948744c4d1c7\",\"message\":\"write hello world code and explain??\"}"
