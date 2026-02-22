// src/utils/memoryClassification.utils.js

const KEY_TAXONOMY = [
    'preferred_language',
    'preferred_framework',
    'preferred_editor',
    'profession',
    'experience_level',
    'primary_stack',
    'current_goal',
    'current_project',
    'learning_focus',
    'communication_style',
    'timezone',
    'preferred_response_length'
];

// Direct trigger-to-key mappings (no disambiguation needed)
const DIRECT_MAPPINGS = {
    'i work as': { key: 'profession', category: 'trait' },
    "i am a": { key: 'profession', category: 'trait' },
    "i'm a": { key: 'profession', category: 'trait' },
    'my primary': { key: 'primary_stack', category: 'trait' },
    'my goal is': { key: 'current_goal', category: 'goal' },
    "i'm currently": { key: 'current_goal', category: 'goal' },
};

// Keyword hints for ambiguous triggers
const KEYWORD_HINTS = [
    { hints: ['language', 'lang'], key: 'preferred_language', category: 'preference' },
    { hints: ['framework', 'lib', 'library'], key: 'preferred_framework', category: 'preference' },
    { hints: ['editor', 'ide'], key: 'preferred_editor', category: 'preference' },
    { hints: ['stack', 'backend', 'frontend'], key: 'primary_stack', category: 'trait' },
    {
        hints: ['response', 'answer', 'reply',
            'length'], key: 'preferred_response_length', category: 'preference'
    },
    {
        hints: ['goal', 'working on',
            'building'], key: 'current_goal', category: 'goal'
    },
    { hints: ['project'], key: 'current_project', category: 'goal' },
    { hints: ['learning', 'study'], key: 'learning_focus', category: 'goal' },
    { hints: ['style', 'tone'], key: 'communication_style', category: 'preference' },
];

/**
 * Normalizes a string value according to Phase 3.2b rules:
 * 1. trim()
 * 2. toLowerCase()
 * 3. Remove leading/trailing punctuation: . , ! ; :
 * 4. Truncate to 50 characters
 * 5. Capitalize first letter only
 */
function normalizeValue(val) {
    if (!val) return "";
    let clean = val.trim().toLowerCase();

    // Remove leading/trailing punctuation
    clean = clean.replace(/^[.,!;:]+/, '').replace(/[.,!;:]+$/, '');

    // Truncate to 50
    clean = clean.substring(0, 50);

    // Capitalize first letter only
    if (clean.length > 0) {
        clean = clean.charAt(0).toUpperCase() + clean.slice(1);
    }

    return clean;
}

/**
 * Maps a validated extraction candidate into a structured (key, value, category) tuple.
 * 
 * @param {Object} candidate - The result of extractMemoryCandidate
 * @returns {Object} Structured result or failure shape
 */
function classifyMemory(candidate) {
    // Step 1: Null guard
    if (!candidate || !candidate.triggerPhrase || !candidate.extractedValue) {
        return { key: null, value: null, category: null, logReason: 'EXTRACTION_UNMAPPED' };
    }

    let resolvedKey = null;
    let resolvedCategory = null;

    // Step 2: Direct mapping check
    const direct = DIRECT_MAPPINGS[candidate.triggerPhrase.toLowerCase()];
    if (direct) {
        resolvedKey = direct.key;
        resolvedCategory = direct.category;
    } else {
        // Step 3: Keyword hint disambiguation
        const lowerVal = candidate.extractedValue.toLowerCase();
        const matchedHint = KEYWORD_HINTS.find(h =>
            h.hints.some(hint => lowerVal.includes(hint))
        );

        if (matchedHint) {
            resolvedKey = matchedHint.key;
            resolvedCategory = matchedHint.category;
        }
    }

    // Step 4: Key Taxonomy validation + failure handling
    if (!resolvedKey || !KEY_TAXONOMY.includes(resolvedKey)) {
        return { key: null, value: null, category: null, logReason: 'EXTRACTION_UNMAPPED' };
    }

    // Step 5: Value normalization
    const normalizedValue = normalizeValue(candidate.extractedValue);

    // Step 6: Return success shape
    return {
        key: resolvedKey,
        value: normalizedValue,
        category: resolvedCategory,
        logReason: null
    };
}

module.exports = {
    classifyMemory,
    KEY_TAXONOMY
};
