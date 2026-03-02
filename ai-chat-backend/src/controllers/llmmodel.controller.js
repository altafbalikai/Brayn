const llmModelService = require('../services/llmmodel.service');

/**
 * POST /api/llm-models
 * Create a new LLM model
 */
async function createLLMModel(req, res, next) {
    try {
        const model = await llmModelService.addLLMModel(req.body);
        res.status(201).json(model);
    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/admin/llm-models
 * List ALL LLM models (for admin)
 */
async function getAllModels(req, res, next) {
    try {
        const models = await llmModelService.getLLMModels(req.query);
        res.json(models);
    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/llm-models/active
 * List ONLY active LLM models (for composer)
 */
async function getActiveModels(req, res, next) {
    try {
        const models = await llmModelService.getLLMModels({
            ...req.query,
            status: "active"
        });
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
        const model = await llmModelService.getLLMModelById(req.params.id);
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
        const model = await llmModelService.updateLLMModelById(
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
        const model = await llmModelService.deprecateLLMModel(req.params.id);
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
    getAllModels,
    getActiveModels,
    getLLMModel,
    updateLLMModel,
    deleteLLMModel,
};
