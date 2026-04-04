// src/controllers/conversation.controller.js
const ConversationService = require('../services/conversation.service');

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
    const useNodeTree =
      req.query.nodeTree === 'true' ||
      process.env.USE_NODE_TREE === 'true';
    let data;
    if (useNodeTree) {
      data = await ConversationService.getMessagesNodeTree(userId, cid);
    } else {
      const page = parseInt(req.query.page || '1');
      const limit = parseInt(req.query.limit || '50');
      data = await ConversationService.getMessages(userId, cid, { page, limit });
    }
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function activateNode(req, res, next) {
  try {
    const userId = req.user?.id;
    const { nodeId } = req.params;
    const { targetSiblingId } = req.body;
    if (!targetSiblingId) {
      return res.status(400).json({ error: 'targetSiblingId is required' });
    }
    const data = await ConversationService.activateNode(
      userId, nodeId, targetSiblingId
    );
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function getConversation(req, res, next) {
  try {
    const userId = req.user?.id;
    const { cid } = req.params;

    const conv = await ConversationService.getConversationById(userId, cid);
    res.json(conv);
  } catch (err) {
    next(err);
  }
}

async function getBranches(req, res, next) {
  try {
    const userId = req.user?.id;
    const { cid } = req.params;
    const branches = await ConversationService.getBranchesForConversation(userId, cid);
    res.json(branches);
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
  activateNode,
  getConversation,
  getBranches,
  renameConversation,
  deleteConversation,
  updateConversationModel,
  switchPersona
};
