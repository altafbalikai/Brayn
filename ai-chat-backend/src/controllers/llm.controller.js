// // src/controllers/llm.controller.js
// const { askGemini } = require('../services/gemini.service');
// const ConversationService = require('../services/conversation.service');
// const Message = require('../models/Message');

// async function ask(req, res, next) {
//   try {
//     const userId = req.user && req.user.id;
//     const { message, conversationId } = req.body;
//     if (!message) return res.status(400).json({ error: 'message required' });

//     // 1) Save the user's message first
//     const userMsg = await ConversationService.addMessage(userId, conversationId, {
//       role: 'user',
//       text: message,
//     });

//     // 2) Retrieve last N messages for context (most recent first, then reverse to chronological)
//     // Aligned with MAX_CONTEXT in gemini.service.js (8 messages)
//     const MAX_CONTEXT = 8;
//     const recentMessages = await Message.find({ conversationId })
//       .sort({ createdAt: -1 })
//       .limit(MAX_CONTEXT)
//       .lean();

//     const ordered = recentMessages.reverse(); // earliest -> latest

//     // Optional: include the newly saved user message at the end if not present
//     // (should already be present because we saved it above and then read from DB,
//     // but keep this guard for race-safety)
//     if (!ordered.length || ordered[ordered.length - 1].text !== userMsg.text) {
//       ordered.push({
//         role: userMsg.role,
//         text: userMsg.text
//       });
//     }

//     // 3) Debug log so you can verify the exact payload sent to Gemini
//     // console.log('--- Gemini payload ---');
//     // console.log(
//     //   JSON.stringify(
//     //     ordered.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
//     //     null,
//     //     2
//     //   )
//     // );
//     // console.log('--- end payload ---');

//     // 4) Call Gemini with the ordered context
//     const ConversationSummary = require('../models/ConversationSummary');

//     // Try to fetch latest summary for this conversation
//     const latestSummary = await ConversationSummary.findOne({ conversationId }).sort({ version: -1 }).lean();

//     let contextWithMemory = [];
//     if (latestSummary) {
//       contextWithMemory.push({
//         role: 'system',
//         text: `Memory Summary: ${latestSummary.summaryText}`,
//       });
//     }
//     contextWithMemory = [...contextWithMemory, ...ordered];

//     // Ask Gemini with memory + current context
//     const reply = await askGemini(contextWithMemory);


//     // 5) Save assistant's reply as new message
//     const aiMsg = await ConversationService.addMessage(userId, conversationId, {
//       role: 'assistant',
//       text: reply,
//     });

//     // 6) Return both saved messages and the reply text
//     return res.status(200).json({
//       success: true,
//       reply: reply || aiMsg?.text || '',
//       userMessage: userMsg || null,
//       aiMessage: aiMsg || null,
//     });

//   } catch (err) {
//     next(err);
//   }
// }

// module.exports = { ask };

const { askGeminiStream } = require('../services/gemini.service');
const ConversationService = require('../services/conversation.service');
const Message = require('../models/Message');
const ConversationSummary = require('../models/ConversationSummary');

async function ask(req, res, next) {
  try {
    const userId = req.user && req.user.id;
    const { message, conversationId } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });

    // START STREAM
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // 1) Save user message
    const userMsg = await ConversationService.addMessage(userId, conversationId, {
      role: "user",
      text: message,
    });

    // 2) Load last messages
    const MAX_CONTEXT = 8;
    const recentMessages = await Message.find({ conversationId })
      .sort({ createdAt: -1 })
      .limit(MAX_CONTEXT)
      .lean();
    const ordered = recentMessages.reverse();

    // Insert if needed
    if (!ordered.length || ordered[ordered.length - 1].text !== userMsg.text) {
      ordered.push({ role: userMsg.role, text: userMsg.text });
    }

    // 3) Load memory summary
    let context = [];
    const latestSummary = await ConversationSummary.findOne({ conversationId })
      .sort({ version: -1 })
      .lean();

    if (latestSummary) {
      context.push({
        role: "system",
        text: `Memory Summary: ${latestSummary.summaryText}`,
      });
    }

    context = [...context, ...ordered];

    // 4) Ask Gemini STREAMING
    const stream = await askGeminiStream(context);

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
    res.write("Error occurred.");
    res.end();
  }
}

module.exports = { ask };


// command to check streaming from terminal:
//   curl.exe -N -X POST "http://localhost:4000/api/llm/ask" ^
// -H "Content-Type: application/json" ^
// -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4ZjcwNzg1MWRhYWVkMTI0MWUxNTg0YyIsImVtYWlsIjoiaHVzc2FpbmJhbGlrYWlAZ21haWwuY29tIiwicm9sZSI6InVzZXIiLCJ0b2tlblZlcnNpb24iOjAsImlhdCI6MTc2NTU4NDM3NSwiZXhwIjoxNzY1NTg1Mjc1fQ.muBJj2-MdRxVgNtQgVuYiSG4BU4G2t0WxIw45mNFFsg" ^
// -d "{\"conversationId\":\"6939f751ca5e3deb56b21db3\",\"message\":\"What you say about football sport?\"}"
