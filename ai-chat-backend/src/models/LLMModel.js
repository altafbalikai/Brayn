// src/models/LLMModel.js
// src/models/LLMModel.js
const mongoose = require("mongoose");

const MODEL_CAPABILITIES = [
    "text",
    "vision",
    "image_generation",
    "video",
    "audio",
    "function_calling",
    "json_mode",
];

const LLMModelSchema = new mongoose.Schema(
    {
        /**
         * UI-friendly name
         * Example: "Nemotron 30B (Free)"
         */
        displayName: {
            type: String,
            required: true,
            trim: true,
        },

        /**
         * UI-friendly description
         * Example: "Best for quick everyday tasks"
         */
        description: {
            type: String,
        },
        /**
         * Provider name
         * Example: "nvidia", "meta", "google"
         */
        provider: {
            type: String,
            required: true,
            enum: ["meta", "openai", "google", "nvidia", "qwen", "mistral", "other"],
            index: true,
        },

        /**
         * Exact OpenRouter model identifier
         * Example: "nvidia/nemotron-3-nano-30b-a3b:free"
         */
        openRouterModelId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },

        /**
         * Model family & versioning
         */
        family: {
            type: String,
            required: true,
            index: true,
        },

        version: {
            type: String,
            required: true,
        },

        /**
         * Model size (in billions, optional)
         */
        sizeB: {
            type: Number,
        },

        /**
         * Max supported context window
         */
        maxContext: {
            type: Number,
        },

        /**
         * Capabilities (core routing feature)
         * Example: ["text", "vision", "Image_Generation"]
         */
        capabilities: {
            type: [String],
            required: true,
            enum: MODEL_CAPABILITIES,
            index: true,
        },

        /**
         * Supports Developer Instructions
         */
        supportsDeveloperInstructions: {
            type: Boolean,
            default: true
        },

        /**
         * Routing hints
         */
        costTier: {
            type: String,
            enum: ["free", "paid"],
            index: true,
        },

        latencyClass: {
            type: String,
            enum: ["fast", "medium", "slow"],
        },

        qualityClass: {
            type: String,
            enum: ["low", "medium", "high"],
        },

        /**
         * Lifecycle state
         */
        status: {
            type: String,
            enum: ["active", "deprecated", "experimental"],
            default: "active",
            index: true,
        },

        /**
         * Optional fallback model
         */
        fallbackModel: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "LLMModel",
        },

        /**
         * Free-form metadata for future needs
         */
        metadata: {
            type: mongoose.Schema.Types.Mixed,
        },
    },
    { timestamps: true }
);

/**
 * Helpful compound indexes
 */
LLMModelSchema.index({ status: 1, capabilities: 1 });
LLMModelSchema.index({ provider: 1, status: 1 });
LLMModelSchema.index({ family: 1, version: 1 });

module.exports = mongoose.model("LLMModel", LLMModelSchema);
