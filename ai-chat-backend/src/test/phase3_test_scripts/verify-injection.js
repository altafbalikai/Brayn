const mongoose = require('mongoose');
const path = require('path');

// Mock dependencies of gemini.service before requiring it
const logger = require('./src/config/logger');
logger.warn = () => { };
logger.error = () => { };

const systemPromptCache = require('./src/utils/systemPromptCache');
systemPromptCache.getSystemPrompt = async () => "Base system prompt";

// Mock userMemory.service with a switchable mock
const servicePath = path.resolve(__dirname, 'src/services/userMemory.service.js');
const geminiPath = path.resolve(__dirname, 'src/services/gemini.service.js');

let userMemoriesBatch = [];
const userMemoryServiceMock = {
    getUserMemories: async () => userMemoriesBatch,
    logMemoryInjection: async () => { } // returns promise but test won't await anyway
};

// Clear cache to ensure mock is taken
delete require.cache[servicePath];
delete require.cache[geminiPath];

require.cache[servicePath] = {
    id: servicePath,
    filename: servicePath,
    loaded: true,
    exports: userMemoryServiceMock
};

const { getInjectedUserMemory } = require('./src/services/gemini.service');

const now = new Date();

function assert(condition, message) {
    if (!condition) {
        console.log('FAIL:', message);
        process.exit(1);
    }
}

async function runTests() {
    console.log('--- Part 2: Injection Logic Tests ---\n');

    // Test 1 — Importance filter
    userMemoriesBatch = [
        { key: 'preferred_language', value: 'Rust', importance: 8, confidence: 1.0, updatedAt: now },
        { key: 'profession', value: 'engineer', importance: 6, confidence: 1.0, updatedAt: now }
    ];
    let res = await getInjectedUserMemory('user1');
    assert(res.includes('preferred_language'), "Test 1: Should contains importance 8");
    assert(!res.includes('profession'), "Test 1: Should filter importance 6");
    console.log('PASS: Test 1 — Importance filter');

    // Test 2 — Confidence filter
    userMemoriesBatch = [
        { key: 'preferred_language', value: 'Rust', importance: 9, confidence: 1.0, updatedAt: now },
        { key: 'current_goal', value: 'RAG app', importance: 8, confidence: 0.4, updatedAt: now }
    ];
    res = await getInjectedUserMemory('user1');
    assert(res.includes('preferred_language'), "Test 2: Should contains confidence 1.0");
    assert(!res.includes('current_goal'), "Test 2: Should filter confidence 0.4");
    console.log('PASS: Test 2 — Confidence filter');

    // Test 3 — Cap enforcement (max 5)
    userMemoriesBatch = Array.from({ length: 8 }, (_, i) => ({
        key: `key_${i}`, value: 'val', importance: 8, confidence: 1.0, updatedAt: now
    }));
    res = await getInjectedUserMemory('user1');
    const lineCount = (res.match(/- /g) || []).length;
    assert(lineCount === 5, `Test 3: Expected 5 lines, got ${lineCount}`);
    console.log('PASS: Test 3 — Cap enforcement (max 5)');

    // Test 4 — Token guard removes lowest-importance item first
    // Total chars: (4+150) + (4+150) + (4+150) = 462
    // 462 / 4 = 115.5. Not enough to trigger 300 token guard.
    // Need values of ~400 chars each.
    userMemoriesBatch = [
        { key: 'imp9', value: 'A'.repeat(400), importance: 9, confidence: 1.0, updatedAt: now },
        { key: 'imp8', value: 'B'.repeat(400), importance: 8, confidence: 1.0, updatedAt: now },
        { key: 'imp7', value: 'C'.repeat(450), importance: 7, confidence: 1.0, updatedAt: now }
    ];
    // Total chars: (4+400) + (4+400) + (4+450) = 404 + 404 + 454 = 1262
    // 1262 / 4 = 315.5 tokens (> 300)
    res = await getInjectedUserMemory('user1');
    assert(res.includes('imp9') && res.includes('imp8'), "Test 4: Should keep higher importance items");
    assert(!res.includes('imp7'), "Test 4: Should have shed importance 7");
    console.log('PASS: Test 4 — Token guard removes lowest-importance item first');

    // Test 5 — Empty result omits Slot 2
    userMemoriesBatch = [
        { key: 'preferred_language', value: 'Rust', importance: 5, confidence: 1.0, updatedAt: now }
    ];
    res = await getInjectedUserMemory('user1');
    assert(res === '', "Test 5: Should return empty string when filters fail");
    console.log('PASS: Test 5 — Empty result omits Slot 2');

    // Test 6 — Error safety
    userMemoryServiceMock.getUserMemories = async () => { throw new Error("DB Down"); };
    res = await getInjectedUserMemory('user1');
    assert(res === '', "Test 6: Should return empty string on error");
    console.log('PASS: Test 6 — Error safety');
    // Restoration
    userMemoryServiceMock.getUserMemories = async () => userMemoriesBatch;

    // Test 7 — Sort order (importance DESC, updatedAt DESC for ties)
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
    userMemoriesBatch = [
        { key: 'pref_lang', value: 'Rust', importance: 7, confidence: 1.0, updatedAt: threeDaysAgo },
        { key: 'profession', value: 'engineer', importance: 9, confidence: 1.0, updatedAt: oneDayAgo },
        { key: 'current_goal', value: 'RAG', importance: 7, confidence: 1.0, updatedAt: oneDayAgo }
    ];
    res = await getInjectedUserMemory('user1');
    const lines = res.split('\n').filter(l => l.startsWith('- '));
    assert(lines[0].includes('profession'), "Test 7: Highest importance first");
    assert(lines[1].includes('current_goal'), "Test 7: Recent tie-breaker second");
    assert(lines[2].includes('pref_lang'), "Test 7: Oldest item last");
    console.log('PASS: Test 7 — Sort order');

    // Test 8 — Format correctness
    userMemoriesBatch = [{ key: 'preferred_language', value: 'Rust', importance: 8, confidence: 1.0 }];
    res = await getInjectedUserMemory('user1');
    assert(res.startsWith('[User Memory]\n'), "Test 8: Header missing");
    assert(res.includes('- preferred_language: Rust'), "Test 8: Item format wrong");
    console.log('PASS: Test 8 — Format correctness');

    process.exit(0);
}

runTests().catch(err => {
    console.error('Test Execution Error:', err);
    process.exit(1);
});
