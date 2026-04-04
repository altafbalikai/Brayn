// src/services/conversation.service.js
const Conversation = require('../models/Conversation');
const Persona = require('../models/Persona');  // Added Persona model
const Message = require('../models/Message');
const mongoose = require('mongoose');
const LLMModel = require("../models/LLMModel");
const ConversationSummary = require('../models/ConversationSummary');
const { computeMessageImportance } = require('../utils/importance.utils');
const logger = require('../config/logger');

async function createConversation(userId, agentId, title, selectedModelId = '695c80a243c5787036d8173c', personaId = null) {
  if (!mongoose.isValidObjectId(userId)) {
    throw Object.assign(new Error('Invalid userId'), { status: 400 });
  }

  if (selectedModelId && !mongoose.isValidObjectId(selectedModelId)) {
    throw Object.assign(new Error("Invalid modelId"), { status: 400 });
  }

  // ✅ NEW: Decide persona
  let activePersonaId = personaId;

  if (!activePersonaId) {
    // Fetch default persona
    let defaultPersona = await Persona.findOne({
      slug: 'general-assistant',
      isActive: true
    });

    // Fallback: If no general-assistant, try any active persona
    if (!defaultPersona) {
      defaultPersona = await Persona.findOne({ isActive: true });
    }

    if (!defaultPersona) {
      throw Object.assign(new Error('No active personas found to initialize conversation'), { status: 500 });
    }

    activePersonaId = defaultPersona.id;
  }

  const conv = await Conversation.create({
    userId: new mongoose.Types.ObjectId(userId),
    agentId: agentId || 'default',
    title: title || 'New Conversation',
    selectedModelId: selectedModelId,
    currentPersonaId: activePersonaId, // Now correctly assigned
  });

  // Removed the console.log that referenced defaultPersona.name as it might not be defined
  // if a personaId was explicitly passed.

  return conv.toObject();
}

/**
 * List conversations for a user, optionally filtered by agentId (or title fallback).
 * Supports pagination (page, limit).
 */
async function listConversations(userId, agentId, page = 1, limit = 50) {
  if (!mongoose.isValidObjectId(userId)) {
    throw Object.assign(new Error('Invalid userId'), { status: 400 });
  }

  page = Math.max(1, parseInt(page, 10) || 1);
  limit = Math.max(1, Math.min(200, parseInt(limit, 10) || 50)); // cap limit for safety

  const filter = {
    userId: new mongoose.Types.ObjectId(userId),
    parentConversationId: null
  };

  if (agentId) {
    // Prefer exact agentId match; if not present then fallback to title contains (case-insensitive)
    filter.$or = [
      { agentId: agentId },
      { title: new RegExp(agentId, 'i') }
    ];
  }

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Conversation.find(filter)
      .select({ title: 1, agentId: 1, createdAt: 1, updatedAt: 1, selectedModelId: 1, parentConversationId: 1 })
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Conversation.countDocuments(filter)
  ]);

  return {
    items,
    total,
    page,
    limit
  };
}


async function addMessage(userId, conversationId, { role, text, personaId: providedPersonaId }) {
  if (!mongoose.isValidObjectId(userId)) {
    throw Object.assign(new Error('Invalid userId'), { status: 400 });
  }

  if (!mongoose.isValidObjectId(conversationId)) {
    throw Object.assign(new Error('Invalid conversationId'), { status: 400 });
  }

  const conv = await Conversation.findById(conversationId);
  if (!conv) throw Object.assign(new Error('Conversation not found'), { status: 404 });
  if (conv.userId.toString() !== userId) throw Object.assign(new Error('Forbidden'), { status: 403 });

  const importance = computeMessageImportance(text, role);

  // Atomic increment messageCount + update timestamp
  await Conversation.findByIdAndUpdate(
    conv._id,
    { $inc: { messageCount: 1 }, $set: { updatedAt: new Date() } }
  );

  // ✅ FIX: Use provided personaId or fetch from conversation for assistant messages
  let personaId = providedPersonaId;
  if (!personaId && role === 'assistant') {
    personaId = conv.currentPersonaId;
  }

  const msg = await Message.create({
    conversationId: conv._id,
    userId: new mongoose.Types.ObjectId(userId),
    role,
    text,
    importance,
    createdAt: new Date(),
    modelId: conv.selectedModelId, // ⭐ SNAPSHOT
    personaId: role === 'assistant' ? (personaId || conv.currentPersonaId) : null,
  });

  logger.info('Message saved', { role, personaId: msg.personaId || 'user' });

  return msg.toObject();
}

async function getMessages(userId, conversationId, { page = 1, limit = 50 }) {
  if (!mongoose.isValidObjectId(userId)) throw Object.assign(new Error('Invalid userId'), { status: 400 });
  if (!mongoose.isValidObjectId(conversationId)) throw Object.assign(new Error('Invalid conversationId'), { status: 400 });

  const conv = await Conversation.findById(conversationId);
  if (!conv) throw Object.assign(new Error('Conversation not found'), { status: 404 });
  if (conv.userId.toString() !== userId) throw Object.assign(new Error('Forbidden'), { status: 403 });

  const skip = (page - 1) * limit;

  let query = { conversationId: new mongoose.Types.ObjectId(conversationId) };

  if (conv.parentConversationId && conv.branchedFromMessageId) {
    query = {
      $or: [
        { conversationId: new mongoose.Types.ObjectId(conversationId) },
        {
          conversationId: conv.parentConversationId,
          _id: { $lte: conv.branchedFromMessageId }
        }
      ]
    };
  }

  const [items, total] = await Promise.all([
    Message.find(query)
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Message.countDocuments(query)
  ]);

  // Enrich items with persona metadata
  const personaIds = [...new Set(items.map(m => m.personaId).filter(Boolean))];
  const personas = await Persona.find({ id: { $in: personaIds } }).lean();
  const personaMap = personas.reduce((acc, p) => ({ ...acc, [p.id]: p }), {});

  const enrichedItems = items.map(m => ({
    ...m,
    persona: m.personaId ? personaMap[m.personaId] : null
  }));

  return { items: enrichedItems, total, page, limit };
}

async function getMessagesNodeTree(userId, conversationId) {
  if (!mongoose.isValidObjectId(userId)) throw Object.assign(new Error('Invalid userId'), { status: 400 });
  if (!mongoose.isValidObjectId(conversationId)) throw Object.assign(new Error('Invalid conversationId'), { status: 400 });

  const conv = await Conversation.findById(conversationId);
  if (!conv) throw Object.assign(new Error('Conversation not found'), { status: 404 });
  if (conv.userId.toString() !== userId) throw Object.assign(new Error('Forbidden'), { status: 403 });

  if (conv.rootMessageId == null) {
    return getMessages(userId, conversationId, { page: 1, limit: 200 });
  }

  const activePath = [];
  const visited = new Set();
  let currentMessage = await Message.findById(
    conv.rootMessageId,
    { _id: 1, activeChildId: 1 }
  ).lean();

  while (currentMessage) {
    const currentKey = String(currentMessage._id);

    if (visited.has(currentKey)) {
      throw Object.assign(new Error('Corrupt conversation tree: cycle detected'), { status: 500 });
    }

    visited.add(currentKey);
    activePath.push(currentMessage._id);

    if (currentMessage.activeChildId == null) {
      break;
    }

    const nextMessage = await Message.findById(
      currentMessage.activeChildId,
      { _id: 1, activeChildId: 1 }
    ).lean();

    if (!nextMessage) {
      console.warn(`[getMessagesNodeTree] dangling activeChildId on message ${currentMessage._id} in conversation ${conversationId}`);
      break;
    }

    currentMessage = nextMessage;
  }

  const pathMessages = activePath.length > 0
    ? await Message.find({ _id: { $in: activePath } }).lean()
    : [];

  const messageMap = new Map(pathMessages.map((message) => [String(message._id), message]));
  const orderedItems = activePath
    .map((messageId) => messageMap.get(String(messageId)))
    .filter(Boolean);

  const siblingEntries = await Promise.all(orderedItems.map(async (message) => {
    const siblingQuery = message.parentMessageId
      ? { parentMessageId: message.parentMessageId, role: message.role }
      : { conversationId: message.conversationId, parentMessageId: null, role: message.role };

    const siblings = await Message.find(
      siblingQuery,
      { _id: 1, createdAt: 1 }
    ).sort({ createdAt: 1 }).lean();

    const siblingIds = siblings.map(s => String(s._id));
    const position = siblingIds.indexOf(String(message._id));
    const total = siblings.length;

    return [String(message._id), { total, position, siblingIds }];
  }));

  const siblingCounts = siblingEntries.reduce((acc, [messageId, counts]) => ({
    ...acc,
    [messageId]: counts
  }), {});

  const personaIds = [...new Set(orderedItems.map(m => m.personaId).filter(Boolean))];
  const personas = await Persona.find({ id: { $in: personaIds } }).lean();
  const personaMap = personas.reduce((acc, p) => ({ ...acc, [p.id]: p }), {});

  const enrichedItems = orderedItems.map(m => ({
    ...m,
    persona: m.personaId ? personaMap[m.personaId] : null
  }));

  return {
    items: enrichedItems,
    total: activePath.length,
    page: 1,
    limit: activePath.length,
    siblingCounts,
  };
}

async function renameConversation(userId, conversationId, title) {
  if (!mongoose.isValidObjectId(userId)) throw Object.assign(new Error('Invalid userId'), { status: 400 });
  if (!mongoose.isValidObjectId(conversationId)) throw Object.assign(new Error('Invalid conversationId'), { status: 400 });

  const conv = await Conversation.findById(conversationId);
  if (!conv) throw Object.assign(new Error('Conversation not found'), { status: 404 });
  if (conv.userId.toString() !== userId) throw Object.assign(new Error('Forbidden'), { status: 403 });

  conv.title = title;
  await conv.save();

  return conv.toObject();
}

async function deleteConversation(userId, conversationId) {
  if (!mongoose.isValidObjectId(userId)) throw Object.assign(new Error('Invalid userId'), { status: 400 });
  if (!mongoose.isValidObjectId(conversationId)) throw Object.assign(new Error('Invalid conversationId'), { status: 400 });

  const conv = await Conversation.findById(conversationId);
  if (!conv) throw Object.assign(new Error('Conversation not found'), { status: 404 });
  if (conv.userId.toString() !== userId) throw Object.assign(new Error('Forbidden'), { status: 403 });
  await Message.deleteMany({ conversationId: conv._id });
  await ConversationSummary.deleteMany({ conversationId: conv._id });
  await conv.deleteOne();
  return true;
}

async function updateConversationModel(userId, conversationId, modelId) {
  if (!mongoose.isValidObjectId(userId)) {
    throw Object.assign(new Error("Invalid userId"), { status: 400 });
  }
  if (!mongoose.isValidObjectId(conversationId)) {
    throw Object.assign(new Error("Invalid conversationId"), { status: 400 });
  }
  if (!mongoose.isValidObjectId(modelId)) {
    throw Object.assign(new Error("Invalid modelId"), { status: 400 });
  }

  const conv = await Conversation.findById(conversationId);
  if (!conv) throw Object.assign(new Error("Conversation not found"), { status: 404 });
  if (conv.userId.toString() !== userId) {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }

  // No-op if same model
  if (conv.selectedModelId?.toString() === modelId) {
    return conv.toObject();
  }

  conv.selectedModelId = modelId;
  await conv.save();

  // Get model display name
  const model = await LLMModel.findById(modelId);
  // ⭐ Insert system message for transparency
  // await Message.create({
  //   conversationId: conv._id,
  //   userId: new mongoose.Types.ObjectId(userId),
  //   role: "system",
  //   text: `Model switched to ${model.displayName}`,
  //   modelId,
  //   createdAt: new Date(),
  // });

  return conv.toObject();
}


// switchPersona logic

async function switchPersona(userId, conversationId, personaId) {
  if (!mongoose.isValidObjectId(userId)) throw Object.assign(new Error('Invalid userId'), { status: 400 });
  if (!mongoose.isValidObjectId(conversationId)) throw Object.assign(new Error('Invalid conversationId'), { status: 400 });

  // Validate persona exists
  const persona = await Persona.findOne({ id: personaId });
  if (!persona) throw Object.assign(new Error('Persona not found'), { status: 404 });
  if (!persona.isActive) throw Object.assign(new Error('Persona is not active'), { status: 400 });

  const conv = await Conversation.findById(conversationId);
  if (!conv) throw Object.assign(new Error('Conversation not found'), { status: 404 });
  if (conv.userId.toString() !== userId) throw Object.assign(new Error('Forbidden'), { status: 403 });

  conv.currentPersonaId = personaId;
  await conv.save();

  return conv.toObject();
}

async function getConversationById(userId, conversationId) {
  if (!mongoose.isValidObjectId(userId)) throw Object.assign(new Error('Invalid userId'), { status: 400 });
  if (!mongoose.isValidObjectId(conversationId)) throw Object.assign(new Error('Invalid conversationId'), { status: 400 });

  const conv = await Conversation.findById(conversationId).lean();
  if (!conv) throw Object.assign(new Error('Conversation not found'), { status: 404 });
  if (conv.userId.toString() !== userId) throw Object.assign(new Error('Forbidden'), { status: 403 });
  return conv;
}

async function getBranchesForConversation(userId, conversationId) {
  if (!mongoose.isValidObjectId(userId)) throw Object.assign(new Error('Invalid userId'), { status: 400 });
  if (!mongoose.isValidObjectId(conversationId)) throw Object.assign(new Error('Invalid conversationId'), { status: 400 });

  const conv = await Conversation.findById(conversationId)
    .select('userId parentConversationId')
    .lean();
  if (!conv) throw Object.assign(new Error('Conversation not found'), { status: 404 });
  if (conv.userId.toString() !== userId) throw Object.assign(new Error('Forbidden'), { status: 403 });

  const rootId = conv.parentConversationId || conv._id;

  const [root, branches] = await Promise.all([
    Conversation.findById(rootId).select('_id title createdAt').lean(),
    Conversation.find({ parentConversationId: rootId })
      .select('_id branchedFromMessageId editedMessageId branchEditedMessageId createdAt title')
      .sort({ createdAt: 1 })
      .lean()
  ]);

  return [
    {
      ...root,
      branchedFromMessageId: null,
      editedMessageId: null,
      branchEditedMessageId: null,
      isRoot: true
    },
    ...branches
  ];
}

async function activateNode(userId, nodeId, targetSiblingId) {
  if (!mongoose.isValidObjectId(userId)) throw Object.assign(new Error('Invalid userId'), { status: 400 });
  if (!mongoose.isValidObjectId(nodeId)) throw Object.assign(new Error('Invalid nodeId'), { status: 400 });
  if (!mongoose.isValidObjectId(targetSiblingId)) throw Object.assign(new Error('Invalid targetSiblingId'), { status: 400 });

  const target = await Message.findById(targetSiblingId).lean();
  if (!target) throw Object.assign(new Error('Message not found'), { status: 404 });

  const conv = await Conversation.findById(target.conversationId);
  if (!conv) throw Object.assign(new Error('Conversation not found'), { status: 404 });
  if (conv.userId.toString() !== userId) throw Object.assign(new Error('Forbidden'), { status: 403 });

  const node = await Message.findById(nodeId).lean();
  if (!node) throw Object.assign(new Error('Message not found'), { status: 404 });

  // Validate siblings share the same parent.
  // Root-level messages have parentMessageId = null —
  // they are siblings if they share the same conversationId.
  const targetParent = target.parentMessageId?.toString() ?? null;
  const nodeParent = node.parentMessageId?.toString() ?? null;

  if (targetParent !== nodeParent) {
    // One extra check: both null but different conversations
    // would still fail the conversationId ownership check above.
    throw Object.assign(new Error('targetSiblingId is not a sibling of nodeId'), { status: 400 });
  }

  // For root-level siblings (both parentMessageId = null),
  // update the conversation.rootMessageId to track active root.
  // For non-root siblings, update the parent's activeChildId.
  if (targetParent === null) {
    await Conversation.findByIdAndUpdate(
      target.conversationId,
      { $set: { rootMessageId: targetSiblingId } }
    );
  } else {
    await Message.findByIdAndUpdate(
      target.parentMessageId,
      { $set: { activeChildId: targetSiblingId } }
    );
  }

  // Reload conversation to get updated rootMessageId
  // (may have changed if we just updated it above)
  const convFresh = await Conversation.findById(
    target.conversationId,
    { rootMessageId: 1 }
  ).lean();

  // Walk full path from root to leaf (same as getMessagesNodeTree)
  // This ensures ancestors are always included in updatedPath
  const fullPathIds = [];
  const pathVisited = new Set();
  let cur = convFresh?.rootMessageId
    ? await Message.findById(
      convFresh.rootMessageId,
      { _id: 1, activeChildId: 1 }
    ).lean()
    : null;

  while (cur) {
    const key = String(cur._id);
    if (pathVisited.has(key)) {
      throw Object.assign(
        new Error('Corrupt conversation tree: cycle detected'),
        { status: 500 }
      );
    }
    pathVisited.add(key);
    fullPathIds.push(cur._id);
    if (!cur.activeChildId) break;
    const next = await Message.findById(
      cur.activeChildId,
      { _id: 1, activeChildId: 1 }
    ).lean();
    if (!next) {
      console.warn(
        `[activateNode] dangling activeChildId on message ` +
        `${cur._id} in conversation ${target.conversationId}`
      );
      break;
    }
    cur = next;
  }

  const fullPathMessages = fullPathIds.length > 0
    ? await Message.find({ _id: { $in: fullPathIds } }).lean()
    : [];

  const pathMap = new Map(
    fullPathMessages.map(m => [String(m._id), m])
  );
  const orderedMessages = fullPathIds
    .map(id => pathMap.get(String(id)))
    .filter(Boolean);

  // Compute sibling counts for full path (role-filtered)
  const siblingEntries = await Promise.all(
    orderedMessages.map(async (message) => {
      const siblingQuery = message.parentMessageId
        ? {
          parentMessageId: message.parentMessageId,
          role: message.role
        }
        : {
          conversationId: message.conversationId,
          parentMessageId: null,
          role: message.role
        };
      const siblings = await Message.find(
        siblingQuery,
        { _id: 1, createdAt: 1 }
      ).sort({ createdAt: 1 }).lean();
      const siblingIds = siblings.map(s => String(s._id));
      const position = siblingIds.indexOf(String(message._id));
      return [String(message._id), {
        total: siblings.length,
        position,
        siblingIds,
      }];
    })
  );
  const siblingCounts = Object.fromEntries(siblingEntries);

  return {
    activatedNodeId: targetSiblingId,
    updatedPath: orderedMessages,
    siblingCounts,
  };
}

module.exports = {
  createConversation,
  listConversations,
  addMessage,
  getMessages,
  getMessagesNodeTree,
  activateNode,
  renameConversation,
  deleteConversation,
  updateConversationModel,
  switchPersona,
  getConversationById,
  getBranchesForConversation
};
