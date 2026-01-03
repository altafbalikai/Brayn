// src/routes/conversation.routes.js
const express = require('express');
const router = express.Router();
const convController = require('../controllers/conversation.controller');
const auth = require('../middlewares/auth.middleware');
const { handleValidationErrors } = require('../middlewares/validation.middleware');
const { cacheMiddleware } = require('../middlewares/cache.middleware');
const {
  createConversationValidation,
  listConversationsValidation,
  addMessageValidation,
  getMessagesValidation,
  renameConversationValidation,
  deleteConversationValidation
} = require('../validators/conversation.validator');

// ensure auth middleware is required before protected routes
router.use(auth);

router.post('/', createConversationValidation, handleValidationErrors, convController.createConversation);
router.get('/my', listConversationsValidation, handleValidationErrors, cacheMiddleware(60000), convController.listConversations); // Cache for 1 minute
router.post('/:cid/messages', addMessageValidation, handleValidationErrors, convController.addMessage);
router.get('/:cid/messages', getMessagesValidation, handleValidationErrors, cacheMiddleware(30000), convController.getMessages); // Cache for 30 seconds
router.patch('/:cid/rename', renameConversationValidation, handleValidationErrors, convController.renameConversation);
router.delete('/:cid', deleteConversationValidation, handleValidationErrors, convController.deleteConversation);

module.exports = router;
