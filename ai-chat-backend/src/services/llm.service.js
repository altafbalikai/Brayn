const logger = require("../config/logger");
const Conversation = require("../models/Conversation");
const LLMModel = require("../models/LLMModel");
const Message = require('../models/Message');
const ConversationService = require('../services/conversation.service');
const { getSystemPrompt } = require("../utils/systemPromptCache");
const { readRelevantMemory } = require("../services/memoryRead.service");
const { assemblePrompt } = require("../utils/promptAssembler");
const { getLatestSummary, triggerSummaryIfNeeded } = require('../services/summary.service');
const { writeMessageToMemory } = require('../services/memoryWrite.service');
const Persona = require("../models/Persona");
const userMemoryService = require('../services/userMemory.service');
const { processAndStoreMemory } = userMemoryService;
const { safeFireAndForget } = require('../utils/async.utils');

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
    const error = new Error('Selected LLM model is unavailable');
    error.status = 400;
    error.code = 'MODEL_UNAVAILABLE';
    error.retriable = true;
    throw error;
  }

  return model;
}

/* ===========================
    Vector Memory (with graceful degradation)
   =========================== */
async function getVectorMemorySafe({
  userId,
  conversationId,
  userMessage,
  excludeIds = []
}) {
  try {
    return await readRelevantMemory({
      userId,
      conversationId,
      query: userMessage,
      limit: 5,
      excludeIds
    });
  } catch (err) {
    logger.warn("Vector memory unavailable", { error: err.message });
    return [];
  }
}

/**
 * Retrieves and formats high-importance user memories for prompt injection.
 * Enforces importance >= 7, confidence >= 0.5, max 5 items, and ~300 tokens.
 */
async function getInjectedUserMemory(userId) {
  try {
    const allMemories = await userMemoryService.getUserMemories(userId);

    // Step 2 & 3: Filter and Sort
    let memories = allMemories
      .filter(m => m.importance >= 7 && m.confidence >= 0.5 && m.enabled === true)
      .sort((a, b) => b.importance - a.importance || b.updatedAt - a.updatedAt);

    // Step 4: Cap at 5
    memories = memories.slice(0, 5);

    if (memories.length === 0) return '';

    // Step 5: Token guard (chars / 4 approximation)
    const calculateTokens = (items) => {
      const totalChars = items.reduce((sum, m) => sum + (m.key.length + m.value.length), 0);
      return Math.ceil(totalChars / 4);
    };

    while (calculateTokens(memories) > 300 && memories.length > 0) {
      memories.pop(); // Remove lowest-importance item
    }

    if (memories.length === 0) return '';

    // Step 6: Fire-and-forget logging
    memories.forEach(m => {
      userMemoryService.logMemoryInjection(m.userId || userId, m.key, m.value);
    });

    // Step 7: Format
    return "[User Memory]\n" + memories.map(m => `- ${m.key}: ${m.value}`).join('\n');

  } catch (err) {
    console.warn('[promptAssembly] getInjectedUserMemory failed:', err);
    return '';
  }
}

/**
 * Assemble complete system prompt with persona + memory + context
 */
async function assembleSystemPrompt(userId, conversationId) {
  try {
    // ========== SLOT 1: PERSONA SYSTEM PROMPT ==========
    let systemPrompt = '';

    // Fetch conversation to get current persona
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    // Fetch persona by currentPersonaId
    const persona = await Persona.findOne({
      id: conversation.currentPersonaId
    });

    // Load global system prompt + Conflict Rule
    let baseSystemPrompt = await getSystemPrompt();
    const conflictRule = "\n\nIf any recent conversation message explicitly contradicts a stored user memory, treat the conversation-level signal as authoritative for this session. Do not update stored memory based on this.";
    baseSystemPrompt += conflictRule;

    // Use persona.systemPrompt if available and active
    if (persona && persona.isActive) {
      systemPrompt += `[Persona: ${persona.name}]\n${persona.systemPrompt}\n\n`;
      systemPrompt += `[Core Instructions]\n${baseSystemPrompt}`;
      console.log(`✅ Using persona: ${persona.name}`);
    } else {
      // Fallback: Use global static prompt
      systemPrompt += baseSystemPrompt;
      console.warn(`⚠️ Persona not found or inactive (${conversation.currentPersonaId}). Using global prompt.`);
    }

    return systemPrompt;
  } catch (error) {
    console.error('❌ Error assembling system prompt:', error);
    // Fallback: Return global prompt
    return await getSystemPrompt();
  }
}

/* ===========================
   STREAMING RESPONSE
   =========================== */
async function askConversationStream(conversationId, messages, userId, summaryText = null, excludeMessageIds = [], overrideModelId = null) {
  try {
    const openrouter = await getOpenRouter();

    // ✅ NEW: Support model failover via overrideModelId
    let model;
    if (overrideModelId) {
      model = await LLMModel.findById(overrideModelId);
      if (!model || model.status !== "active") {
        throw Object.assign(new Error("Selected LLM model is unavailable"), {
          status: 400,
          code: "MODEL_UNAVAILABLE"
        });
      }
    } else {
      model = await resolveConversationModel(conversationId);
    }

    const MAX_CONTEXT = 4;

    // 1️⃣ Slot 1: Load system prompt (Persona + Global)
    const systemPrompt = await assembleSystemPrompt(userId, conversationId);

    const payload = [
      {
        role: "system",
        content: systemPrompt,
      }
    ];

    // 2️⃣ Slot 2: User Long-Term Memory (separate slot)
    const userMemoryText = await getInjectedUserMemory(userId);
    if (userMemoryText) {
      payload.push({ role: "system", content: userMemoryText });
    }

    // 3️⃣ Slot 3: Inject conversation summary (if exists) (separate slot)
    if (summaryText) {
      payload.push({ role: "system", content: `Conversation Summary (prior context):\n${summaryText}` });
    }

    // 4️⃣ Trim + normalize conversation messages
    const normalized = normalizeMessages(messages.slice(-MAX_CONTEXT));

    // Collect all IDs from the context window plus explicit excludes to prevent self-retrieval
    const contextIds = [...excludeMessageIds];
    messages.forEach(m => {
      if (m._id) contextIds.push(m._id);
    });

    const lastUserMessage =
      [...normalized].reverse().find(m => m.role === "user")?.text || "";

    const retrievedMemory = await getVectorMemorySafe({
      userId,
      conversationId,
      userMessage: lastUserMessage,
      excludeIds: contextIds
    });

    console.log("Retrieved vector memory items (filtered):", retrievedMemory.length);

    // 5️⃣ Slot 4: Inject Vector Memory (separate slot)
    if (retrievedMemory.length > 0) {
      const vectorContextText = `Relevant past context:\n${retrievedMemory
        .map(m => `- ${m.payload.role}: ${m.payload.text || ""}`)
        .join("\n")}`;
      payload.push({ role: "system", content: vectorContextText });
    }

    // 6️⃣ Slot 5: Messages
    payload.push(...buildMessagesPayload(normalized));

    console.log("Payload:", payload);

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

/**
 * Orchestrates the "ask" flow preparation:
 * - Persists user message
 * - Creates empty assistant message placeholder
 * - Loads context
 * - Loads summary
 */
async function prepareAskContext(userId, conversationId, messageText, overrideModelId = null) {
  // 1. Save user message
  const userMsg = await ConversationService.addMessage(userId, conversationId, {
    role: "user",
    text: messageText,
  });

  // 1b. Create Assistant Message Placeholder BEFORE Streaming
  const conversation = await Conversation.findById(conversationId);
  const assistantMsg = await Message.create({
    conversationId,
    role: 'assistant',
    text: '',
    userId,
    personaId: conversation ? conversation.currentPersonaId : null,
    versions: [],
    isRetried: false
  });

  // 2. Load recent context window (last 4 messages)
  const MAX_CONTEXT = 4;
  const recentMessages = await Message.find({ conversationId })
    .sort({ createdAt: -1 })
    .limit(MAX_CONTEXT)
    .lean();
  let ordered = recentMessages.reverse();

  // Safety: ensure user message is present in context
  if (!ordered.length || ordered[ordered.length - 1]._id?.toString() !== userMsg._id?.toString()) {
    ordered.push({
      role: userMsg.role,
      text: userMsg.text,
      _id: userMsg._id
    });
  }

  // EXCLUDE PLACEHOLDER FROM LLM CONTEXT
  ordered = ordered.filter(m => !(m.role === 'assistant' && m.text === ''));

  // 3. Load summary
  const latestSummary = await getLatestSummary(conversationId);
  const summaryText = latestSummary?.summaryText || null;

  // 4. Return all needed for streaming
  // ✅ NEW: Pass overrideModelId to streaming service
  const { stream, modelId } = await askConversationStream(
    conversationId,
    ordered,
    userId,
    summaryText,
    [userMsg._id, assistantMsg._id], // Exclude both from vector memory retrieval context
    overrideModelId // ✅ NEW: Support model failover
  );

  return { stream, modelId, userMsg, assistantMsg };
}

/**
 * Orchestrates post-streaming tasks:
 * - Persists assistant message
 * - Fire-and-forget background tasks
 */
async function handlePostStreamTasks(userId, conversationId, fullReply, userMsg, assistantMsg) {
  // 1. Save assistant message (update the placeholder)
  assistantMsg.text = fullReply;
  await assistantMsg.save();

  // 2. Fire-and-forget side effects
  safeFireAndForget(() => writeMessageToMemory(userMsg));
  safeFireAndForget(() => writeMessageToMemory(assistantMsg));

  safeFireAndForget(() => processAndStoreMemory(userMsg.text, userMsg.role, userId, conversationId));
  safeFireAndForget(() => processAndStoreMemory(assistantMsg.text, assistantMsg.role, userId, conversationId));

  safeFireAndForget(() => triggerSummaryIfNeeded(conversationId));

  return assistantMsg;
}

module.exports = {
  askConversation,
  askConversationStream,
  askGemini,
  askGeminiStream,
  getInjectedUserMemory,
  prepareAskContext,
  handlePostStreamTasks
};
