const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../../../app');
const User = require('../../../models/User');
const Message = require('../../../models/Message');
const MessageVersion = require('../../../models/MessageVersion');
const Conversation = require('../../../models/Conversation');
const { signAccessToken } = require('../../../utils/jwt');

let mongoServer;
let testUser;
let authToken;
let testConversation;
let testMessage;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    testUser = await User.create({
        email: 'retry@example.com',
        password: 'Password123!',
        name: 'Retry User',
        role: 'user'
    });

    authToken = `Bearer ${signAccessToken({ id: testUser._id.toString(), tokenVersion: testUser.tokenVersion })}`;

    otherUser = await User.create({
        email: 'other@example.com',
        name: 'Other User',
        tokenVersion: 0
    });
    otherUserToken = `Bearer ${signAccessToken({ id: otherUser._id.toString(), tokenVersion: otherUser.tokenVersion })}`;
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

beforeEach(async () => {
    await Message.deleteMany({});
    await MessageVersion.deleteMany({});
    await Conversation.deleteMany({});

    testConversation = await Conversation.create({
        userId: testUser._id,
        title: 'Retry Test'
    });

    // Original AI response (Version 1)
    testMessage = await Message.create({
        conversationId: testConversation._id,
        userId: testUser._id,
        role: 'assistant',
        text: 'Initial response.',
        version: 1,
        createdAt: new Date()
    });

    // Need a preceding user message for context
    await Message.create({
        conversationId: testConversation._id,
        userId: testUser._id,
        role: 'user',
        text: 'Hello assistant',
        createdAt: new Date(testMessage.createdAt.getTime() - 1000)
    });

    const v1 = await MessageVersion.create({
        messageId: testMessage._id,
        conversationId: testConversation._id,
        version: 1,
        content: 'Initial response.',
        isActive: true
    });

    testMessage.versions.push(v1._id);
    testMessage.currentVersionId = v1._id;
    await testMessage.save();
});

// Mock llmService
jest.mock('../../../services/llm.service', () => ({
    askConversationStream: jest.fn().mockImplementation(async () => {
        const stream = (async function* () {
            yield { choices: [{ delta: { content: 'Regenerated' } }] };
            yield { choices: [{ delta: { content: ' response.' } }] };
        })();
        return { stream, modelId: new (require('mongoose')).Types.ObjectId() };
    })
}));

describe('Retry Controller Integration Tests', () => {

    describe('POST /api/conversations/:cid/messages/:mid/retry', () => {
        const getUrl = (cid, mid) => `/api/conversations/${cid}/messages/${mid}/retry`;

        test('should trigger regeneration and create a new version', async () => {
            const res = await request(app)
                .post(getUrl(testConversation._id, testMessage._id))
                .set('Authorization', authToken);

            // SSE returns 200 and streams text
            expect(res.status).toBe(200);
            expect(res.headers['content-type']).toContain('text/event-stream');
            expect(res.text).toContain('Regenerated response.');

            // Verify a new version was added in DB
            const updatedMsg = await Message.findById(testMessage._id);
            expect(updatedMsg.versions).toHaveLength(2);
            expect(updatedMsg.isRetried).toBe(true);
            expect(updatedMsg.text).toBe('Regenerated response.');

            const v2 = await MessageVersion.findOne({ messageId: testMessage._id, version: 2 });
            expect(v2).not.toBeNull();
            expect(v2.content).toBe('Regenerated response.');
            expect(v2.isActive).toBe(true);
        });

        test('should return 403 if user does not own the conversation', async () => {
            const res = await request(app)
                .post(getUrl(testConversation._id, testMessage._id))
                .set('Authorization', otherUserToken);

            expect(res.status).toBe(403);
        });
    });

    describe('PATCH /api/messages/:messageId/version', () => {
        const getUrl = (id) => `/api/messages/${id}/version`;

        test('should switch the active version of a message', async () => {
            // Create a second version manually for testing switch
            const v2 = await MessageVersion.create({
                messageId: testMessage._id,
                conversationId: testConversation._id,
                version: 2,
                content: 'Second version.',
                isActive: false
            });
            testMessage.versions.push(v2._id);
            await testMessage.save();

            const res = await request(app)
                .patch(getUrl(testMessage._id))
                .set('Authorization', authToken)
                .send({
                    versionNumber: 2
                });

            expect(res.status).toBe(200);
            expect(res.body.message.version).toBe(2);
            expect(res.body.message.content).toBe('Second version.');

            // Verify in DB
            const updatedV2 = await MessageVersion.findById(v2._id);
            expect(updatedV2.isActive).toBe(true);

            const updatedV1 = await MessageVersion.findOne({ messageId: testMessage._id, version: 1 });
            expect(updatedV1.isActive).toBe(false);
        });

        test('should return 400 for invalid version number', async () => {
            // Passing a valid ObjectId but for a non-existent version should return 404
            const res = await request(app)
                .patch(getUrl(testMessage._id))
                .set('Authorization', authToken)
                .send({
                    versionNumber: 999
                });

            expect(res.status).toBe(404);
            expect(res.body.error).toMatch(/version not found/i);
        });
    });

    describe('retryController - empty message versioning', () => {

        it('should create Version 1 with empty content when original message text is empty', async () => {
            // SETUP:
            // - Create a Message document with text: "" and versions: []
            // - Ensure no MessageVersion documents exist for this messageId

            const emptyMsg = await Message.create({
                conversationId: testConversation._id,
                userId: testUser._id,
                role: 'assistant',
                text: '',
                versions: []
            });

            // ACTION:
            await request(app)
                .post(`/api/conversations/${testConversation._id}/messages/${emptyMsg._id}/retry`)
                .set('Authorization', authToken)
                .set('X-Request-Idempotency-Key', 'unique-key-1');

            // ASSERT:
            const v1 = await MessageVersion.findOne({ messageId: emptyMsg._id, version: 1 });
            expect(v1).not.toBeNull();
            expect(v1.content).toBe("");

            const updatedMsg = await Message.findById(emptyMsg._id);
            expect(updatedMsg.versions).toContainEqual(v1._id);
        });

        it('should create Version 2 with retry content after Version 1 empty snapshot', async () => {
            // SETUP:
            const emptyMsg = await Message.create({
                conversationId: testConversation._id,
                userId: testUser._id,
                role: 'assistant',
                text: '',
                versions: []
            });

            // ACTION:
            await request(app)
                .post(`/api/conversations/${testConversation._id}/messages/${emptyMsg._id}/retry`)
                .set('Authorization', authToken)
                .set('X-Request-Idempotency-Key', 'unique-key-2');

            // ASSERT:
            const v2 = await MessageVersion.findOne({ messageId: emptyMsg._id, version: 2 });
            expect(v2).not.toBeNull();
            expect(v2.content).toBe("Regenerated response.");

            const updatedMsg = await Message.findById(emptyMsg._id);
            expect(updatedMsg.versions).toHaveLength(2);
            expect(updatedMsg.currentVersionId.toString()).toBe(v2._id.toString());
        });

        it('should return 200 when switching to version 1 (empty)', async () => {
            const emptyMsg = await Message.create({
                conversationId: testConversation._id,
                userId: testUser._id,
                role: 'assistant',
                text: '',
                versions: []
            });

            // Create versions
            await request(app)
                .post(`/api/conversations/${testConversation._id}/messages/${emptyMsg._id}/retry`)
                .set('Authorization', authToken)
                .set('X-Request-Idempotency-Key', 'unique-key-3');

            // ACTION:
            const res = await request(app)
                .patch(`/api/messages/${emptyMsg._id}/version`)
                .set('Authorization', authToken)
                .send({ versionNumber: 1 });

            // ASSERT:
            expect(res.status).toBe(200);
            expect(res.body.message.content).toBe("");

            const updatedMsg = await Message.findById(emptyMsg._id);
            const v1 = await MessageVersion.findOne({ messageId: emptyMsg._id, version: 1 });
            expect(updatedMsg.currentVersionId.toString()).toBe(v1._id.toString());
        });

        it('should return 200 when switching back to version 2 (retry)', async () => {
            const emptyMsg = await Message.create({
                conversationId: testConversation._id,
                userId: testUser._id,
                role: 'assistant',
                text: '',
                versions: []
            });

            await request(app)
                .post(`/api/conversations/${testConversation._id}/messages/${emptyMsg._id}/retry`)
                .set('Authorization', authToken)
                .set('X-Request-Idempotency-Key', 'unique-key-4');

            // Switch to V1
            await request(app)
                .patch(`/api/messages/${emptyMsg._id}/version`)
                .set('Authorization', authToken)
                .send({ versionNumber: 1 });

            // ACTION:
            const res = await request(app)
                .patch(`/api/messages/${emptyMsg._id}/version`)
                .set('Authorization', authToken)
                .send({ versionNumber: 2 });

            // ASSERT:
            expect(res.status).toBe(200); // FIXES THE BUG
            expect(res.body.message.content).toBe("Regenerated response.");
        });

        it('should not affect version switching for non-empty messages', async () => {
            // Regression test: switching works for normal messages
            const res = await request(app)
                .post(`/api/conversations/${testConversation._id}/messages/${testMessage._id}/retry`)
                .set('Authorization', authToken)
                .set('X-Request-Idempotency-Key', 'unique-key-5');

            const switch1 = await request(app)
                .patch(`/api/messages/${testMessage._id}/version`)
                .set('Authorization', authToken)
                .send({ versionNumber: 1 });
            expect(switch1.status).toBe(200);
            expect(switch1.body.message.content).toBe("Initial response.");

            const switch2 = await request(app)
                .patch(`/api/messages/${testMessage._id}/version`)
                .set('Authorization', authToken)
                .send({ versionNumber: 2 });
            expect(switch2.status).toBe(200);
            expect(switch2.body.message.content).toBe("Regenerated response.");
        });
    });
});
