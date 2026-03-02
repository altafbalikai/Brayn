const mongoose = require("mongoose");
const LLMModel = require("../models/LLMModel");

/**
 * CREATE
 */
async function addLLMModel(modelData) {
    const {
        displayName,
        description,
        provider,
        openRouterModelId,
        family,
        version,
        sizeB,
        maxContext,
        capabilities,
        costTier,
        latencyClass,
        qualityClass,
        status,
        fallbackModel,
        metadata,
    } = modelData;

    // Required fields
    if (!displayName || !openRouterModelId || !provider || !family || !version) {
        throw Object.assign(new Error("Missing required fields"), { status: 400 });
    }

    if (!Array.isArray(capabilities) || capabilities.length === 0) {
        throw Object.assign(
            new Error("Capabilities must be a non-empty array"),
            { status: 400 }
        );
    }

    if (fallbackModel && !mongoose.isValidObjectId(fallbackModel)) {
        throw Object.assign(new Error("Invalid fallbackModel id"), { status: 400 });
    }

    const existing = await LLMModel.findOne({ openRouterModelId });
    if (existing) {
        throw Object.assign(
            new Error("LLM model with this OpenRouter model ID already exists"),
            { status: 409 }
        );
    }

    const llmModel = await LLMModel.create({
        displayName,
        description,
        provider,
        openRouterModelId,
        family,
        version,
        sizeB,
        maxContext,
        capabilities,
        costTier,
        latencyClass,
        qualityClass,
        status,
        fallbackModel,
        metadata,
    });

    return llmModel.toObject();
}

/**
 * Helper to build query from filters
 */
function _buildModelQuery(filters = {}) {
    const { capability, provider, costTier, status } = filters;

    const query = {};

    if (provider) query.provider = provider;
    if (costTier) query.costTier = costTier;
    if (capability) query.capabilities = capability;
    if (status) query.status = status;

    return query;
}

/**
 * READ – list (flexible)
 */
async function getLLMModels(filters = {}) {
    const query = _buildModelQuery(filters);

    const models = await LLMModel.find(query)
        .select("-__v")
        .sort({ createdAt: -1 });

    return models.map(m => m.toObject());
}

/**
 * READ – single
 */
async function getLLMModelById(modelId) {
    if (!mongoose.isValidObjectId(modelId)) {
        throw Object.assign(new Error("Invalid model id"), { status: 400 });
    }

    const model = await LLMModel.findById(modelId);
    if (!model) {
        throw Object.assign(new Error("Model not found"), { status: 404 });
    }

    return model.toObject();
}

/**
 * UPDATE (partial)
 */
async function updateLLMModelById(modelId, updateData) {
    if (!mongoose.isValidObjectId(modelId)) {
        throw Object.assign(new Error("Invalid model id"), { status: 400 });
    }

    const allowedUpdates = [
        "displayName",
        "status",
        "fallbackModel",
        "metadata",
        "latencyClass",
        "qualityClass",
    ];

    const updates = {};
    for (const key of allowedUpdates) {
        if (updateData[key] !== undefined) {
            updates[key] = updateData[key];
        }
    }

    if (updates.fallbackModel && !mongoose.isValidObjectId(updates.fallbackModel)) {
        throw Object.assign(new Error("Invalid fallbackModel id"), { status: 400 });
    }

    const model = await LLMModel.findByIdAndUpdate(
        modelId,
        updates,
        { new: true }
    );

    if (!model) {
        throw Object.assign(new Error("Model not found"), { status: 404 });
    }

    return model.toObject();
}

/**
 * DELETE (soft delete → deprecate)
 */
async function deprecateLLMModel(modelId) {
    if (!mongoose.isValidObjectId(modelId)) {
        throw Object.assign(new Error("Invalid model id"), { status: 400 });
    }

    const model = await LLMModel.findByIdAndUpdate(
        modelId,
        { status: "deprecated" },
        { new: true }
    );

    if (!model) {
        throw Object.assign(new Error("Model not found"), { status: 404 });
    }

    return model.toObject();
}

module.exports = {
    addLLMModel,
    getLLMModels,
    getLLMModelById,
    updateLLMModelById,
    deprecateLLMModel,
};
