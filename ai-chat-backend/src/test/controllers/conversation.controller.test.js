const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../../app');
const User = require('../../models/User');
const Conversation = require('../../models/Conversation');
const Message = require('../../models/Message');
const { signAccessToken } = require('../../utils/jwt');

let mongoServer;
let testUser1, testUser2;
let token1, token2;
let originalConv;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    testUser1 = await User.create({ email: 'user1@example.com', password: 'Password123!', name: 'U1', role: 'user' });
    token1 = signAccessToken({ id: testUser1._id.toString(), tokenVersion: testUser1.tokenVersion });

    testUser2 = await User.create({ email: 'user2@example.com', password: 'Password123!', name: 'U2', role: 'user' });
    token2 = signAccessToken({ id: testUser2._id.toString(), tokenVersion: testUser2.tokenVersion });
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

beforeEach(async () => {
    await Conversation.deleteMany({});
    await Message.deleteMany({});

    originalConv = await Conversation.create({
        userId: testUser1._id,
        title: 'Original',
        messageCount: 1
    });

    await Message.create({
        conversationId: originalConv._id,
        userId: testUser1._id,
        role: 'user',
        text: 'hello'
    });
});

describe('GET /api/conversations/:cid', () => {

    it('returns 401 without auth', async () => {
        const res = await request(app).get(`/api/conversations/${originalConv._id}`);
        expect(res.status).toBe(401);
    });

    it('returns 403 for conversation owned by different user', async () => {
        const res = await request(app).get(`/api/conversations/${originalConv._id}`).set('Authorization', `Bearer ${token2}`);
        expect(res.status).toBe(403);
    });

    it('returns 404 for non-existent conversationId', async () => {
        const fakeId = new mongoose.Types.ObjectId();
        const res = await request(app).get(`/api/conversations/${fakeId}`).set('Authorization', `Bearer ${token1}`);
        expect(res.status).toBe(404);
    });

    it('returns 400 for invalid ObjectId format', async () => {
        const res = await request(app).get(`/api/conversations/not-an-id`).set('Authorization', `Bearer ${token1}`);
        expect(res.status).toBe(400);
    });

    it('returns full conversation including parentConversationId field', async () => {
        const branchConv = await Conversation.create({
            userId: testUser1._id,
            title: 'Branch',
            parentConversationId: originalConv._id,
            branchedFromMessageId: new mongoose.Types.ObjectId()
        });

        const res = await request(app).get(`/api/conversations/${branchConv._id}`).set('Authorization', `Bearer ${token1}`);
        expect(res.status).toBe(200);
        expect(res.body.parentConversationId).toBe(originalConv._id.toString());
        expect(typeof res.body._id).toBe('string');
    });

});

describe('GET /api/conversations/:cid/branches', () => {

    it('returns 401 without auth', async () => {
        const res = await request(app).get(`/api/conversations/${originalConv._id}/branches`);
        expect(res.status).toBe(401);
    });

    it('returns 403 for conversation owned by different user', async () => {
        const res = await request(app).get(`/api/conversations/${originalConv._id}/branches`).set('Authorization', `Bearer ${token2}`);
        expect(res.status).toBe(403);
    });

    it('returns array with only root entry when no branches exist', async () => {
        const res = await request(app).get(`/api/conversations/${originalConv._id}/branches`).set('Authorization', `Bearer ${token1}`);
        expect(res.status).toBe(200);
        expect(res.body.length).toBe(1);
        expect(res.body[0].isRoot).toBe(true);
        expect(res.body[0]._id).toBe(originalConv._id.toString());
        expect(res.body[0].branchedFromMessageId).toBeNull();
    });

    it('returns root + child branches when branches exist', async () => {
        const m1Id = new mongoose.Types.ObjectId();
        await Conversation.create({ userId: testUser1._id, title: 'B1', parentConversationId: originalConv._id, branchedFromMessageId: m1Id });
        await Conversation.create({ userId: testUser1._id, title: 'B2', parentConversationId: originalConv._id, branchedFromMessageId: m1Id });

        const res = await request(app).get(`/api/conversations/${originalConv._id}/branches`).set('Authorization', `Bearer ${token1}`);
        expect(res.status).toBe(200);
        expect(res.body.length).toBe(3);
        expect(res.body[0].isRoot).toBe(true);
        expect(res.body[1].isRoot).toBeFalsy();
        expect(typeof res.body[1].branchedFromMessageId).toBe('string');
    });

    it('returns same result when called from a branch (not just root)', async () => {
        const m1Id = new mongoose.Types.ObjectId();
        const b1 = await Conversation.create({ userId: testUser1._id, title: 'B1', parentConversationId: originalConv._id, branchedFromMessageId: m1Id });

        const resRoot = await request(app).get(`/api/conversations/${originalConv._id}/branches`).set('Authorization', `Bearer ${token1}`);
        const resBranch = await request(app).get(`/api/conversations/${b1._id}/branches`).set('Authorization', `Bearer ${token1}`);

        expect(resRoot.status).toBe(200);
        expect(resBranch.status).toBe(200);
        expect(resBranch.body).toEqual(resRoot.body);
    });

    it('does NOT include branches from a different root conversation', async () => {
        const otherRoot = await Conversation.create({ userId: testUser1._id, title: 'Root2' });
        await Conversation.create({ userId: testUser1._id, title: 'B_Other', parentConversationId: otherRoot._id, branchedFromMessageId: new mongoose.Types.ObjectId() });

        await Conversation.create({ userId: testUser1._id, title: 'B_Main', parentConversationId: originalConv._id, branchedFromMessageId: new mongoose.Types.ObjectId() });

        const res = await request(app).get(`/api/conversations/${originalConv._id}/branches`).set('Authorization', `Bearer ${token1}`);
        expect(res.body.length).toBe(2);

        const branchIds = res.body.map(b => b._id.toString());
        expect(branchIds).toContain(originalConv._id.toString());
        expect(branchIds).not.toContain(otherRoot._id.toString());
    });

});
