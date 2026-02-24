// src/services/conversation.service.js
const Conversation = require('../models/Conversation');
const Persona = require('../models/Persona');  // Added Persona model
const Message = require('../models/Message');
const mongoose = require('mongoose');
const LLMModel = require("../models/LLMModel");
const ConversationSummary = require('../models/ConversationSummary');
const { computeMessageImportance } = require('../utils/importance.utils');

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

  const filter = { userId: new mongoose.Types.ObjectId(userId) };

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
      .select({ title: 1, agentId: 1, createdAt: 1, updatedAt: 1 })
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

  console.log(`✅ Message saved | Role: ${role} | PersonaId: ${msg.personaId || 'user'}`);

  return msg.toObject();
}

async function getMessages(userId, conversationId, { page = 1, limit = 50 }) {
  if (!mongoose.isValidObjectId(userId)) throw Object.assign(new Error('Invalid userId'), { status: 400 });
  if (!mongoose.isValidObjectId(conversationId)) throw Object.assign(new Error('Invalid conversationId'), { status: 400 });

  const conv = await Conversation.findById(conversationId);
  if (!conv) throw Object.assign(new Error('Conversation not found'), { status: 404 });
  if (conv.userId.toString() !== userId) throw Object.assign(new Error('Forbidden'), { status: 403 });

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Message.find({ conversationId: new mongoose.Types.ObjectId(conversationId) })
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Message.countDocuments({ conversationId: new mongoose.Types.ObjectId(conversationId) })
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

module.exports = { createConversation, listConversations, addMessage, getMessages, renameConversation, deleteConversation, updateConversationModel, switchPersona };
