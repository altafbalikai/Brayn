const express = require('express');
const router = express.Router();
const summaryController = require('../controllers/summary.controller');
const auth = require('../middlewares/auth.middleware');

router.use(auth);

// POST /api/summary/:conversationId
router.post('/:conversationId', summaryController.summarizeConversation);

module.exports = router;
