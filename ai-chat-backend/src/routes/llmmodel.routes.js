const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const { authorize } = require('../middlewares/auth.middleware');
const { handleValidationErrors } = require('../middlewares/validation.middleware');
const {
    createLLMModel,
    getAllModels,
    getActiveModels,
    getLLMModel,
    updateLLMModel,
    deleteLLMModel,
} = require('../controllers/llmmodel.controller');
const {
    createLLMModelValidation,
    updateLLMModelValidation,
    getLLMModelsValidation,
    llmModelIdValidation,
} = require('../validators/llmmodel.validator');

/**
 * COMPOSER / PUBLIC ROUTES
 */
// GET /api/llm-models/active -> Only active models
router.get("/llm-models/active", auth, getLLMModelsValidation, handleValidationErrors, getActiveModels);

// GET /api/llm-models/ -> Backward compatibility (returns active models)
router.get("/llm-models", auth, getLLMModelsValidation, handleValidationErrors, getActiveModels);

/**
 * ADMIN ROUTES
 */
// GET /api/admin/llm-models -> All models
router.get("/admin/llm-models", auth, authorize("admin"), getLLMModelsValidation, handleValidationErrors, getAllModels);

// POST /api/llm-models -> Create model (Admin only)
router.post("/llm-models", auth, authorize("admin"), createLLMModelValidation, handleValidationErrors, createLLMModel);

// Single model operations
router.get("/llm-models/:id", auth, llmModelIdValidation, handleValidationErrors, getLLMModel);
router.patch("/llm-models/:id", auth, authorize("admin"), llmModelIdValidation, updateLLMModelValidation, handleValidationErrors, updateLLMModel);
router.delete("/llm-models/:id", auth, authorize("admin"), llmModelIdValidation, handleValidationErrors, deleteLLMModel);

module.exports = router;
