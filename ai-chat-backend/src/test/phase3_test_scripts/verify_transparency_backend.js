require('dotenv').config();
const mongoose = require('mongoose');
const UserMemory = require('../../models/UserMemory');
const UserMemoryAuditLog = require('../../models/UserMemoryAuditLog');
const { toggleUserMemory, editUserMemory, getUserMemories } = require('../../services/userMemory.service');
const { getInjectedUserMemory } = require('../../services/gemini.service');

const TEST_USER_ID = new mongoose.Types.ObjectId("65d5f1e9c9a2a7b3c4d5e6f7");
const TEST_CONV_ID = new mongoose.Types.ObjectId("65d5f1e9c9a2a7b3c4d5e6f8");

async function runTests() {
    console.log('--- Phase 3.5 Extension: Backend Verification ---\n');

    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // Cleanup
        await UserMemory.deleteMany({ userId: TEST_USER_ID });
        await UserMemoryAuditLog.deleteMany({ userId: TEST_USER_ID });

        // -- Test 1 & 2: toggleUserMemory (OFF then ON) --
        console.log('\nTesting toggleUserMemory...');
        await UserMemory.create({
            userId: TEST_USER_ID,
            key: 'preferred_language',
            value: 'Rust',
            category: 'preference',
            importance: 8,
            confidence: 1.0,
            sourceConversationId: TEST_CONV_ID,
            enabled: true
        });

        const toggleOff = await toggleUserMemory(TEST_USER_ID, 'preferred_language', false);
        const docOff = await UserMemory.findOne({ userId: TEST_USER_ID, key: 'preferred_language' });
        const auditOff = await UserMemoryAuditLog.findOne({ userId: TEST_USER_ID, action: 'DISABLED' });

        if (toggleOff.toggled === true && docOff.enabled === false && auditOff && auditOff.previousValue === 'true' && auditOff.newValue === 'false') {
            console.log('✅ PASS: Test 1 (Toggle OFF)');
        } else {
            console.log('❌ FAIL: Test 1 (Toggle OFF)', { toggleOff, docOff, auditOff });
        }

        const toggleOn = await toggleUserMemory(TEST_USER_ID, 'preferred_language', true);
        const docOn = await UserMemory.findOne({ userId: TEST_USER_ID, key: 'preferred_language' });
        const auditOn = await UserMemoryAuditLog.findOne({ userId: TEST_USER_ID, action: 'ENABLED' });

        if (toggleOn.toggled === true && docOn.enabled === true && auditOn && auditOn.previousValue === 'false' && auditOn.newValue === 'true') {
            console.log('✅ PASS: Test 2 (Toggle ON)');
        } else {
            console.log('❌ FAIL: Test 2 (Toggle ON)');
        }

        // -- Test 3: toggleUserMemory NOT_FOUND --
        const toggleNF = await toggleUserMemory(TEST_USER_ID, 'nonexistent', false);
        if (toggleNF.toggled === false && toggleNF.reason === 'NOT_FOUND') {
            console.log('✅ PASS: Test 3 (Toggle NOT_FOUND)');
        } else {
            console.log('❌ FAIL: Test 3 (Toggle NOT_FOUND)');
        }

        // -- Test 4: editUserMemory happy path --
        console.log('\nTesting editUserMemory...');
        await UserMemory.create({
            userId: TEST_USER_ID,
            key: 'profession',
            value: 'engineer',
            category: 'trait',
            sourceConversationId: TEST_CONV_ID
        });

        const editRes = await editUserMemory(TEST_USER_ID, 'profession', 'senior engineer');
        const docEdit = await UserMemory.findOne({ userId: TEST_USER_ID, key: 'profession' });
        const auditEdit = await UserMemoryAuditLog.findOne({ userId: TEST_USER_ID, action: 'OVERWRITE', key: 'profession', newValue: 'senior engineer' });

        if (editRes.edited === true && docEdit.value === 'senior engineer' && auditEdit && auditEdit.previousValue === 'engineer') {
            console.log('✅ PASS: Test 4 (Edit happy path)');
        } else {
            console.log('❌ FAIL: Test 4 (Edit happy path)');
        }

        // -- Test 5 & 6: editUserMemory validation --
        const editShort = await editUserMemory(TEST_USER_ID, 'profession', 'X');
        const editLong = await editUserMemory(TEST_USER_ID, 'profession', 'A'.repeat(51));
        if (editShort.reason === 'VALIDATION_VALUE_LENGTH' && editLong.reason === 'VALIDATION_VALUE_LENGTH') {
            console.log('✅ PASS: Test 5 & 6 (Edit validation)');
        } else {
            console.log('❌ FAIL: Test 5 & 6 (Edit validation)');
        }

        // -- Test 7: editUserMemory NOT_FOUND --
        const editNF = await editUserMemory(TEST_USER_ID, 'nonexistent', 'valid value');
        if (editNF.edited === false && editNF.reason === 'NOT_FOUND') {
            console.log('✅ PASS: Test 7 (Edit NOT_FOUND)');
        } else {
            console.log('❌ FAIL: Test 7 (Edit NOT_FOUND)');
        }

        // -- Test 8: Disabled memory excluded from injection --
        console.log('\nTesting prompt injection filtering...');
        await UserMemory.deleteMany({ userId: TEST_USER_ID });
        await UserMemory.insertMany([
            {
                userId: TEST_USER_ID,
                key: 'preferred_language',
                value: 'Rust',
                importance: 9,
                confidence: 1.0,
                enabled: true,
                category: 'preference',
                sourceConversationId: TEST_CONV_ID
            },
            {
                userId: TEST_USER_ID,
                key: 'profession',
                value: 'engineer',
                importance: 8,
                confidence: 1.0,
                enabled: false,
                category: 'trait',
                sourceConversationId: TEST_CONV_ID
            }
        ]);

        const injected = await getInjectedUserMemory(TEST_USER_ID.toString());
        if (injected.includes('preferred_language: Rust') && !injected.includes('profession') && !injected.includes('engineer')) {
            console.log('✅ PASS: Test 8 (Injection filter)');
        } else {
            console.log('❌ FAIL: Test 8 (Injection filter)', { injected });
        }

        // -- Test 9: Disabled memory visible in getUserMemories (used by GET /api/user/memory) --
        const all = await getUserMemories(TEST_USER_ID);
        if (all.length === 2 && all.some(m => m.enabled === false) && all.some(m => m.enabled === true)) {
            console.log('✅ PASS: Test 9 (Governance API visibility)');
        } else {
            console.log('❌ FAIL: Test 9 (Governance API visibility)');
        }

        // -- Test 12: updatedAt advances --
        console.log('\nTesting updatedAt advances...');
        const mem = await UserMemory.findOne({ userId: TEST_USER_ID, key: 'preferred_language' });
        const oldUpdated = mem.updatedAt;
        await new Promise(r => setTimeout(r, 100));
        await toggleUserMemory(TEST_USER_ID, 'preferred_language', false);
        const memNew = await UserMemory.findOne({ userId: TEST_USER_ID, key: 'preferred_language' });
        if (memNew.updatedAt.getTime() > oldUpdated.getTime()) {
            console.log('✅ PASS: Test 12 (updatedAt advanced)');
        } else {
            console.log('❌ FAIL: Test 12 (updatedAt did not advance)');
        }

    } catch (err) {
        console.error('ERROR during verification:', err);
    } finally {
        await mongoose.disconnect();
        console.log('\n--- Verification Finished ---');
    }
}

runTests();
