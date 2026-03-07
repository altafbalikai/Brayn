const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../../app');
const User = require('../../models/User');
const Conversation = require('../../models/Conversation');
const Message = require('../../models/Message');
const ConversationSummary = require('../../models/ConversationSummary');
const { signAccessToken } = require('../../utils/jwt');

let mongoServer;
let testUser1, testUser2;
let token1, token2;
let originalConv;
let messageIds = [];

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    testUser1 = await User.create({
        email: 'user1@example.com',
        password: 'Password123!',
        name: 'User One',
        role: 'user'
    });
    token1 = signAccessToken({ id: testUser1._id.toString(), tokenVersion: testUser1.tokenVersion });

    testUser2 = await User.create({
        email: 'user2@example.com',
        password: 'Password123!',
        name: 'User Two',
        role: 'user'
    });
    token2 = signAccessToken({ id: testUser2._id.toString(), tokenVersion: testUser2.tokenVersion });
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

beforeEach(async () => {
    await Conversation.deleteMany({});
    await Message.deleteMany({});
    await ConversationSummary.deleteMany({});
    messageIds = [];

    originalConv = await Conversation.create({
        userId: testUser1._id,
        title: 'Original Title',
        selectedModelId: new mongoose.Types.ObjectId(),
        messageCount: 4
    });

    for (let i = 0; i < 4; i++) {
        const msg = await Message.create({
            conversationId: originalConv._id,
            userId: testUser1._id,
            role: i % 2 === 0 ? 'user' : 'assistant',
            text: `Message ${i + 1}`
        });
        messageIds.push(msg._id.toString());
    }
});

describe('POST /api/llm/conversations/:cid/branch', () => {

    it('returns 401 when no auth token provided', async () => {
        const res = await request(app)
            .post(`/api/llm/conversations/${originalConv._id}/branch`)
            .send({ editedMessageId: messageIds[0], newContent: 'updated' });
        expect(res.status).toBe(401);
    });

    it('returns 403 when conversation belongs to different user', async () => {
        const res = await request(app)
            .post(`/api/llm/conversations/${originalConv._id}/branch`)
            .set('Authorization', `Bearer ${token2}`)
            .send({ editedMessageId: messageIds[0], newContent: 'updated' });
        expect(res.status).toBe(403);
    });

    it('returns 404 when editedMessageId does not belong to this conversation', async () => {
        const otherConv = await Conversation.create({ userId: testUser1._id, title: 'Other' });
        const otherMsg = await Message.create({
            conversationId: otherConv._id,
            userId: testUser1._id,
            role: 'user',
            text: 'Other'
        });

        const res = await request(app)
            .post(`/api/llm/conversations/${originalConv._id}/branch`)
            .set('Authorization', `Bearer ${token1}`)
            .send({ editedMessageId: otherMsg._id.toString(), newContent: 'updated' });

        expect(res.status).toBe(404);
        expect(res.body.error).toContain('Source message not found');
    });

    it('returns 400 when editedMessageId is not a valid ObjectId', async () => {
        const res = await request(app)
            .post(`/api/llm/conversations/${originalConv._id}/branch`)
            .set('Authorization', `Bearer ${token1}`)
            .send({ editedMessageId: 'not-an-id', newContent: 'hello' });
        expect(res.status).toBe(400);
    });

    it('returns 400 when newContent is empty string', async () => {
        const res = await request(app)
            .post(`/api/llm/conversations/${originalConv._id}/branch`)
            .set('Authorization', `Bearer ${token1}`)
            .send({ editedMessageId: messageIds[0], newContent: '' });
        expect(res.status).toBe(400);
    });

    it('returns 400 when newContent exceeds 10000 characters', async () => {
        const res = await request(app)
            .post(`/api/llm/conversations/${originalConv._id}/branch`)
            .set('Authorization', `Bearer ${token1}`)
            .send({ editedMessageId: messageIds[0], newContent: 'a'.repeat(10001) });
        expect(res.status).toBe(400);
    });

    it('creates a new branch Conversation with correct pointer fields', async () => {
        const res = await request(app)
            .post(`/api/llm/conversations/${originalConv._id}/branch`)
            .set('Authorization', `Bearer ${token1}`)
            .send({ editedMessageId: messageIds[1], newContent: 'edited text' });

        expect(res.status).toBe(201);
        const { newConversationId } = res.body;

        const newConv = await Conversation.findById(newConversationId);
        expect(newConv.parentConversationId.toString()).toBe(originalConv._id.toString());
        expect(newConv.branchedFromMessageId.toString()).toBe(messageIds[0]);
        expect(newConv.editedMessageId.toString()).toBe(messageIds[1]);
        expect(newConv.messageCount).toBe(0);
        expect(newConv.selectedModelId.toString()).toBe(originalConv.selectedModelId.toString());
        expect(newConv.userId.toString()).toBe(testUser1._id.toString());
    });

    it('does not create any message in branch conversation', async () => {
        const res = await request(app)
            .post(`/api/llm/conversations/${originalConv._id}/branch`)
            .set('Authorization', `Bearer ${token1}`)
            .send({ editedMessageId: messageIds[0], newContent: 'edited text' });

        expect(res.status).toBe(201);
        const { newConversationId } = res.body;

        const msgs = await Message.find({ conversationId: newConversationId });
        expect(msgs.length).toBe(0);
    });

    it('copies ConversationSummary from parent to branch with validUpToMessageId', async () => {
        await ConversationSummary.create({
            conversationId: originalConv._id,
            summaryText: 'Parent summary',
            version: 1,
            messageRangeStart: messageIds[0],
            messageRangeEnd: messageIds[3]
        });

        const res = await request(app)
            .post(`/api/llm/conversations/${originalConv._id}/branch`)
            .set('Authorization', `Bearer ${token1}`)
            .send({ editedMessageId: messageIds[2], newContent: 'Edit M3' });

        expect(res.status).toBe(201);
        const { newConversationId } = res.body;

        const summary = await ConversationSummary.findOne({ conversationId: newConversationId });
        expect(summary).not.toBeNull();
        expect(summary.summaryText).toBe('Parent summary');
        expect(summary.validUpToMessageId.toString()).toBe(messageIds[1]);
    });

    it('does NOT copy summary if parent has no ConversationSummary', async () => {
        const res = await request(app)
            .post(`/api/llm/conversations/${originalConv._id}/branch`)
            .set('Authorization', `Bearer ${token1}`)
            .send({ editedMessageId: messageIds[1], newContent: 'edited' });

        const { newConversationId } = res.body;
        const summary = await ConversationSummary.findOne({ conversationId: newConversationId });
        expect(summary).toBeNull();
    });

    it('returns full conversation object in response', async () => {
        const res = await request(app)
            .post(`/api/llm/conversations/${originalConv._id}/branch`)
            .set('Authorization', `Bearer ${token1}`)
            .send({ editedMessageId: messageIds[1], newContent: 'hello' });

        expect(res.body.newConversationId).toBeDefined();
        const convResult = res.body.conversation;
        expect(convResult._id).toBe(res.body.newConversationId);
        expect(convResult.parentConversationId).toBe(originalConv._id.toString());
        expect(convResult.editedMessageId).toBe(messageIds[1]);
        expect(typeof convResult._id).toBe('string');
        expect(typeof convResult.parentConversationId).toBe('string');
    });

    it('does not modify the original conversation or its messages', async () => {
        await request(app)
            .post(`/api/llm/conversations/${originalConv._id}/branch`)
            .set('Authorization', `Bearer ${token1}`)
            .send({ editedMessageId: messageIds[1], newContent: 'edited text' });

        const refetchedConv = await Conversation.findById(originalConv._id);
        expect(refetchedConv.messageCount).toBe(4);

        const msgs = await Message.find({ conversationId: originalConv._id });
        expect(msgs.length).toBe(4);
    });

});
