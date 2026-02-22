// src/utils/memoryExtraction.utils.js

const HEDGING_WORDS = [
    'kind of', 'sort of', 'a bit', 'sometimes',
    'maybe', 'probably', 'i think', 'not sure', 'depends',
    'occasionally', 'usually', 'often', 'might', 'could be'
];

const TRIGGER_PHRASES = [
    { phrase: 'my preference is', signal: 'preference' },
    { phrase: 'my preferred', signal: 'preference' },
    { phrase: 'i work as', signal: 'trait' },
    { phrase: 'i am a', signal: 'trait' },
    { phrase: "i'm a", signal: 'trait' },
    { phrase: 'my goal is', signal: 'goal' },
    { phrase: "i'm currently", signal: 'goal' },
    { phrase: 'remember that', signal: 'any' },
    { phrase: 'my primary', signal: 'trait' },
    { phrase: 'i mainly use', signal: 'preference' },
    { phrase: 'i always use', signal: 'preference' }
];

/**
 * Scans user text for trigger phrases and extracts potential memory candidates.
 * 
 * @param {string} text - The input message text
 * @param {string} role - The message role ('user', 'assistant')
 * @returns {Object|null} - Candidate object or null if no match/guards fail
 */
function extractMemoryCandidate(text, role) {
    // Guard: Only extract from user messages
    if (role !== 'user') return null;
    if (!text || typeof text !== 'string') return null;

    for (const { phrase, signal } of TRIGGER_PHRASES) {
        // Word boundary regex for every trigger (case-insensitive)
        const triggerRegex = new RegExp(`\\b${phrase}\\b`, 'i');

        if (triggerRegex.test(text)) {
            // 1. Extract text that follows the trigger phrase to end of sentence
            // Stop at ".", "!", "?", or end of string
            const fullMatch = text.match(new RegExp(`${phrase}\\s*(.*?)(?:[.!?]|$)`, 'i'));

            if (!fullMatch || !fullMatch[1]) continue;

            const extractedValue = fullMatch[1].trim();

            // Guard 1: Length must be between 2 and 50 characters (after trim)
            if (extractedValue.length < 2 || extractedValue.length > 50) continue;

            // Guard 2: Must not contain any hedging words
            const lowerExtracted = extractedValue.toLowerCase();
            const hasHedging = HEDGING_WORDS.some(word => lowerExtracted.includes(word));
            if (hasHedging) continue;

            // Guard 3: Must not contain "?" 
            // (The regex above stops at "?", but we check the result defensively)
            if (extractedValue.includes('?')) continue;

            // If all guards pass, return the candidate
            return {
                triggerPhrase: phrase,
                extractedValue,
                signalType: signal
            };
        }
    }

    return null;
}

module.exports = {
    extractMemoryCandidate,
    HEDGING_WORDS
};
