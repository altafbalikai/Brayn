const logger = require("../config/logger");

let openRouterClient = null;

/**
 * Lazy-load OpenRouter SDK (ESM-safe in CommonJS)
 */
async function getOpenRouter() {
  if (!openRouterClient) {
    const module = await import("@openrouter/sdk");
    const OpenRouter = module.OpenRouter || module.default;

    openRouterClient = new OpenRouter({
      apiKey: process.env.OPENROUTER_API_KEY,
    });
  }
  return openRouterClient;
}

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
          imageUrl: m.imageUrl || null,
        };
      })
      .filter(Boolean);
  }

  if (typeof messages === "string")
    return [{ role: "user", text: messages }];

  if (messages && messages.text)
    return [{ role: "user", text: messages.text }];

  return [];
}

function buildMessagesPayload(normalizedMessages) {
  return normalizedMessages.map((m) => {
    if (m.imageUrl) {
      return {
        role: m.role,
        content: [
          { type: "text", text: m.text },
          { type: "image_url", image_url: { url: m.imageUrl } },
        ],
      };
    }
    return { role: m.role, content: m.text };
  });
}

/**
 * 🔵 FULL RESPONSE
 */
async function askGemini(
  conversation,
  model = "tngtech/deepseek-r1t2-chimera:free"
) {
  try {
    const openrouter = await getOpenRouter();

    const MAX_CONTEXT = 8;
    const normalized = normalizeMessages(conversation.slice(-MAX_CONTEXT));
    const messagesPayload = buildMessagesPayload(normalized);

    const stream = await openrouter.chat.send({
      model,
      messages: messagesPayload,
      stream: true,
    });

    let reply = "";
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) reply += content;
    }

    return reply || "No reply from Gemini";
  } catch (err) {
    logger.error("Gemini API error", {
      message: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
    throw new Error("Failed to fetch response from Gemini");
  }
}

/**
 * 🔴 STREAMING VERSION
 */
async function askGeminiStream(
  conversation,
  model = "tngtech/deepseek-r1t2-chimera:free"
) {
  try {
    const openrouter = await getOpenRouter();

    const MAX_CONTEXT = 8;
    const normalized = normalizeMessages(conversation.slice(-MAX_CONTEXT));
    const messagesPayload = buildMessagesPayload(normalized);

    return await openrouter.chat.send({
      model,
      messages: messagesPayload,
      stream: true,
    });
  } catch (err) {
    logger.error("Gemini STREAM API error", {
      message: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
    throw new Error("Failed to fetch streaming response from Gemini");
  }
}

module.exports = { askGemini, askGeminiStream };
