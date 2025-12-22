const express = require('express');
const router = express.Router();
const { ask } = require('../controllers/llm.controller');
const auth = require('../middlewares/auth.middleware');
const { handleValidationErrors } = require('../middlewares/validation.middleware');
const { askValidation } = require('../validators/llm.validator');

// require JWT auth for AI interaction
router.use(auth);

// POST /api/llm/ask
router.post('/ask', askValidation, handleValidationErrors, ask);

module.exports = router;
