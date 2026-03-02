// src/validators/llmmodel.validator.js
const { body, param, query } = require("express-validator");
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

const PROVIDERS = ["meta", "openai", "google", "nvidia", "qwen", "mistral", "arcee-ai", "stepfun", "other"];
const COST_TIERS = ["free", "paid"];
const STATUS_VALUES = ["active", "deprecated", "experimental"];
const LATENCY_CLASSES = ["fast", "medium", "slow"];
const QUALITY_CLASSES = ["low", "medium", "high"];

/**
 * POST /api/llm-models
 * Create LLM model
 */
const createLLMModelValidation = [
    body("displayName")
        .notEmpty()
        .withMessage("displayName is required")
        .trim(),

    body("provider")
        .notEmpty()
        .withMessage("provider is required")
        .isIn(PROVIDERS)
        .withMessage("Invalid provider"),

    body("openRouterModelId")
        .notEmpty()
        .withMessage("openRouterModelId is required")
        .trim(),

    body("family")
        .notEmpty()
        .withMessage("family is required")
        .trim(),

    body("version")
        .notEmpty()
        .withMessage("version is required")
        .trim(),

    body("capabilities")
        .isArray({ min: 1 })
        .withMessage("capabilities must be a non-empty array"),

    body("capabilities.*")
        .isIn(MODEL_CAPABILITIES)
        .withMessage("Invalid capability"),

    body("sizeB")
        .optional()
        .isInt({ min: 1 })
        .withMessage("sizeB must be a positive number"),

    body("maxContext")
        .optional()
        .isInt({ min: 256 })
        .withMessage("maxContext must be a valid number"),

    body("costTier")
        .optional()
        .isIn(COST_TIERS)
        .withMessage("Invalid costTier"),

    body("latencyClass")
        .optional()
        .isIn(LATENCY_CLASSES)
        .withMessage("Invalid latencyClass"),

    body("qualityClass")
        .optional()
        .isIn(QUALITY_CLASSES)
        .withMessage("Invalid qualityClass"),

    body("status")
        .optional()
        .isIn(STATUS_VALUES)
        .withMessage("Invalid status"),

    body("fallbackModel")
        .optional()
        .custom((value) => {
            if (!mongoose.isValidObjectId(value)) {
                throw new Error("Invalid fallbackModel id");
            }
            return true;
        }),
];

/**
 * PATCH /api/llm-models/:id
 * Update LLM model
 */
const updateLLMModelValidation = [
    param("id")
        .custom((value) => {
            if (!mongoose.isValidObjectId(value)) {
                throw new Error("Invalid model id");
            }
            return true;
        }),

    body("displayName")
        .optional()
        .isString()
        .trim(),

    body("status")
        .optional()
        .isIn(STATUS_VALUES)
        .withMessage("Invalid status"),

    body("latencyClass")
        .optional()
        .isIn(LATENCY_CLASSES)
        .withMessage("Invalid latencyClass"),

    body("qualityClass")
        .optional()
        .isIn(QUALITY_CLASSES)
        .withMessage("Invalid qualityClass"),

    body("fallbackModel")
        .optional()
        .custom((value) => {
            if (!mongoose.isValidObjectId(value)) {
                throw new Error("Invalid fallbackModel id");
            }
            return true;
        }),

    body("metadata")
        .optional()
        .isObject()
        .withMessage("metadata must be an object"),
];

/**
 * GET /api/llm-models
 * List models (UI)
 */
const getLLMModelsValidation = [
    query("status")
        .optional()
        .isIn(STATUS_VALUES)
        .withMessage("Invalid status"),

    query("provider")
        .optional()
        .isIn(PROVIDERS)
        .withMessage("Invalid provider"),

    query("costTier")
        .optional()
        .isIn(COST_TIERS)
        .withMessage("Invalid costTier"),

    query("capability")
        .optional()
        .isIn(MODEL_CAPABILITIES)
        .withMessage("Invalid capability"),
];

/**
 * GET / DELETE /api/llm-models/:id
 */
const llmModelIdValidation = [
    param("id").custom((value) => {
        if (!mongoose.isValidObjectId(value)) {
            throw new Error("Invalid model id");
        }
        return true;
    }),
];

module.exports = {
    createLLMModelValidation,
    updateLLMModelValidation,
    getLLMModelsValidation,
    llmModelIdValidation,
};
