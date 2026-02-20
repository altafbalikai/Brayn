const logger = require("../config/logger");
const Conversation = require("../models/Conversation");
const LLMModel = require("../models/LLMModel");
const { getSystemPrompt } = require("../utils/systemPromptCache");
const { readRelevantMemory } = require("../services/memoryRead.service");
const { assemblePrompt } = require("../utils/promptAssembler");
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

/* ===========================
   Core Resolver
   =========================== */

async function resolveConversationModel(conversationId) {
  const conv = await Conversation.findById(conversationId);
  if (!conv) {
    throw Object.assign(new Error("Conversation not found"), { status: 404 });
  }

  if (!conv.selectedModelId) {
    throw Object.assign(
      new Error("Conversation has no selected model"),
      { status: 400 }
    );
  }

  const model = await LLMModel.findById(conv.selectedModelId);
  if (!model || model.status !== "active") {
    throw Object.assign(
      new Error("Selected LLM model is unavailable"),
      { status: 400 }
    );
  }

  return model;
}

/* ===========================
    Vector Memory (with graceful degradation)
   =========================== */
async function getVectorMemorySafe({
  userId,
  conversationId,
  userMessage
}) {
  try {
    return await readRelevantMemory({
      userId,
      conversationId,
      query: userMessage,
      limit: 5
    });
  } catch (err) {
    logger.warn("Vector memory unavailable", { error: err.message });
    return [];
  }
}

/* ===========================
   STREAMING RESPONSE
   =========================== */
async function askConversationStream(conversationId, messages, userId, summaryText = null) {
  try {
    const openrouter = await getOpenRouter();
    const model = await resolveConversationModel(conversationId);

    const MAX_CONTEXT = 4;

    // 1️⃣ Load system prompt
    let systemPrompt = await getSystemPrompt();

    // 2️⃣ Inject conversation summary (if exists)
    if (summaryText) {
      systemPrompt += `\n\nConversation Summary (prior context):\n${summaryText}`;
    }

    // 3️⃣ Trim + normalize conversation messages
    const normalized = normalizeMessages(messages.slice(-MAX_CONTEXT));

    const lastUserMessage =
      [...normalized].reverse().find(m => m.role === "user")?.text || "";

    const retrievedMemory = await getVectorMemorySafe({
      userId,
      conversationId,
      userMessage: lastUserMessage
    });

    console.log("Retrieved vector memory items:", retrievedMemory);

    if (retrievedMemory.length > 0) {
      systemPrompt += `\n\nRelevant past context:\n${retrievedMemory
        .map(m => `- ${m.payload.role}: ${m.payload.text || ""}`)
        .join("\n")}`;
    }

    // 4️⃣ Inject system prompt FIRST
    const payload = [
      {
        role: "system",
        content: systemPrompt,
      },
      ...buildMessagesPayload(normalized),
    ];

    // 5️⃣ Send to LLM
    return {
      stream: await openrouter.chat.send({
        model: model.openRouterModelId,
        messages: payload,
        stream: true,
      }),
      modelId: model._id,
    };
  } catch (err) {
    logger.error("LLM stream error", {
      message: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
    throw err;
  }
}

/* ===========================
   FULL RESPONSE
   =========================== */

async function askConversation(conversationId, messages) {
  try {
    const openrouter = await getOpenRouter();
    const model = await resolveConversationModel(conversationId);

    const MAX_CONTEXT = 8;
    const normalized = normalizeMessages(messages.slice(-MAX_CONTEXT));
    const payload = buildMessagesPayload(normalized);

    const stream = await openrouter.chat.send({
      model: model.openRouterModelId,
      messages: payload,
      stream: true,
    });

    let reply = "";
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) reply += content;
    }

    return {
      text: reply || "No response from model",
      modelId: model._id,
    };
  } catch (err) {
    logger.error("LLM ask error", {
      message: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
    throw err;
  }
}

/**
 * FULL RESPONSE
 */
async function askGemini(
  conversation,
  model = "nvidia/nemotron-3-nano-30b-a3b:free"
  // model = "openai/gpt-oss-120b:free"
  // model = "tngtech/deepseek-r1t2-chimera:free"
  // model = "google/gemma-3n-e2b-it:free"
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
 * STREAMING VERSION
 */
async function askGeminiStream(
  conversation,
  // model = "tngtech/deepseek-r1t2-chimera:free"
  // model = "google/gemma-3n-e2b-it:free"
  model = "nvidia/nemotron-3-nano-30b-a3b:free"
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

module.exports = { askConversation, askConversationStream, askGemini, askGeminiStream };
