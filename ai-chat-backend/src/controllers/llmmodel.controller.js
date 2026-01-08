const {
    addLLMModel,
    getAllLLMModels,
    getLLMModelById,
    updateLLMModelById,
    deprecateLLMModel,
} = require('../services/llmmodel.service');

/**
 * POST /api/llm-models
 * Create a new LLM model
 */
async function createLLMModel(req, res, next) {
    try {
        const model = await addLLMModel(req.body);
        res.status(201).json(model);
    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/llm-models
 * List LLM models (for UI)
 * Query params: status, provider, capability, costTier
 */
async function getLLMModels(req, res, next) {
    try {
        const models = await getAllLLMModels(req.query);
        res.json(models);
    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/llm-models/:id
 * Get single model by ID
 */
async function getLLMModel(req, res, next) {
    try {
        const model = await getLLMModelById(req.params.id);
        res.json(model);
    } catch (err) {
        next(err);
    }
}

/**
 * PATCH /api/llm-models/:id
 * Update model (partial)
 */
async function updateLLMModel(req, res, next) {
    try {
        const model = await updateLLMModelById(
            req.params.id,
            req.body
        );
        res.json(model);
    } catch (err) {
        next(err);
    }
}

/**
 * DELETE /api/llm-models/:id
 * Soft delete → deprecate model
 */
async function deleteLLMModel(req, res, next) {
    try {
        const model = await deprecateLLMModel(req.params.id);
        res.json({
            message: "Model deprecated successfully",
            model,
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    createLLMModel,
    getLLMModels,
    getLLMModel,
    updateLLMModel,
    deleteLLMModel,
};
