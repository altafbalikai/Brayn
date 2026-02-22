require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');
const Conversation = require('./src/models/Conversation');
const LLMModel = require('./src/models/LLMModel');
const UserMemory = require('./src/models/UserMemory');
const UserMemoryAuditLog = require('./src/models/UserMemoryAuditLog');
const { askConversationStream } = require('./src/services/gemini.service');

const TEST_USER_ID = new mongoose.Types.ObjectId("65d5f1e9c9a2a7b3c4d5e6f7");
const TEST_CONV_ID = new mongoose.Types.ObjectId("65d5f1e9c9a2a7b3c4d5e6f8");
const TEST_MODEL_ID = new mongoose.Types.ObjectId("65d5f1e9c9a2a7b3c4d5e6f9");

async function run() {
    await mongoose.connect(process.env.MONGO_URI);

    // Seed
    await User.findOneAndUpdate({ _id: TEST_USER_ID }, { email: 'test@example.com', name: 'Test User', role: 'user', tokenVersion: 0 }, { upsert: true });
    await LLMModel.findOneAndUpdate({ _id: TEST_MODEL_ID }, {
        displayName: 'Test Model',
        provider: 'google',
        openRouterModelId: 'google/gemini-pro', // use real id to avoid early validation error if any
        family: 'gemini',
        version: '1.0',
        capabilities: ['text'],
        status: 'active'
    }, { upsert: true });
    await Conversation.findOneAndUpdate({ _id: TEST_CONV_ID }, { userId: TEST_USER_ID, selectedModelId: TEST_MODEL_ID }, { upsert: true });

    await UserMemory.deleteMany({ userId: TEST_USER_ID });
    await UserMemory.create({
        userId: TEST_USER_ID,
        key: 'preferred_language',
        value: 'Rust',
        category: 'preference',
        importance: 8,
        confidence: 1.0,
        sourceConversationId: TEST_CONV_ID
    });

    console.log('Triggering askConversationStream...');
    try {
        await askConversationStream(TEST_CONV_ID.toString(), [{ role: 'user', text: 'hi' }], TEST_USER_ID.toString());
    } catch (err) {
        // ...
    }

    await mongoose.connection.close();
}

run();
