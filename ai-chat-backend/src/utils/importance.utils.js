// src/utils/importance.utils.js

const MAX_IMPORTANCE = 10;

/**
 * Computes a deterministic importance score for a message based on heuristics.
 * Used at write-time to enrich RAG retrieval quality.
 * 
 * @param {string} text The message content
 * @param {string} role The role of the sender ('user', 'assistant', 'system')
 * @returns {number} Deterministic importance score (0-10)
 */
function computeMessageImportance(text, role) {
    // Assistant messages always score 0 to focus memory on user context
    if (role === 'assistant') return 0;
    if (!text || typeof text !== 'string') return 0;

    let score = 0;

    // 1. Explicit request to remember (+5)
    if (text.toLowerCase().includes('remember this')) {
        score += 5;
    }

    // 2. User preferences (+4)
    if (text.toLowerCase().includes('my preference')) {
        score += 4;
    }

    // 3. Decisions/Intent matched with word boundaries (+3)
    // Matches "i will", "final choice", or "decided" but not "undecided"
    const decisionRegex = /\b(i will|final choice|decided)\b/i;
    if (decisionRegex.test(text)) {
        score += 3;
    }

    // 4. Detailed content (+2)
    if (text.length > 250) {
        score += 2;
    }

    // 5. Explanatory questions/requests (+1)
    if (text.includes('?') && text.length > 100) {
        score += 1;
    }

    // Cap the raw score at 10 (MAX_IMPORTANCE)
    return Math.min(score, MAX_IMPORTANCE);
}

module.exports = {
    computeMessageImportance,
    MAX_IMPORTANCE
};
