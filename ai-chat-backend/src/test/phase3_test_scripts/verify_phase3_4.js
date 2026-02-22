const mongoose = require('mongoose');

// Mock dependencies of gemini.service before requiring it
const logger = require('./src/config/logger');
logger.warn = () => { };
logger.error = () => { };

// Mock the system prompt cache to avoid DB calls at top level
const systemPromptCache = require('./src/utils/systemPromptCache');
systemPromptCache.getSystemPrompt = async () => "Base system prompt";

// Mock userMemory.service BEFORE requiring gemini.service
const path = require('path');
const servicePath = path.resolve(__dirname, 'src/services/userMemory.service.js');
const geminiPath = path.resolve(__dirname, 'src/services/gemini.service.js');

// Clear cache to be sure
delete require.cache[servicePath];
delete require.cache[geminiPath];

const userMemoryServiceMock = {
    getUserMemories: async () => [],
    logMemoryInjection: () => { }
};
require.cache[servicePath] = {
    id: servicePath,
    filename: servicePath,
    loaded: true,
    exports: userMemoryServiceMock
};

const { getInjectedUserMemory } = require('./src/services/gemini.service');

// Mock memories for testing injection logic
const mockMemories = [
    { key: 'pref1', value: 'rust', importance: 10, confidence: 0.9, updatedAt: new Date('2024-01-01') },
    { key: 'pref2', value: 'go', importance: 9, confidence: 0.8, updatedAt: new Date('2024-01-02') },
    { key: 'pref3', value: 'js', importance: 8, confidence: 0.7, updatedAt: new Date('2024-01-03') },
    { key: 'pref4', value: 'py', importance: 7, confidence: 0.6, updatedAt: new Date('2024-01-04') },
    { key: 'pref5', value: 'rb', importance: 6, confidence: 0.5, updatedAt: new Date('2024-01-05') }, // Low importance
    { key: 'pref6', value: 'ts', importance: 7, confidence: 0.4, updatedAt: new Date('2024-01-06') }, // Low confidence
];

const userMemoryService = require('./src/services/userMemory.service');
const originalGetUserMemories = userMemoryService.getUserMemories;

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function test(name, fn) {
    try {
        fn();
        console.log(`✅ PASS: ${name}`);
    } catch (err) {
        console.log(`❌ FAIL: ${name} - ${err.message}`);
    }
}

async function runTests() {
    console.log('--- Phase 3.4 Logic Verification ---\n');

    userMemoryServiceMock.getUserMemories = async () => mockMemories;

    const res = await getInjectedUserMemory('some-user-id');
    // console.log('Injection output sample:\n', res);

    test('P3.4-T1: Filter importance >= 7 and confidence >= 0.5', () => {
        assert(res.includes('pref1') && res.includes('pref4'), "Should include high-rank items");
        assert(!res.includes('pref5'), "Should filter importance < 7");
        assert(!res.includes('pref6'), "Should filter confidence < 0.5");
    });

    test('P3.4-T2: Format check', () => {
        assert(res.startsWith('[User Memory]\n'), "Header missing");
        assert(res.includes('- pref1: rust'), "Item format wrong");
    });

    userMemoryServiceMock.getUserMemories = async () => [
        { key: 'long', value: 'A'.repeat(1100), importance: 10, confidence: 1.0 }, // ~275 tokens
        { key: 'short', value: 'B'.repeat(200), importance: 8, confidence: 1.0 }  // ~50 tokens
    ];
    const res2 = await getInjectedUserMemory('some-user-id');
    test('P3.4-T4: Token limit (shed lowest importance)', () => {
        assert(res2.includes('long') && !res2.includes('short'), "Should have shed 'short' (importance 8)");
    });

    console.log('\n--- Logic Verification Finished ---');
    process.exit(0);
}

runTests().catch(err => {
    console.error('Test Execution Error:', err);
    process.exit(1);
});
