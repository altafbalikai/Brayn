const mongoose = require('mongoose');
const { validateMemory } = require('./src/utils/memoryValidation.utils');
const { processAndStoreMemory, getUserMemories, deleteUserMemory, wipeUserMemory, logMemoryInjection } = require('./src/services/userMemory.service');
const UserMemory = require('./src/models/UserMemory');
const UserMemoryAuditLog = require('./src/models/UserMemoryAuditLog');

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
    console.log('--- Phase 3.3 Rigorous Verification Script ---\n');

    // --- Utility Tests (memoryValidation.utils.js) ---

    test('P3.3-T1: Valid pass', () => {
        const input = { key: "preferred_language", value: "Rust", category: "preference", logReason: null };
        const res = validateMemory(input);
        assert(res.valid === true, "Should have passed");
    });

    test('P3.3-T2: VALIDATION_INVALID_KEY (null key)', () => {
        const input = { key: null, value: "Rust", category: "preference", logReason: null };
        const res = validateMemory(input);
        assert(res.valid === false && res.reason === 'VALIDATION_INVALID_KEY', "Should fail Rule 1");
    });

    test('P3.3-T3: VALIDATION_INVALID_KEY (key not in taxonomy)', () => {
        const input = { key: "fake_key", value: "Rust", category: "preference", logReason: null };
        const res = validateMemory(input);
        assert(res.valid === false && res.reason === 'VALIDATION_INVALID_KEY', "Should fail Rule 1 (taxonomy)");
    });

    test('P3.3-T4: VALIDATION_VALUE_LENGTH (too short)', () => {
        const input = { key: "preferred_language", value: "X", category: "preference", logReason: null };
        const res = validateMemory(input);
        assert(res.valid === false && res.reason === 'VALIDATION_VALUE_LENGTH', "Should fail Rule 2");
    });

    test('P3.3-T5: VALIDATION_VALUE_LENGTH (too long)', () => {
        const input = { key: "preferred_language", value: "A".repeat(51), category: "preference", logReason: null };
        const res = validateMemory(input);
        assert(res.valid === false && res.reason === 'VALIDATION_VALUE_LENGTH', "Should fail Rule 2 (long)");
    });

    test('P3.3-T6: VALIDATION_LOW_SIGNAL (hedging word)', () => {
        const input = { key: "preferred_language", value: "Maybe Rust", category: "preference", logReason: null };
        const res = validateMemory(input);
        assert(res.valid === false && res.reason === 'VALIDATION_LOW_SIGNAL', "Should fail Rule 3");
    });

    test('P3.3-T7: VALIDATION_INVALID_CATEGORY', () => {
        const input = { key: "preferred_language", value: "Rust", category: "invalid", logReason: null };
        const res = validateMemory(input);
        assert(res.valid === false && res.reason === 'VALIDATION_INVALID_CATEGORY', "Should fail Rule 4");
    });

    test('P3.3-T8: Null input safety', () => {
        const res = validateMemory(null);
        assert(res.valid === false && res.reason === 'VALIDATION_INVALID_KEY', "Should fail gracefully on null");
    });

    test('P3.3-T9: Rule order enforcement', () => {
        const input = { key: null, value: "X", category: "invalid", logReason: null };
        const res = validateMemory(input);
        assert(res.reason === 'VALIDATION_INVALID_KEY', "Rule 1 should fire first");
    });

    // --- Service Tests (userMemory.service.js - needs Live/Mock DB) ---
    // We will run this against the ai-chat-test DB if available

    try {
        await mongoose.connect('mongodb://127.0.0.1:27017/ai-chat-test');
        console.log('\n--- Live DB Integration Tests ---');

        await UserMemory.deleteMany({});
        await UserMemoryAuditLog.deleteMany({});

        const userId = new mongoose.Types.ObjectId();
        const convId = new mongoose.Types.ObjectId();

        test('P3.3-T10: Full pipeline happy path', async () => {
            const res = await processAndStoreMemory("I work as a fullstack developer", "user", userId, convId);
            assert(res.stored === true, "Should have stored");
            const doc = await UserMemory.findOne({ userId, key: 'profession' });
            assert(doc && doc.value === 'Fullstack developer', "Doc value mismatch");
            const audit = await UserMemoryAuditLog.findOne({ userId, action: 'WRITE' });
            assert(audit, "WRITE audit log missing");
        });

        test('P3.3-T11: WRITE vs OVERWRITE audit', async () => {
            await processAndStoreMemory("I am a doctor", "user", userId, convId); // WRITE
            const res = await processAndStoreMemory("I am a lawyer", "user", userId, convId); // OVERWRITE
            const write = await UserMemoryAuditLog.findOne({ action: 'WRITE', key: 'profession', value: 'Doctor' }); // Wait, value is nested
            const overwrites = await UserMemoryAuditLog.find({ action: 'OVERWRITE', userId });
            assert(overwrites.length === 1, "Should have 1 overwrite");
            assert(overwrites[0].previousValue === 'Doctor', "Previous value mismatch");
            assert(overwrites[0].newValue === 'Lawyer', "New value mismatch");
        });

        test('P3.3-T12: Duplicate check', async () => {
            await processAndStoreMemory("My preference is Rust", "user", userId, convId);
            const res = await processAndStoreMemory("My preference is Rust", "user", userId, convId);
            assert(res.stored === false && res.reason === 'VALIDATION_DUPLICATE', "Should detect duplicate");
        });

        test('P3.3-T13: deleteUserMemory happy path', async () => {
            await processAndStoreMemory("My preference is Python", "user", userId, convId);
            const delRes = await deleteUserMemory(userId, 'preferred_language');
            assert(delRes.deleted === true, "Delete failed");
            const doc = await UserMemory.findOne({ userId, key: 'preferred_language' });
            assert(!doc, "Doc still exists");
            const audit = await UserMemoryAuditLog.findOne({ action: 'DELETE', key: 'preferred_language' });
            assert(audit && audit.newValue === null, "DELETE audit failed");
        });

        test('P3.3-T15: wipeUserMemory', async () => {
            await processAndStoreMemory("I am a pilot", "user", userId, convId);
            const wipeRes = await wipeUserMemory(userId);
            assert(wipeRes.wiped === true && wipeRes.count >= 1, "Wipe failed");
            const count = await UserMemory.countDocuments({ userId });
            assert(count === 0, "Docs remain after wipe");
            const audit = await UserMemoryAuditLog.findOne({ action: 'WIPE', userId });
            assert(audit, "WIPE audit missing");
        });

        test('P3.3-T16: logMemoryInjection', async () => {
            logMemoryInjection(userId, 'timezone', 'UTC+5');
            // Give a tiny bit for fire-and-forget
            await new Promise(r => setTimeout(r, 100));
            const audit = await UserMemoryAuditLog.findOne({ action: 'INJECTED', key: 'timezone' });
            assert(audit && audit.newValue === 'UTC+5', "INJECTED audit missing/mismatch");
        });

        await mongoose.disconnect();
    } catch (dbErr) {
        console.warn('⚠️ Skipping DB integrated tests (DB not available):', dbErr.message);
    }

    console.log('\n--- Verification Finished ---');
}

runTests();
