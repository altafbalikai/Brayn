const mongoose = require('mongoose');
const logger = require("../config/logger");
const Conversation = require("../models/Conversation");
const LLMModel = require("../models/LLMModel");
const Message = require('../models/Message');
const ConversationService = require('../services/conversation.service');
const { getSystemPrompt } = require("../utils/systemPromptCache");
const { readRelevantMemory } = require("../services/memoryRead.service");
const { searchAndFetch } = require('./webSearch.service');
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
  parentConversationId = undefined,
  userMessage,
  excludeIds = []
}) {
  try {
    return await readRelevantMemory({
      userId,
      conversationId,
      parentConversationId,
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
    logger.warn('[promptAssembly] getInjectedUserMemory failed', { message: err?.message });
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
      logger.info('Using persona', { personaName: persona.name, conversationId });
    } else {
      // Fallback: Use global static prompt
      systemPrompt += baseSystemPrompt;
      logger.warn('Persona not found or inactive; using global prompt', {
        conversationId,
        currentPersonaId: conversation.currentPersonaId,
      });
    }

    return systemPrompt;
  } catch (error) {
    logger.error('Error assembling system prompt', {
      message: error?.message,
      stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined,
    });
    // Fallback: Return global prompt
    return await getSystemPrompt();
  }
}

/**
 * Formats searchAndFetch() results into a system prompt string.
 * Returns '' if webResults is null or has no usable content — never throws.
 * @param {{ snippets: Array, pages: Array } | null} webResults
 * @returns {string}
 */
function formatWebContext(webResults) {
  if (!webResults) return '';
  const parts = [];

  if (webResults.pages && webResults.pages.length > 0) {
    parts.push(
      '### Live Web Search Results (retrieved just now — treat as current ground truth)\n' +
      'The following was fetched from the web seconds ago and supersedes your training data. ' +
      'Answer using ONLY what is stated in these results. ' +
      'Cite ONLY the exact Source URLs listed below — do NOT invent, guess, or substitute any other URLs. ' +
      'If the content is insufficient to answer fully, say so explicitly instead of supplementing with training data.\n' +
      'If the source appears to be a prediction market, forum, or opinion site, ' +
      'explicitly note that uncertainty to the user rather than presenting it as confirmed fact.\n'
    );
    for (const page of webResults.pages) {
      parts.push(`**Source:** ${page.url}\n${page.content}\n---`);
    }
  } else if (webResults.snippets && webResults.snippets.length > 0) {
    parts.push(
      '### Live Web Search Results — snippets (retrieved just now)\n' +
      'Answer using ONLY these snippets. Do not invent facts beyond what is stated here. ' +
      'Cite only the URLs listed below — do not fabricate sources.\n'
    );
    for (const s of webResults.snippets) {
      parts.push(`**${s.title}** (${s.url})\n${s.snippet}`);
    }
  }

  const MAX_CHARS = parseInt(process.env.WEB_SEARCH_MAX_CHARS, 10) || 8000;
  const MAX_URLS_TO_FETCH = 2;
  const MAX_TOTAL_CHARS = MAX_CHARS * MAX_URLS_TO_FETCH;

  const resultStr = parts.join('\n');
  if (!resultStr.trim()) return '';

  const citationRules =
    '\n---\n' +
    'CRITICAL OUTPUT RULE — violations will break the UI:\n' +
    '- You MUST NOT output 【】 markers, [N†] markers, footnote numbers, or ANY inline citation symbols.\n' +
    '- These characters — 【 】 † — are FORBIDDEN in your response text.\n' +
    '- Instead, after your answer, output a Sources section using ONLY this exact markdown format:\n' +
    '  **Sources**\n' +
    '  - [descriptive title](exact_url_from_above)\n' +
    '- Only list URLs that appear verbatim in the search results above.\n' +
    '- If none of the sources were useful, omit the Sources section entirely.';

  const truncated = resultStr.length > MAX_TOTAL_CHARS
    ? resultStr.slice(0, MAX_TOTAL_CHARS)
    : resultStr;

  return truncated + citationRules;
}

/**
 * Returns the tool definition passed to OpenRouter when web search is enabled.
 * The model uses this description to decide whether to search.
 */
function buildWebSearchTool() {
  return {
    type: 'function',
    function: {
      name: 'web_search',
      description:
        'Search the internet for current, real-time information. ' +
        'Call this tool when the user asks about recent events, live data, sports results, ' +
        'news, prices, weather, date, time or anything that may have changed after your training cutoff. ' +
        'Do NOT call this for general knowledge questions you can answer confidently from training. ' +
        'Formulate a concise 3-8 word search query — not the full user message.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'A concise 3-8 word search query. Never append a year or date unless the user explicitly mentioned a specific year or date in their question. Use present-tense phrasing for current-state queries (e.g. "current Federal Reserve interest rate" not "Federal Reserve interest rate 2024").',
          },
        },
        required: ['query'],
      },
    },
  };
}

/* ===========================
   STREAMING RESPONSE
   =========================== */
async function askConversationStream(
  conversationId,
  messages,
  userId,
  summaryText = null,
  excludeMessageIds = [],
  overrideModelId = null,
  parentConversationId = undefined,
  useWebSearch = false,
  signal = null,
  onProcessing = null
) {
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
      parentConversationId,
      userMessage: lastUserMessage,
      excludeIds: contextIds
    });

    logger.debug('Retrieved vector memory items (filtered)', {
      count: retrievedMemory.length,
      conversationId,
    });

    // 5️⃣ Slot 4: Inject Vector Memory (separate slot)
    if (retrievedMemory.length > 0) {
      const vectorContextText = `Relevant past context:\n${retrievedMemory
        .map(m => `- ${m.payload.role}: ${m.payload.text || ""}`)
        .join("\n")}`;
      payload.push({ role: "system", content: vectorContextText });
    }

    // 6️⃣ Slot 5: Messages
    payload.push(...buildMessagesPayload(normalized));

    logger.debug('LLM payload assembled', { conversationId, payloadCount: payload.length });

    console.log("Final LLM Payload:", payload);

    // — Agentic web search: model decides whether to call the tool ———————————
    if (useWebSearch) {
      if (typeof onProcessing === 'function') {
        onProcessing('deciding_web_search');
      }

      // First call — non-streaming, tool definition attached
      // Model will either respond directly OR emit a tool_use block
      const webSearchToolDef = buildWebSearchTool();

      const firstCallOptions = {
        model: model.openRouterModelId,
        messages: payload,
        tools: [webSearchToolDef],
        tool_choice: 'auto',   // model decides — never force or block
        stream: false,
        max_tokens: 1024,      // only need enough for a tool call decision
        signal,
      };

      let firstResponse;
      try {
        firstResponse = await openrouter.chat.send(firstCallOptions);
      } catch (err) {
        if (err.name === 'AbortError') return null;
        logger.error('[llm] First-pass tool-use call failed', { error: err.message });
        throw err;
      }

      if (signal?.aborted) return null;

      const responseMessage = firstResponse?.choices?.[0]?.message;
      const toolCall = responseMessage?.toolCalls?.find(
        (tc) => tc.function?.name === 'web_search'
      );

      let webResults = null;

      // Only execute tool flow if model actually called the tool
      if (toolCall) {
        if (typeof onProcessing === 'function') {
          onProcessing('searching_web');
        }
        // Safer version — parse failure falls back to lastUserMessage silently
        let modelQuery = lastUserMessage;
        try {
          modelQuery = JSON.parse(toolCall.function.arguments)?.query || lastUserMessage;
        } catch {
          logger.warn('[llm] Failed to parse tool call arguments, using raw user message', {
            arguments: toolCall.function.arguments,
          });
        }
        console.log('Original User Query', lastUserMessage)
        console.log('Model Query', modelQuery)
        console.log(logger.info('[llm] Model triggered web_search tool', { query: modelQuery }))
        logger.info('[llm] Model triggered web_search tool', { query: modelQuery });

        let toolResultContent;
        try {
          webResults = await searchAndFetch(modelQuery, onProcessing);
          if (typeof onProcessing === 'function') {
            onProcessing('preparing_web_results');
          }
          const webContext = formatWebContext(webResults);
          toolResultContent = webContext || 'No relevant results found for this query.';
        } catch (err) {
          logger.warn('[llm] Web search failed after tool call', { error: err.message });
          toolResultContent = 'Web search is temporarily unavailable.';
        }

        if (signal?.aborted) return null;

        // Append tool exchange to payload for the final streaming call
        payload.push({
          role: 'assistant',
          content: responseMessage.content || null,
          toolCalls: responseMessage.toolCalls,
        });
        payload.push({
          role: 'tool',
          toolCallId: toolCall.id,
          content: toolResultContent,
        });

        logger.debug('[llm] Tool result appended, making final streaming call');
      }

      logger.info('web_search_pipeline', {
        conversationId,
        triggeredSearch: Boolean(toolCall),
        modelQuery: toolCall ? JSON.parse(toolCall.function.arguments)?.query : null,
        resultsCount: webResults ? (webResults.snippets?.length ?? 0) + (webResults.pages?.length ?? 0) : null,
        pagesFetched: webResults?.pages?.length ?? null,
        fallbackToSnippets: webResults ? (webResults.pages?.length === 0 && webResults.snippets?.length > 0) : null,
      });
    } else {
      // Model decided no search needed — stream the first response directly
      logger.debug('[llm] Model did not call web_search tool, streaming direct response');
      // Fall through to streaming call below without tool definition
    }

    // Final streaming call — with or without tool results
    try {
      return {
        stream: await openrouter.chat.send({
          model: model.openRouterModelId,
          messages: payload,
          stream: true,
          signal,
          max_tokens: model.maxTokens || 8000,
          // No tools on the final call — model just generates the answer
        }),
        modelId: model._id,
      };
    } catch (err) {
      if (err.name === 'AbortError') return null;
      throw err;
    }
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

async function getContextMessages(conversationId, MAX_CONTEXT) {
  const conv = await Conversation.findById(conversationId)
    .select('parentConversationId branchedFromMessageId')
    .lean();

  if (!conv?.parentConversationId || !conv?.branchedFromMessageId) {
    // ROOT: Fetch last MAX_CONTEXT messages and return in chronological order (oldest first)
    const rootMessages = await Message.find({ conversationId })
      .sort({ createdAt: -1 })
      .limit(MAX_CONTEXT)
      .lean();
    return rootMessages.reverse();
  }

  const branchMessages = await Message.find({ conversationId })
    .sort({ createdAt: -1 })
    .lean();

  const needed = MAX_CONTEXT - branchMessages.length;
  if (needed <= 0) return branchMessages.reverse();

  const parentMessages = await Message.find({
    conversationId: conv.parentConversationId,
    _id: { $lte: conv.branchedFromMessageId }
  })
    .sort({ createdAt: -1 })
    .limit(needed)
    .lean();

  return [...parentMessages.reverse(), ...branchMessages.reverse()];
}

async function getContextMessagesNodeTree(conversationId, maxContext) {
  // Walk the active path from the conversation root to leaf,
  // then take the last maxContext messages (excluding any
  // empty assistant placeholder at the very end).

  const conv = await Conversation.findById(conversationId)
    .select('rootMessageId')
    .lean();

  if (!conv?.rootMessageId) {
    // Not yet migrated — fall back to simple query
    const msgs = await Message.find({ conversationId })
      .sort({ createdAt: -1 })
      .limit(maxContext)
      .lean();
    return msgs.reverse();
  }

  // Walk activeChildId from root to leaf
  const pathIds = [];
  const visited = new Set();
  let currentId = conv.rootMessageId;

  while (currentId) {
    const key = String(currentId);
    if (visited.has(key)) break; // cycle guard
    visited.add(key);
    pathIds.push(currentId);

    const node = await Message.findById(
      currentId,
      { _id: 1, activeChildId: 1 }
    ).lean();

    if (!node || !node.activeChildId) break;
    currentId = node.activeChildId;
  }

  if (!pathIds.length) return [];

  // Load all messages in path order
  const msgs = await Message.find(
    { _id: { $in: pathIds } },
    { role: 1, text: 1, _id: 1, createdAt: 1 }
  ).lean();

  const msgMap = new Map(msgs.map(m => [String(m._id), m]));
  const ordered = pathIds
    .map(id => msgMap.get(String(id)))
    .filter(Boolean)
    // Exclude empty assistant placeholders at the end
    .filter((m, idx, arr) => {
      const isLast = idx === arr.length - 1;
      return !(isLast && m.role === 'assistant' && !m.text);
    });

  // Return last maxContext messages
  return ordered.slice(-maxContext);
}

/**
 * Orchestrates the "ask" flow preparation:
 * - Persists user message
 * - Creates empty assistant message placeholder
 * - Loads context
 * - Loads summary
 */
async function prepareAskContext(userId, conversationId, messageText, overrideModelId = null, useWebSearch = false, signal = null, onProcessing = null) {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    throw Object.assign(new Error('Conversation not found'), { status: 404 });
  }
  if (conversation.userId.toString() !== userId) {
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }

  let userMsg = null;
  const recentMessages = await Message.find({ conversationId })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  const latestNonPlaceholder = recentMessages.find(
    (m) => !(m.role === 'assistant' && m.text === '')
  );
  const hasPendingAssistantPlaceholder = recentMessages.some(
    (m) => m.role === 'assistant' && m.text === ''
  );

  // Reuse latest user message for branch-first ask and retry/failover asks.
  if (
    latestNonPlaceholder?.role === 'user' &&
    latestNonPlaceholder.text === messageText &&
    hasPendingAssistantPlaceholder
  ) {
    userMsg = latestNonPlaceholder;
  }

  if (!userMsg) {
    userMsg = await ConversationService.addMessage(userId, conversationId, {
      role: 'user',
      text: messageText,
    });

    // Backfill branch-side edited message pointer when the first branch user message is created.
    if (conversation.parentConversationId && !conversation.branchEditedMessageId) {
      await Conversation.findByIdAndUpdate(conversationId, {
        $set: { branchEditedMessageId: userMsg._id }
      });
      conversation.branchEditedMessageId = userMsg._id;
    }
  }

  let assistantMsg = await Message.findOne({
    conversationId,
    role: 'assistant',
    text: ''
  }).sort({ createdAt: -1 });

  if (!assistantMsg) {
    assistantMsg = await Message.create({
      conversationId,
      role: 'assistant',
      text: '',
      userId,
      personaId: conversation.currentPersonaId || null,
      versions: [],
      isRetried: false
    });
  }

  const MAX_CONTEXT = 4;
  let ordered = await getContextMessages(conversationId, MAX_CONTEXT);

  if (!ordered.length || ordered[ordered.length - 1]._id?.toString() !== userMsg._id?.toString()) {
    ordered.push({
      role: userMsg.role,
      text: userMsg.text,
      _id: userMsg._id
    });
  }

  ordered = ordered.filter(m => !(m.role === 'assistant' && m.text === ''));

  const latestSummary = await getLatestSummary(conversationId);
  const summaryText = latestSummary?.summaryText || null;

  const context = await askConversationStream(
    conversationId,
    ordered,
    userId,
    summaryText,
    [userMsg._id, assistantMsg._id],
    overrideModelId,
    conversation.parentConversationId || null,
    useWebSearch,
    signal,
    onProcessing
  );

  if (!context) return null;
  const { stream, modelId } = context;

  return { stream, modelId, userMsg, assistantMsg };
}

async function prepareAskContextNodeTree(
  userId,
  conversationId,
  messageText,
  overrideModelId = null,
  editNodeId = null,
  useWebSearch = false,
  signal = null,
  onProcessing = null
) {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    throw Object.assign(new Error('Conversation not found'), { status: 404 });
  }
  if (conversation.userId.toString() !== userId) {
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }

  // ── Determine parent node ──────────────────────────────
  // If editNodeId is provided, the new user message is a
  // sibling of that node (same parentMessageId).
  // Otherwise, find the current leaf of the active path.
  let parentMessageId = null;

  if (editNodeId) {
    const editedNode = await Message.findById(editNodeId).lean();
    if (!editedNode) {
      throw Object.assign(
        new Error('Edited message not found'), { status: 404 }
      );
    }
    if (editedNode.conversationId.toString() !== conversationId) {
      throw Object.assign(
        new Error('Edited message does not belong to this conversation'),
        { status: 400 }
      );
    }
    // New user message shares the same parent as the edited node
    parentMessageId = editedNode.parentMessageId;
  } else {
    // Walk active path to find the current leaf
    const conv = await Conversation.findById(conversationId)
      .select('rootMessageId')
      .lean();
    if (conv?.rootMessageId) {
      const visited = new Set();
      let currentId = conv.rootMessageId;
      while (currentId) {
        const key = String(currentId);
        if (visited.has(key)) break;
        visited.add(key);
        const node = await Message.findById(
          currentId,
          { _id: 1, activeChildId: 1 }
        ).lean();
        if (!node || !node.activeChildId) {
          parentMessageId = node?._id || null;
          break;
        }
        currentId = node.activeChildId;
      }
    } else {
      const latestMsg = await Message.findOne(
        { conversationId },
        { _id: 1 }
      ).sort({ createdAt: -1 }).lean();
      parentMessageId = latestMsg?._id || null;
    }
  }

  // ── Create user message node ───────────────────────────
  const userMsg = await Message.create({
    conversationId,
    userId: new mongoose.Types.ObjectId(userId),
    role: 'user',
    text: messageText,
    parentMessageId: parentMessageId || null,
    status: 'sent',
    importance: 0,
  });

  // Update parent's activeChildId to point to new user message
  if (parentMessageId) {
    await Message.findByIdAndUpdate(
      parentMessageId,
      { $set: { activeChildId: userMsg._id } }
    );
  } else {
    // This is the root message — set rootMessageId on conversation
    await Conversation.findByIdAndUpdate(
      conversationId,
      { $set: { rootMessageId: userMsg._id } }
    );
  }

  // Update conversation metadata
  await Conversation.findByIdAndUpdate(
    conversationId,
    { $inc: { messageCount: 1 }, $set: { updatedAt: new Date() } }
  );

  // ── Create assistant placeholder node ─────────────────
  const assistantMsg = await Message.create({
    conversationId,
    userId: new mongoose.Types.ObjectId(userId),
    role: 'assistant',
    text: '',
    parentMessageId: userMsg._id,
    status: 'streaming',
    personaId: conversation.currentPersonaId || null,
  });

  // Point user message's activeChildId to assistant placeholder
  await Message.findByIdAndUpdate(
    userMsg._id,
    { $set: { activeChildId: assistantMsg._id } }
  );

  // ── Build context for LLM ──────────────────────────────
  const MAX_CONTEXT = 4;
  let ordered = await getContextMessagesNodeTree(conversationId, MAX_CONTEXT);

  // Ensure the new user message is at the end of context
  if (
    !ordered.length ||
    ordered[ordered.length - 1]._id?.toString() !== userMsg._id.toString()
  ) {
    ordered.push({
      role: userMsg.role,
      text: userMsg.text,
      _id: userMsg._id,
    });
  }

  // Remove empty assistant placeholders from context
  ordered = ordered.filter(
    m => !(m.role === 'assistant' && !m.text)
  );

  const latestSummary = await getLatestSummary(conversationId);
  const summaryText = latestSummary?.summaryText || null;

  const context = await askConversationStream(
    conversationId,
    ordered,
    userId,
    summaryText,
    [userMsg._id, assistantMsg._id],
    overrideModelId,
    null,   // parentConversationId is null — node tree uses single conversationId
    useWebSearch,
    signal,
    onProcessing
  );

  if (!context) return null;
  const { stream, modelId } = context;

  return { stream, modelId, userMsg, assistantMsg };
}

async function prepareRegenerateContextNodeTree(
  userId,
  conversationId,
  overrideModelId,
  regenerateNodeId,
  useWebSearch = false,
  signal = null,
  onProcessing = null
) {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) throw Object.assign(
    new Error('Conversation not found'), { status: 404 }
  );
  if (conversation.userId.toString() !== userId) throw Object.assign(
    new Error('Forbidden'), { status: 403 }
  );

  const regenerateNode = await Message.findById(regenerateNodeId).lean();
  if (!regenerateNode) throw Object.assign(
    new Error('Message not found'), { status: 404 }
  );
  if (regenerateNode.role !== 'assistant') throw Object.assign(
    new Error('Can only regenerate assistant messages'),
    { status: 400 }
  );
  if (regenerateNode.conversationId.toString() !== conversationId) {
    throw Object.assign(
      new Error('Message does not belong to this conversation'),
      { status: 400 }
    );
  }

  const parentUserNode = await Message.findById(
    regenerateNode.parentMessageId
  ).lean();
  if (!parentUserNode) throw Object.assign(
    new Error('Parent user message not found'), { status: 404 }
  );

  const assistantMsg = await Message.create({
    conversationId,
    userId: new mongoose.Types.ObjectId(userId),
    role: 'assistant',
    text: '',
    parentMessageId: regenerateNode.parentMessageId,
    status: 'streaming',
    personaId: conversation.currentPersonaId || null,
  });

  await Message.findByIdAndUpdate(
    regenerateNode.parentMessageId,
    { $set: { activeChildId: assistantMsg._id } }
  );

  await Conversation.findByIdAndUpdate(
    conversationId,
    { $inc: { messageCount: 1 }, $set: { updatedAt: new Date() } }
  );

  // Build context using the same inline pattern as prepareAskContextNodeTree
  const MAX_CONTEXT = 4;
  let ordered = await getContextMessagesNodeTree(
    conversationId, MAX_CONTEXT
  );

  // Ensure parent user node is at end of context
  if (
    !ordered.length ||
    ordered[ordered.length - 1]._id?.toString() !==
    parentUserNode._id.toString()
  ) {
    ordered.push({
      role: parentUserNode.role,
      text: parentUserNode.text,
      _id: parentUserNode._id,
    });
  }

  // Remove empty assistant placeholders
  ordered = ordered.filter(
    m => !(m.role === 'assistant' && !m.text)
  );

  const latestSummary = await getLatestSummary(conversationId);
  const summaryText = latestSummary?.summaryText || null;

  const context = await askConversationStream(
    conversationId,
    ordered,
    userId,
    summaryText,
    [parentUserNode._id, assistantMsg._id],
    overrideModelId,
    null,
    useWebSearch,
    signal,
    onProcessing
  );

  if (!context) return null;
  const { stream, modelId } = context;

  return { stream, modelId, userMsg: parentUserNode, assistantMsg };
}

/**
 * Orchestrates post-streaming tasks:
 * - Persists assistant message
 * - Fire-and-forget background tasks
 */
async function handlePostStreamTasks(userId, conversationId, fullReply, userMsg, assistantMsg, assistantPayload = {}) {
  // 1. Save assistant message (update the placeholder)
  assistantMsg.text = fullReply;
  if (assistantPayload.reasoning) {
    assistantMsg.reasoning = assistantPayload.reasoning;
  }
  if (assistantPayload.reasoningDurationSeconds != null) {
    assistantMsg.reasoningDurationSeconds = assistantPayload.reasoningDurationSeconds;
  }
  await assistantMsg.save();

  // 2. Fire-and-forget side effects
  safeFireAndForget(() => writeMessageToMemory(userMsg));
  safeFireAndForget(() => writeMessageToMemory(assistantMsg));

  safeFireAndForget(() => processAndStoreMemory(userMsg.text, userMsg.role, userId, conversationId));
  safeFireAndForget(() => processAndStoreMemory(assistantMsg.text, assistantMsg.role, userId, conversationId));

  safeFireAndForget(() => triggerSummaryIfNeeded(conversationId));

  return assistantMsg;
}

async function handlePostStreamTasksNodeTree(
  userId,
  conversationId,
  fullReply,
  userMsg,
  assistantMsg,
  assistantPayload = {}
) {
  // Save assistant message text and update status
  const updateFields = { text: fullReply, status: 'sent' };
  if (assistantPayload.reasoning) {
    updateFields.reasoning = assistantPayload.reasoning;
  }
  if (assistantPayload.reasoningDurationSeconds != null) {
    updateFields.reasoningDurationSeconds = assistantPayload.reasoningDurationSeconds;
  }
  await Message.findByIdAndUpdate(
    assistantMsg._id,
    { $set: updateFields }
  );
  assistantMsg.text = fullReply;
  if (assistantPayload.reasoning) {
    assistantMsg.reasoning = assistantPayload.reasoning;
  }

  // Fire-and-forget side effects (same as original)
  safeFireAndForget(() => writeMessageToMemory(userMsg));
  safeFireAndForget(() => writeMessageToMemory(assistantMsg));
  safeFireAndForget(() => processAndStoreMemory(
    userMsg.text, userMsg.role, userId, conversationId
  ));
  safeFireAndForget(() => processAndStoreMemory(
    assistantMsg.text, assistantMsg.role, userId, conversationId
  ));
  safeFireAndForget(() => triggerSummaryIfNeeded(conversationId));

  return assistantMsg;
}

module.exports = {
  askConversation,
  askConversationStream,
  askGemini,
  askGeminiStream,
  getContextMessages,
  getInjectedUserMemory,
  prepareAskContext,
  handlePostStreamTasks,
  prepareAskContextNodeTree,
  prepareRegenerateContextNodeTree,
  handlePostStreamTasksNodeTree,
  formatWebContext,
  buildWebSearchTool
};

