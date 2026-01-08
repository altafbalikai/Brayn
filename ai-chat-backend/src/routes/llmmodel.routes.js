const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const { handleValidationErrors } = require('../middlewares/validation.middleware');
const {
    createLLMModel,
    getLLMModels,
    getLLMModel,
    updateLLMModel,
    deleteLLMModel,
} = require('../controllers/llmmodel.controller');
const convController = require('../controllers/conversation.controller');
const {
    createLLMModelValidation,
    updateLLMModelValidation,
    getLLMModelsValidation,
    llmModelIdValidation,
} = require('../validators/llmmodel.validator');

// require JWT auth for AI interaction
router.use(auth);

router.post("/", createLLMModelValidation, handleValidationErrors, createLLMModel);
router.get("/", getLLMModelsValidation, handleValidationErrors, getLLMModels);
router.get("/:id", llmModelIdValidation, handleValidationErrors, getLLMModel);
router.patch("/:id", llmModelIdValidation, updateLLMModelValidation, handleValidationErrors, updateLLMModel);
router.delete("/:id", llmModelIdValidation, handleValidationErrors, deleteLLMModel);

module.exports = router;
