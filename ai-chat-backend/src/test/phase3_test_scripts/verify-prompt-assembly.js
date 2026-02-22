require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');
const User = require('./src/models/User');
const Conversation = require('./src/models/Conversation');
const LLMModel = require('./src/models/LLMModel');
const UserMemory = require('./src/models/UserMemory');
const UserMemoryAuditLog = require('./src/models/UserMemoryAuditLog');

// Mock dependencies
const logger = require('./src/config/logger');
logger.warn = () => { };
logger.error = () => { };

const systemPromptCache = require('./src/utils/systemPromptCache');
systemPromptCache.getSystemPrompt = async () => "Base System Prompt";

// Mock the openrouter client
const openRouterMock = {
    chat: {
        send: async ({ messages }) => {
            capturedPayload = messages;
            // Return an async iterable that yields nothing or a mock response
            return (async function* () {
                yield { choices: [{ delta: { content: "Mock response" } }] };
            })();
        }
    }
};

// Mock @openrouter/sdk
const openRouterSdkPath = require.resolve('@openrouter/sdk');
require.cache[openRouterSdkPath] = {
    id: openRouterSdkPath,
    filename: openRouterSdkPath,
    loaded: true,
    exports: {
        OpenRouter: function () { return openRouterMock; }
    }
};

const geminiServicePath = path.resolve(__dirname, 'src/services/gemini.service.js');
delete require.cache[geminiServicePath];
const geminiService = require('./src/services/gemini.service');

const TEST_USER_ID = new mongoose.Types.ObjectId("65d5f1e9c9a2a7b3c4d5e6f7");
const TEST_CONV_ID = new mongoose.Types.ObjectId("65d5f1e9c9a2a7b3c4d5e6f8");
const TEST_MODEL_ID = new mongoose.Types.ObjectId("65d5f1e9c9a2a7b3c4d5e6f9");

function assert(condition, message) {
    if (!condition) {
        console.log('FAIL:', message);
        process.exit(1);
    }
}

async function runTests() {
    console.log('--- Part 4: Conflict Rule and Injection Audit Live Test ---\n');

    await mongoose.connect(process.env.MONGO_URI);

    try {
        // Cleanup and Seed
        await User.deleteMany({ _id: TEST_USER_ID });
        await Conversation.deleteMany({ _id: TEST_CONV_ID });
        await LLMModel.deleteMany({ _id: TEST_MODEL_ID });
        await UserMemory.deleteMany({ userId: TEST_USER_ID });
        await UserMemoryAuditLog.deleteMany({ userId: TEST_USER_ID });

        await User.create({ _id: TEST_USER_ID, email: 'test@example.com', name: 'Test User', role: 'user', tokenVersion: 0 });
        await LLMModel.create({
            _id: TEST_MODEL_ID,
            displayName: 'Test Model',
            provider: 'google',
            openRouterModelId: 'google/gemini-2.0-flash-001', // Real ID to bypass any unexpected validation
            family: 'test',
            version: '1.0',
            capabilities: ['text'],
            status: 'active'
        });
        await Conversation.create({ _id: TEST_CONV_ID, userId: TEST_USER_ID, selectedModelId: TEST_MODEL_ID });

        // Seed high-prio memory
        await UserMemory.create({
            userId: TEST_USER_ID,
            key: 'preferred_language',
            value: 'Rust',
            category: 'preference',
            importance: 8,
            confidence: 1.0,
            sourceConversationId: TEST_CONV_ID
        });

        const messages = [{ role: 'user', text: 'Hello' }];

        // Trigger prompt assembly
        try {
            await geminiService.askConversationStream(TEST_CONV_ID.toString(), messages, TEST_USER_ID.toString());
        } catch (err) {
            // We ignore errors here as we only care if capturedPayload was set
            // The 400 error happens because even with mock, something might be triggering a check
        }

        assert(capturedPayload !== null, "Could not capture payload");

        // Test 14 — Conflict rule present unconditionally
        const slot1 = capturedPayload[0].content;
        assert(slot1.includes("treat the conversation-level signal as authoritative"), "Test 14: Conflict rule missing from Slot 1");
        console.log('PASS: Test 14 — Conflict rule present unconditionally');

        // Test 15 — Slot 2 is separate from Slot 1
        assert(!slot1.includes('[User Memory]'), "Test 15: User Memory should not be in Slot 1");
        const slot2 = capturedPayload[1];
        assert(slot2.role === 'system' && slot2.content.includes('[User Memory]'), "Test 15: Slot 2 missing or not separate");
        assert(slot2.content.includes('- preferred_language: Rust'), "Test 15: Slot 2 content missing memory");
        console.log('PASS: Test 15 — Slot 2 is separate from Slot 1');

        // Test 16 — Injection audit entries created
        console.log('  Waiting for fire-and-forget audit log...');
        await new Promise(r => setTimeout(r, 1000));
        const injectLogs = await UserMemoryAuditLog.find({ userId: TEST_USER_ID, action: 'INJECTED' });
        assert(injectLogs.length > 0, "Test 16: No INJECTED audit log found");
        console.log('PASS: Test 16 — Injection audit entries created');

    } finally {
        await mongoose.connection.close();
    }

    process.exit(0);
}

runTests().catch(err => {
    if (err.name === 'ValidationError') {
        process.stdout.write('Mongoose ValidationError: ' + JSON.stringify(err.errors, null, 2) + '\n');
    } else {
        console.error('Test Execution Error:', err);
    }
    process.exit(1);
});
