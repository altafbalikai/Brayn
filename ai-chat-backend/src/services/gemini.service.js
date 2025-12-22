const { OpenRouter } = require("@openrouter/sdk");
const logger = require("../config/logger");

// Initialize OpenRouter client
const openrouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY
});

function normalizeMessages(messages) {
  if (!messages) return [];

  if (Array.isArray(messages)) {
    return messages
      .map((m) => {
        let role = (m.role || "user").toLowerCase();
        let text = m.text ?? "";

        if (role === "model" || role === "assistant") role = "assistant";

        if (!text.trim()) return null;

        return {
          role,
          text,
          imageUrl: m.imageUrl || null
        };
      })
      .filter(Boolean);
  }

  if (typeof messages === "string") return [{ role: "user", text: messages }];
  if (messages && messages.text) return [{ role: "user", text: messages.text }];

  return [];
}

function buildMessagesPayload(normalizedMessages) {
  return normalizedMessages.map((m) => {
    if (m.imageUrl) {
      return {
        role: m.role,
        content: [
          { type: "text", text: m.text },
          { type: "image_url", image_url: { url: m.imageUrl } }
        ]
      };
    }
    return { role: m.role, content: m.text };
  });
}

// function buildSystemMessage() {
//   return {
//     role: "system",
//     content: `
//               You are a helpful programming assistant. Formatting rules (VERY IMPORTANT): 
//               - Use fenced code blocks (```) ONLY for full programs or multi- line code.
//               - Do NOT use triple backticks for single words, class names, or function names.
//               - Use inline code(single backticks) for identifiers like TreeNode, build(), variables, etc.
//               - Explanations must be normal paragraphs, not code blocks.
//               - Follow proper Markdown semantics.
//             `
//         };
//       }


/**
 * 🔵 FULL-RESPONSE VERSION (existing)
 */
async function askGemini(conversation, model = "tngtech/deepseek-r1t2-chimera:free") {
  try {
    const MAX_CONTEXT = 8;
    const normalized = normalizeMessages(conversation.slice(-MAX_CONTEXT));
    const messagesPayload = buildMessagesPayload(normalized);

    const stream = await openrouter.chat.send({
      model,
      messages: messagesPayload,
      stream: true
    });

    let reply = "";
    for await (const chunk of stream) {
      // console.log("Received chunk:", chunk);
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        reply += content;
        process.stdout.write(content);
      }
    }
    // console.log(reply);

    return reply || "No reply from Gemini";
  } catch (err) {
    logger.error("Gemini API error:", {
      message: err.message,
      response: err.response?.data,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined
    });
    throw new Error("Failed to fetch response from Gemini");
  }
}

/**
 * 🔴 STREAMING VERSION (new)
 * Returns the raw async iterator (stream)
 */
async function askGeminiStream(conversation, model = "tngtech/deepseek-r1t2-chimera:free") {
  try {
    const MAX_CONTEXT = 8;
    const normalized = normalizeMessages(conversation.slice(-MAX_CONTEXT));
    const messagesPayload = buildMessagesPayload(normalized);

    // RETURN stream directly — do NOT iterate
    return await openrouter.chat.send({
      model,
      messages: messagesPayload,
      stream: true
    });
  } catch (err) {
    logger.error("Gemini STREAM API error:", {
      message: err.message,
      response: err.response?.data,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined
    });
    throw new Error("Failed to fetch streaming response from Gemini");
  }
}

module.exports = { askGemini, askGeminiStream };

