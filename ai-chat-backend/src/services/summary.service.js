// src/services/summary.service.js
const logger = require('../config/logger');
const { askGemini } = require('./gemini.service');
const ConversationSummary = require('../models/ConversationSummary');
const Message = require('../models/Message');

// ─── Configuration ─────────────────────────────────────────────
const SUMMARY_THRESHOLD = parseInt(process.env.SUMMARY_THRESHOLD, 10) || 10;
const SUMMARY_BATCH_LIMIT = 50; // max messages per summarization call (token safety)

// ─── Summarization Prompt ──────────────────────────────────────
const SUMMARY_PROMPT = `
You are a conversation summarizer for an AI assistant.

Your job: produce a structured summary of the conversation below.

INCLUDE:
- User preferences and personal details they shared
- Important facts stated by the user
- Decisions made during the conversation
- Unresolved questions or pending topics
- Technical requirements or constraints mentioned

EXCLUDE:
- Greetings and small talk
- Repetitive confirmations ("ok", "got it", "thanks")
- The assistant's internal reasoning

FORMAT your response as a concise structured summary using this template:
**Preferences:** (list any user preferences)
**Key Facts:** (list important facts)
**Decisions:** (list decisions made)
**Open Questions:** (list unresolved items)

If a section has no items, omit it entirely.
Keep the total summary under 200 words.
`.trim();

// ─── Public API ────────────────────────────────────────────────

/**
 * Get the latest summary for a conversation.
 * Returns null if no summary exists.
 */
async function getLatestSummary(conversationId) {
  try {
    return await ConversationSummary.findOne({ conversationId })
      .sort({ version: -1 })
      .lean();
  } catch (err) {
    logger.warn(`[Summary] Failed to load latest summary: ${err.message}`);
    return null;
  }
}

/**
 * Generate a new incremental conversation summary.
 * - Loads the previous summary (if any)
 * - Loads only NEW messages since the last summary
 * - Calls the LLM to produce a merged summary
 * - Saves the new summary version
 *
 * This function is designed to be called fire-and-forget.
 * It NEVER throws — all errors are caught and logged.
 */
async function generateConversationSummary(conversationId) {
  try {
    logger.info(`[Summary] Starting generation for conversation ${conversationId}`);

    // 1) Load the latest existing summary
    const previousSummary = await getLatestSummary(conversationId);

    // 2) Build query for NEW messages only
    const messageQuery = { conversationId };
    if (previousSummary?.messageRangeEnd) {
      messageQuery._id = { $gt: previousSummary.messageRangeEnd };
    }

    const newMessages = await Message.find(messageQuery)
      .sort({ createdAt: 1 })
      .limit(SUMMARY_BATCH_LIMIT)
      .lean();

    if (!newMessages.length) {
      logger.info(`[Summary] No new messages to summarize for ${conversationId}`);
      return null;
    }

    // 3) Build the LLM conversation payload
    const payload = [];

    // Instruction message
    let instruction = SUMMARY_PROMPT;
    if (previousSummary?.summaryText) {
      instruction += `\n\nPREVIOUS SUMMARY (incorporate and update this):\n${previousSummary.summaryText}`;
    }
    payload.push({ role: 'user', text: instruction });

    // Append conversation messages
    payload.push({
      role: 'user',
      text: 'NEW MESSAGES TO SUMMARIZE:\n' +
        newMessages
          .map((m) => `[${m.role}]: ${m.text}`)
          .join('\n'),
    });

    // 4) Call LLM (non-streaming, via askGemini)
    const summaryText = await askGemini(payload);

    if (!summaryText || typeof summaryText !== 'string' || summaryText.trim().length < 10) {
      logger.warn(`[Summary] LLM returned empty/invalid summary for ${conversationId}`);
      return null;
    }

    // 5) Save new summary version
    const version = previousSummary ? previousSummary.version + 1 : 1;
    const summary = await ConversationSummary.create({
      conversationId,
      summaryText: summaryText.trim(),
      version,
      messageRangeStart: previousSummary?.messageRangeEnd || newMessages[0]._id,
      messageRangeEnd: newMessages[newMessages.length - 1]._id,
    });

    logger.info(
      `[Summary] v${version} saved for ${conversationId} ` +
      `(${newMessages.length} messages summarized)`
    );

    return summary;
  } catch (err) {
    // CRITICAL: never let summary errors propagate
    logger.error(`[Summary] Generation failed for ${conversationId}: ${err.message}`);
    return null;
  }
}

/**
 * Fire-and-forget trigger called from addMessage().
 * Only triggers if messageCount hits the threshold.
 */
function triggerSummaryIfNeeded(conversationId, messageCount) {
  if (messageCount > 0 && messageCount % SUMMARY_THRESHOLD === 0) {
    logger.info(`[Summary] Threshold hit (${messageCount} messages), triggering for ${conversationId}`);
    // Fire-and-forget — DO NOT await
    generateConversationSummary(conversationId).catch((err) => {
      logger.error(`[Summary] Background trigger failed: ${err.message}`);
    });
  }
}

module.exports = {
  getLatestSummary,
  generateConversationSummary,
  triggerSummaryIfNeeded,
};
