const express = require('express');
const router = express.Router();
const { ask } = require('../controllers/llm.controller');
const branchController = require('../controllers/branch.controller');
const auth = require('../middlewares/auth.middleware');
const { handleValidationErrors } = require('../middlewares/validation.middleware');
const { askValidation, branchValidation } = require('../validators/llm.validator');

// require JWT auth for AI interaction
router.use(auth);

// POST /api/llm/ask
router.post('/conversations/:cid/ask', askValidation, handleValidationErrors, ask);

router.post(
    '/conversations/:cid/branch',
    branchValidation,
    handleValidationErrors,
    branchController.branchConversation
);

module.exports = router;
