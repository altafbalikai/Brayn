const { askConversationStream } = require('../services/gemini.service');
const ConversationService = require('../services/conversation.service');
const Message = require('../models/Message');
const { getLatestSummary } = require('../services/summary.service');

async function ask(req, res, next) {
  try {
    const userId = req.user && req.user.id;
    const { cid: conversationId } = req.params;
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'message required' });
    }

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!conversationId || !message?.trim()) {
      return res.status(400).json({ error: "conversationId and message are required" });
    }

    // START STREAM
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    // 1) Save user message
    const userMsg = await ConversationService.addMessage(userId, conversationId, {
      role: "user",
      text: message,
    });

    // 2) Load last N messages (reduced from 8 → 4; summary carries long-range context)
    const MAX_CONTEXT = 4;
    const recentMessages = await Message.find({ conversationId })
      .sort({ createdAt: -1 })
      .limit(MAX_CONTEXT)
      .lean();
    const ordered = recentMessages.reverse();

    // Safety: ensure user message is present
    if (!ordered.length || ordered[ordered.length - 1]._id?.toString() !== userMsg._id?.toString()) {
      ordered.push({
        role: userMsg.role,
        text: userMsg.text,
      });
    }

    // 3) Load conversation summary (safe — returns null on failure)
    const latestSummary = await getLatestSummary(conversationId);
    const summaryText = latestSummary?.summaryText || null;

    // 4) Ask LLM STREAMING (summary + vector memory injected inside gemini.service)
    const { stream, modelId } = await askConversationStream(
      conversationId,
      ordered,
      userId,
      summaryText
    );

    let fullReply = "";

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullReply += content;

        // Send chunk to frontend immediately
        res.write(content);
      }
    }

    // 5) Save final assistant message
    await ConversationService.addMessage(userId, conversationId, {
      role: "assistant",
      text: fullReply,
    });

    res.end(); // close SSE

  } catch (err) {
    console.error("Streaming error:", err);
    // Inject a styled div with specific data attributes for the frontend to target
    res.write(`\n\n⚠️ Service Interruption. This model is temporarily unavailable. You can retry or switch to a different model to continue.`);
    res.end();
  }
}

module.exports = { ask };


// command to check streaming from terminal:
//   curl.exe -N -X POST "http://localhost:4000/api/llm/ask" ^
// -H "Content-Type: application/json" ^
// -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4ZjcwNzg1MWRhYWVkMTI0MWUxNTg0YyIsImVtYWlsIjoiaHVzc2FpbmJhbGlrYWlAZ21haWwuY29tIiwicm9sZSI6InVzZXIiLCJ0b2tlblZlcnNpb24iOjAsImlhdCI6MTc2NzA0MzAzMywiZXhwIjoxNzY3MDQzOTMzfQ.OWIIazxaPTVkzBAbwr-awpM4iblmIIIIvtRz0YrNT88" ^
// -d "{\"conversationId\":\"6952f00ddede948744c4d1c7\",\"message\":\"write hello world code and explain??\"}"
