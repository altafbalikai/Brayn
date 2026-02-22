// src/utils/memoryValidation.utils.js
const { HEDGING_WORDS } = require('./memoryExtraction.utils');
const { KEY_TAXONOMY } = require('./memoryClassification.utils');

/**
 * Validates a classified memory candidate against Phase 3.3 rules.
 * 
 * @param {Object} classified - Result of classifyMemory()
 * @returns {Object} { valid: boolean, reason: string|null }
 */
function validateMemory(classified) {
    // Guard for null/malformed input -> Rule 1 failure
    if (!classified || !classified.key) {
        return { valid: false, reason: 'VALIDATION_INVALID_KEY' };
    }

    // Rule 1: key must be in KEY_TAXONOMY
    if (!KEY_TAXONOMY.includes(classified.key)) {
        return { valid: false, reason: 'VALIDATION_INVALID_KEY' };
    }

    // Rule 2: value length 2-50 after trim
    const trimmedValue = (classified.value || "").trim();
    if (trimmedValue.length < 2 || trimmedValue.length > 50) {
        return { valid: false, reason: 'VALIDATION_VALUE_LENGTH' };
    }

    // Rule 3: value must not contain hedging words
    const lowerValue = trimmedValue.toLowerCase();
    const hasHedging = HEDGING_WORDS.some(word => lowerValue.includes(word));
    if (hasHedging) {
        return { valid: false, reason: 'VALIDATION_LOW_SIGNAL' };
    }

    // Rule 4: category must be one of 'preference', 'trait', 'goal'
    const validCategories = ['preference', 'trait', 'goal'];
    if (!validCategories.includes(classified.category)) {
        return { valid: false, reason: 'VALIDATION_INVALID_CATEGORY' };
    }

    // All rules passed
    return { valid: true, reason: null };
}

module.exports = {
    validateMemory
};
