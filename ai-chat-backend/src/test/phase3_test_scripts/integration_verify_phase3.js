const mongoose = require('mongoose');
const UserMemory = require('./src/models/UserMemory');
const UserMemoryAuditLog = require('./src/models/UserMemoryAuditLog');
const { extractMemoryCandidate, HEDGING_WORDS } = require('./src/utils/memoryExtraction.utils');
const { classifyMemory, KEY_TAXONOMY } = require('./src/utils/memoryClassification.utils');

async function runLiveTests() {
    console.log('--- Phase 3 Comprehensive Integration Test ---\n');

    try {
        await mongoose.connect('mongodb://127.0.0.1:27017/ai-chat-test');
        console.log('✅ Connected to MongoDB');

        // Clean test DB
        await UserMemory.deleteMany({});
        await UserMemoryAuditLog.deleteMany({});

        // 1. Unique index enforcement
        const userId = new mongoose.Types.ObjectId();
        await UserMemory.create({
            userId, key: 'profession', value: 'Engineer', category: 'trait', sourceConversationId: new mongoose.Types.ObjectId()
        });

        try {
            await UserMemory.create({
                userId, key: 'profession', value: 'Doctor', category: 'trait', sourceConversationId: new mongoose.Types.ObjectId()
            });
            console.log('❌ FAIL: Duplicate (userId, key) should have thrown');
        } catch (err) {
            if (err.code === 11000) console.log('✅ PASS: Unique index enforced');
            else console.log('❌ FAIL: Wrong error code for duplicate:', err.code);
        }

        // 2. Immutability & UpdatedAt
        const mem = await UserMemory.findOne({ userId });
        const originalCreatedAt = mem.createdAt;
        const originalUpdatedAt = mem.updatedAt;

        await new Promise(r => setTimeout(r, 100));
        mem.value = 'Senior Engineer';
        await mem.save();

        const updated = await UserMemory.findOne({ userId });
        if (updated.createdAt.getTime() === originalCreatedAt.getTime() && updated.updatedAt.getTime() > originalUpdatedAt.getTime()) {
            console.log('✅ PASS: Immutability & UpdatedAt logic verified');
        } else {
            console.log('❌ FAIL: Timestamp logic failed', { created: updated.createdAt, updated: updated.updatedAt });
        }

        // 3. Audit Log nullification
        const log = await UserMemoryAuditLog.create({
            userId,
            action: 'DELETE',
            newValue: 'hacker'
        });
        if (log.newValue === null) {
            console.log('✅ PASS: Audit Log newValue nullified on DELETE');
        } else {
            console.log('❌ FAIL: Audit Log newValue NOT nullified');
        }

        // 4. Extraction & Classification Logic (Pure Function Tests)
        const tests = [
            { text: "My preference is Rust", role: "user", expectedKey: "preferred_language", expectedValue: "Rust" },
            { text: "I work as a developer", role: "user", expectedKey: "profession", expectedValue: "Developer" },
            { text: "My goal is maybe Java", role: "user", expectedKey: null }, // Hedging
            { text: "I am a bit busy", role: "user", expectedKey: null }, // Hedging
            { text: "I'm a senior dev!", role: "user", expectedKey: "profession", expectedValue: "Senior dev" },
            { text: "I mainly use VS Code", role: "user", expectedKey: "preferred_editor", expectedValue: "Vs code" }
        ];

        tests.forEach((t, i) => {
            const cand = extractMemoryCandidate(t.text, t.role);
            if (!t.expectedKey) {
                if (!cand || !classifyMemory(cand).key) console.log(`✅ PASS: Logic test ${i + 1} (Correct rejection)`);
                else console.log(`❌ FAIL: Logic test ${i + 1} (Should have rejected)`);
            } else {
                const res = classifyMemory(cand);
                if (res.key === t.expectedKey && res.value === t.expectedValue) console.log(`✅ PASS: Logic test ${i + 1} (Correct mapping)`);
                else console.log(`❌ FAIL: Logic test ${i + 1} (Mapping mismatch)`, res);
            }
        });

    } catch (err) {
        console.error('ERROR during integration tests:', err);
    } finally {
        await mongoose.disconnect();
        console.log('\n--- Integration Tests Finished ---');
    }
}

runLiveTests();
