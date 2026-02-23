const llmService = require('../services/llm.service');

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

    console.log(`🔵 POST /api/llm/${conversationId}/ask | Message: ${message.substring(0, 50)}...`);

    // Prepare context and start LLM stream via Service Orchestrator
    const { stream, userMsg } = await llmService.prepareAskContext(userId, conversationId, message);

    // START SSE RESPONSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    let fullReply = "";

    // Consume stream and send to client
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullReply += content;
        res.write(content);
      }
    }

    // Finalize persistence and side effects via Service Orchestrator
    await llmService.handlePostStreamTasks(userId, conversationId, fullReply, userMsg);

    res.end();

  } catch (err) {
    console.error("Streaming error:", err);
    res.write(`\n\n⚠️ Service Interruption. This model is temporarily unavailable or free models are temporarily rate-limited upstream. Please retry shortly or switch to a different model to continue.`);
    res.end();
  }
}

module.exports = { ask };


// command to check streaming from terminal:
//   curl.exe -N -X POST "http://localhost:4000/api/llm/ask" ^
// -H "Content-Type: application/json" ^
// -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4ZjcwNzg1MWRhYWVkMTI0MWUxNTg0YyIsImVtYWlsIjoiaHVzc2FpbmJhbGlrYWlAZ21haWwuY29tIiwicm9sZSI6InVzZXIiLCJ0b2tlblZlcnNpb24iOjAsImlhdCI6MTc2NzA0MzAzMywiZXhwIjoxNzY3MDQzOTMzfQ.OWIIazxaPTVkzBAbwr-awpM4iblmIIIIvtRz0YrNT88" ^
// -d "{\"conversationId\":\"6952f00ddede948744c4d1c7\",\"message\":\"write hello world code and explain??\"}"
