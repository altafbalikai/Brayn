require('dotenv').config();
const axios = require('axios');
const mongoose = require('mongoose');
const { signAccessToken } = require('../../utils/jwt');
const User = require('../../models/User');
const UserMemory = require('../../models/UserMemory');
const UserMemoryAuditLog = require('../../models/UserMemoryAuditLog');

const BASE_URL = 'http://127.0.0.1:4000';
const TEST_USER_ID = new mongoose.Types.ObjectId("65d5f1e9c9a2a7b3c4d5e6f7");

// Generate a real token using the existing utility and .env secret
// Note: We need to sign with the fields expected by auth.middleware (id, email, role)
const TEST_TOKEN = signAccessToken({
    id: TEST_USER_ID.toString(),
    email: 'test@example.com',
    role: 'user'
});
const AUTH_HEADER = { Authorization: 'Bearer ' + TEST_TOKEN };

function assert(condition, message) {
    if (!condition) {
        console.log('FAIL:', message);
        process.exit(1);
    }
}

async function runTests() {
    console.log('--- Part 3: Governance API Tests ---\n');

    // Connect to DB for seeding and verification
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB for seeding\n');

    try {
        // Health check
        const health = await axios.get(`${BASE_URL}/api/health`);
        console.log('Server health:', health.data);

        // Seed test user
        await User.findOneAndUpdate(
            { _id: TEST_USER_ID },
            { email: 'test@example.com', name: 'Test User', role: 'user', tokenVersion: 0 },
            { upsert: true, new: true }
        );
        console.log('  Seeded test user');

        // Cleanup test user data
        await UserMemory.deleteMany({ userId: TEST_USER_ID });
        await UserMemoryAuditLog.deleteMany({ userId: TEST_USER_ID });

        // Test 9 — GET /api/user/memory
        let res = await axios.get(`${BASE_URL}/api/user/memory`, { headers: AUTH_HEADER });
        assert(res.status === 200, "Test 9: Status should be 200");
        assert(Array.isArray(res.data.memories), "Test 9: memories should be an array");
        console.log('PASS: Test 9 — GET /api/user/memory');

        // Test 10 — DELETE /api/user/memory/:key (NOT_FOUND case)
        try {
            await axios.delete(`${BASE_URL}/api/user/memory/nonexistent_key_xyz`, { headers: AUTH_HEADER });
            assert(false, "Test 10: Should have failed with 404");
        } catch (err) {
            assert(err.response.status === 404, `Test 10: Expected 404, got ${err.response.status}`);
            assert(err.response.data.error === 'Memory key not found', "Test 10: Error message mismatch");
        }
        console.log('PASS: Test 10 — DELETE /api/user/memory/:key (NOT_FOUND)');

        // Test 11 — Full write → read → delete → audit cycle
        // Step A: Seed
        await UserMemory.create({
            userId: TEST_USER_ID,
            key: 'preferred_language',
            value: 'Rust',
            category: 'preference',
            importance: 8,
            confidence: 1.0,
            sourceConversationId: new mongoose.Types.ObjectId()
        });
        console.log('  Step A: Seeded memory');

        // Step B: GET /api/user/memory
        res = await axios.get(`${BASE_URL}/api/user/memory`, { headers: AUTH_HEADER });
        const hasMemory = res.data.memories.some(m => m.key === 'preferred_language' && m.value === 'Rust');
        assert(hasMemory, "Test 11 Step B: Seeded memory not found in response");
        console.log('  Step B: GET /api/user/memory confirmed seed');

        // Step C: DELETE
        res = await axios.delete(`${BASE_URL}/api/user/memory/preferred_language`, { headers: AUTH_HEADER });
        assert(res.status === 200, "Test 11 Step C: Delete status not 200");
        assert(res.data.deleted === true && res.data.key === 'preferred_language', "Test 11 Step C: Delete response mismatch");
        console.log('  Step C: DELETE /api/user/memory/preferred_language success');

        // Step D: Verify deletion
        res = await axios.get(`${BASE_URL}/api/user/memory`, { headers: AUTH_HEADER });
        const stillExists = res.data.memories.some(m => m.key === 'preferred_language');
        assert(!stillExists, "Test 11 Step D: Memory still exists after deletion");
        console.log('  Step D: GET /api/user/memory confirmed deletion');

        // Step E: Audit check
        res = await axios.get(`${BASE_URL}/api/user/memory/audit`, { headers: AUTH_HEADER });
        assert(res.status === 200, "Test 11 Step E: Audit status not 200");
        const deleteLog = res.data.log.find(l => l.action === 'DELETE' && l.key === 'preferred_language');
        assert(deleteLog, "Test 11 Step E: DELETE audit log not found");
        assert(deleteLog.previousValue === 'Rust' && deleteLog.newValue === null, "Test 11 Step E: Audit values mismatch");
        console.log('  Step E: Audit log verified');
        console.log('PASS: Test 11 — Full cycle');

        // Test 12 — DELETE /api/user/memory (wipe)
        await UserMemory.create([
            { userId: TEST_USER_ID, key: 'k1', value: 'v1', category: 'preference', sourceConversationId: new mongoose.Types.ObjectId() },
            { userId: TEST_USER_ID, key: 'k2', value: 'v2', category: 'preference', sourceConversationId: new mongoose.Types.ObjectId() },
            { userId: TEST_USER_ID, key: 'k3', value: 'v3', category: 'preference', sourceConversationId: new mongoose.Types.ObjectId() }
        ]);
        res = await axios.delete(`${BASE_URL}/api/user/memory`, { headers: AUTH_HEADER });
        assert(res.data.wiped === true && res.data.count === 3, `Test 12: Wipe response mismatch, count=${res.data.count}`);
        res = await axios.get(`${BASE_URL}/api/user/memory`, { headers: AUTH_HEADER });
        assert(res.data.memories.length === 0, "Test 12: Memories still exist after wipe");
        console.log('PASS: Test 12 — DELETE /api/user/memory (wipe)');

        // Test 13 — GET /api/user/memory/audit limit and sort
        await UserMemoryAuditLog.deleteMany({ userId: TEST_USER_ID });
        const auditEntries = Array.from({ length: 110 }, (_, i) => ({
            userId: TEST_USER_ID,
            action: 'WRITE',
            key: `key_${i}`,
            timestamp: new Date(Date.now() + i * 1000) // incrementally more recent
        }));
        await UserMemoryAuditLog.insertMany(auditEntries);
        res = await axios.get(`${BASE_URL}/api/user/memory/audit`, { headers: AUTH_HEADER });
        assert(res.data.log.length === 100, `Test 13: Expected 100 entries, got ${res.data.log.length}`);
        const first = new Date(res.data.log[0].timestamp);
        const last = new Date(res.data.log[99].timestamp);
        assert(first > last, "Test 13: Not sorted DESC by timestamp");
        console.log('PASS: Test 13 — GET /api/user/memory/audit limit and sort');

    } finally {
        await mongoose.connection.close();
    }

    process.exit(0);
}

runTests().catch(err => {
    if (err.response) {
        console.error('Test Execution Error (Response):', err.response.status, err.response.data);
    } else {
        console.error('Test Execution Error (General):', err.message);
        console.error(err.stack);
    }
    process.exit(1);
});
