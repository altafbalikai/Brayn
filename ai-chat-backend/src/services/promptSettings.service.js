const mongoose = require("mongoose");
const PromptSettings = require("../models/PromptSettings");

/**
 * CREATE / UPSERT
 * There should be ONLY ONE prompt settings document.
 * If one exists → update it.
 * If none exists → create it.
 */
async function upsertPromptSettings(data, updatedBy = null) {
    const { systemPrompt } = data;

    if (!systemPrompt || typeof systemPrompt !== "string") {
        throw Object.assign(
            new Error("systemPrompt is required and must be a string"),
            { status: 400 }
        );
    }

    // Optional: basic size protection
    if (systemPrompt.length > 50_000) {
        throw Object.assign(
            new Error("systemPrompt exceeds maximum allowed length"),
            { status: 413 }
        );
    }

    const existing = await PromptSettings.findOne();

    if (existing) {
        existing.systemPrompt = systemPrompt;
        if (updatedBy && mongoose.isValidObjectId(updatedBy)) {
            existing.updatedBy = updatedBy;
        }
        await existing.save();
        return existing.toObject();
    }

    const created = await PromptSettings.create({
        systemPrompt,
        updatedBy: mongoose.isValidObjectId(updatedBy) ? updatedBy : undefined,
    });

    return created.toObject();
}

/**
 * READ – get current prompt settings
 */
async function getPromptSettings() {
    const settings = await PromptSettings.findOne().select("-__v");

    if (!settings) {
        // Return safe default instead of 404
        return {
            systemPrompt: "",
            createdAt: null,
            updatedAt: null,
        };
    }

    return settings.toObject();
}

/**
 * RESET – clear system prompt (admin action)
 */
DEFAULT_SYSTEM_PROMPT = `
        You are Brayn AI, a helpful, accurate, and concise assistant.
        Follow best practices:
        - Be clear and structured
        - Use markdown where helpful
        - Do not hallucinate facts
        - If unsure, say so explicitly
    `
    .trim();

async function resetPromptSettings(updatedBy = null) {
    const settings = await PromptSettings.findOne();

    if (!settings) {
        throw Object.assign(
            new Error("Prompt settings not found"),
            { status: 404 }
        );
    }

    settings.systemPrompt = DEFAULT_SYSTEM_PROMPT;
    if (updatedBy && mongoose.isValidObjectId(updatedBy)) {
        settings.updatedBy = updatedBy;
    }

    await settings.save();
    return settings.toObject();
}

module.exports = {
    upsertPromptSettings,
    getPromptSettings,
    resetPromptSettings,
};
