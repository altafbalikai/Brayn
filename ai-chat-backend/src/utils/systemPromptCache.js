// services/systemPromptCache.js
const PromptSettings = require("../models/PromptSettings");
const DEFAULT_SYSTEM_PROMPT = `
        You are Brayn AI, a helpful, accurate, and concise assistant.
        Follow best practices:
        - Be clear and structured
        - Use markdown where helpful
        - Do not hallucinate facts
        - If unsure, say so explicitly
    `
    .trim();

let cachedPrompt = null;

async function getSystemPrompt() {
    if (!cachedPrompt) {
        const doc = await PromptSettings.findOne();
        cachedPrompt = doc?.systemPrompt || DEFAULT_SYSTEM_PROMPT;
    }
    return cachedPrompt;
}

function invalidateSystemPromptCache() {
    cachedPrompt = null;
}

module.exports = {
    getSystemPrompt,
    invalidateSystemPromptCache,
};
