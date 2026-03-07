// src/controllers/conversation.controller.js
const { askGemini } = require('../services/llm.service');
const ConversationService = require('../services/conversation.service');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');

async function createConversation(req, res, next) {
  try {
    const userId = req.user?.id;
    const { agentId, title, modelId, currentPersonaId } = req.body;
    const conv = await ConversationService.createConversation(userId, agentId, title, modelId, currentPersonaId);
    res.status(201).json(conv);
  } catch (err) {
    next(err);
  }
}

async function listConversations(req, res, next) {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    // read from query params: /api/conversations/my?agent=...&page=1&limit=50
    const agent = typeof req.query.agent === 'string' && req.query.agent.trim() ? req.query.agent.trim() : undefined;
    const page = req.query.page;
    const limit = req.query.limit;

    const data = await ConversationService.listConversations(userId, agent, page, limit);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function addMessage(req, res, next) {
  try {
    const userId = req.user?.id;
    const { cid } = req.params;
    const { role = 'user', text } = req.body;
    const msg = await ConversationService.addMessage(userId, cid, { role, text });
    res.status(201).json(msg);
  } catch (err) {
    next(err);
  }
}

async function getMessages(req, res, next) {
  try {
    const userId = req.user?.id;
    const { cid } = req.params;
    const page = parseInt(req.query.page || '1');
    const limit = parseInt(req.query.limit || '50');
    const data = await ConversationService.getMessages(userId, cid, { page, limit });
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function getConversation(req, res, next) {
  try {
    const userId = req.user?.id;
    const { cid } = req.params;

    const conv = await Conversation.findById(cid).lean();
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    if (conv.userId.toString() !== userId)
      return res.status(403).json({ error: 'Forbidden' });

    res.json(conv);
  } catch (err) {
    next(err);
  }
}

async function getBranches(req, res, next) {
  try {
    const userId = req.user?.id;
    const { cid } = req.params;

    const conv = await Conversation.findById(cid)
      .select('userId parentConversationId')
      .lean();
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    if (conv.userId.toString() !== userId)
      return res.status(403).json({ error: 'Forbidden' });

    const rootId = conv.parentConversationId || conv._id;

    const [root, branches] = await Promise.all([
      Conversation.findById(rootId).select('_id title createdAt').lean(),
      Conversation.find({ parentConversationId: rootId })
        .select('_id branchedFromMessageId editedMessageId branchEditedMessageId createdAt title')
        .sort({ createdAt: 1 })
        .lean()
    ]);

    res.json([
      {
        ...root,
        branchedFromMessageId: null,
        editedMessageId: null,
        branchEditedMessageId: null,
        isRoot: true
      },
      ...branches
    ]);
  } catch (error) {
    next(error);
  }
}

async function renameConversation(req, res, next) {
  try {
    const userId = req.user?.id;
    const { cid } = req.params;
    const { title } = req.body;
    const conv = await ConversationService.renameConversation(userId, cid, title);
    res.json(conv);
  } catch (err) {
    next(err);
  }
}
async function deleteConversation(req, res, next) {
  try {
    const userId = req.user?.id;
    const { cid } = req.params;
    await ConversationService.deleteConversation(userId, cid);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/conversations/:cid/model
 * ⭐ NEW — switch active LLM model
 */
async function updateConversationModel(req, res, next) {
  try {
    const userId = req.user?.id;
    const { cid } = req.params;
    const { modelId } = req.body;

    const conv = await ConversationService.updateConversationModel(
      userId,
      cid,
      modelId
    );

    res.json(conv);
  } catch (err) {
    next(err);
  }
}

async function switchPersona(req, res, next) {
  try {
    const userId = req.user?.id;
    const { cid } = req.params;
    const { personaId } = req.body;

    const conv = await ConversationService.switchPersona(userId, cid, personaId);
    res.json(conv);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createConversation,
  listConversations,
  addMessage,
  getMessages,
  getConversation,
  getBranches,
  renameConversation,
  deleteConversation,
  updateConversationModel,
  switchPersona
};
