const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../../app');
const User = require('../../models/User');
const Conversation = require('../../models/Conversation');
const Message = require('../../models/Message');
const { signAccessToken } = require('../../utils/jwt');

// Mock only LLM streaming to test pure controller and logic flows smoothly
jest.mock('../../services/llm.service', () => {
    const originalModule = jest.requireActual('../../services/llm.service');
    const mockMongoose = require('mongoose');

    return {
        ...originalModule,
        askConversationStream: jest.fn().mockImplementation(async () => {
            const stream = (async function* () {
                yield { choices: [{ delta: { content: 'Mocked ' } }] };
                yield { choices: [{ delta: { content: 'LLM Response' } }] };
            })();
            return { stream, modelId: new mockMongoose.Types.ObjectId() };
        })
    };
});

let mongoServer;
let testUser, user2Token;
let token, convId, messageIds;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    testUser = await User.create({ email: 'e2e@example.com', password: 'Password123!', name: 'E2E', role: 'user' });
    token = signAccessToken({ id: testUser._id.toString(), tokenVersion: testUser.tokenVersion });

    const testUser2 = await User.create({ email: 'e2e2@example.com', password: 'Password123!', name: 'E2E2', role: 'user' });
    user2Token = signAccessToken({ id: testUser2._id.toString(), tokenVersion: testUser2.tokenVersion });
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

beforeEach(async () => {
    await Conversation.deleteMany({});
    await Message.deleteMany({});
    messageIds = [];

    const conv = await Conversation.create({
        userId: testUser._id,
        title: 'Original Title',
        selectedModelId: new mongoose.Types.ObjectId()
    });
    convId = conv._id.toString();

    for (let i = 0; i < 4; i++) {
        const msg = await Message.create({
            conversationId: conv._id,
            userId: testUser._id,
            role: i % 2 === 0 ? 'user' : 'assistant',
            text: `Original Message ${i + 1}`,
            createdAt: new Date(Date.now() + i * 1000)
        });
        messageIds.push(msg._id.toString());
    }
});

describe('Edit Past Message — full backend flow', () => {

    it('branch creation flow creates an empty branch timeline before ask', async () => {
        // Step 1: Create branch
        const branchRes = await request(app)
            .post(`/api/llm/conversations/${convId}/branch`)
            .set('Authorization', `Bearer ${token}`)
            .send({ editedMessageId: messageIds[0], newContent: 'Edited first message' });

        expect(branchRes.status).toBe(201);
        const { newConversationId } = branchRes.body;

        // Step 2: Fetch messages for the branch
        const messagesRes = await request(app)
            .get(`/api/conversations/${newConversationId}/messages`)
            .set('Authorization', `Bearer ${token}`);

        expect(messagesRes.status).toBe(200);

        const texts = messagesRes.body.items.map(m => m.text);

        // At messageIds[0], there is no shared parent history and /branch does not create messages.
        expect(texts).toHaveLength(0);
    });

    it('keeps shared parent history before edit point', async () => {
        const branchRes = await request(app)
            .post(`/api/llm/conversations/${convId}/branch`)
            .set('Authorization', `Bearer ${token}`)
            .send({ editedMessageId: messageIds[2], newContent: 'Edited third message' });

        const { newConversationId } = branchRes.body;

        const messagesRes = await request(app)
            .get(`/api/conversations/${newConversationId}/messages`)
            .set('Authorization', `Bearer ${token}`);

        const texts = messagesRes.body.items.map(m => m.text);

        // Includes parent prior to the cut point 
        expect(texts).toContain('Original Message 1');
        expect(texts).toContain('Original Message 2');
        // /branch does not create the edited replacement message (that is done by /ask).
        expect(texts).not.toContain('Edited third message');
        // Excludes the future parent messages
        expect(texts).not.toContain('Original Message 4');
    });

    it('GET /branches returns root + new branch after creation', async () => {
        await request(app)
            .post(`/api/llm/conversations/${convId}/branch`)
            .set('Authorization', `Bearer ${token}`)
            .send({ editedMessageId: messageIds[1], newContent: 'Edited' });

        const branchesRes = await request(app)
            .get(`/api/conversations/${convId}/branches`)
            .set('Authorization', `Bearer ${token}`);

        expect(branchesRes.status).toBe(200);
        expect(branchesRes.body).toHaveLength(2); // root + 1 branch
        expect(branchesRes.body[0].isRoot).toBe(true);
        expect(branchesRes.body[1].isRoot).toBeFalsy();
    });

    it('GET /branches from branch returns same result as from root', async () => {
        const { newConversationId } = (await request(app)
            .post(`/api/llm/conversations/${convId}/branch`)
            .set('Authorization', `Bearer ${token}`)
            .send({ editedMessageId: messageIds[2], newContent: 'Edited M3' })).body;

        const fromRoot = await request(app)
            .get(`/api/conversations/${convId}/branches`)
            .set('Authorization', `Bearer ${token}`);

        const fromBranch = await request(app)
            .get(`/api/conversations/${newConversationId}/branches`)
            .set('Authorization', `Bearer ${token}`);

        expect(fromBranch.body).toEqual(fromRoot.body);
    });

    it('creating two branches from same message shows both in navigator', async () => {
        await request(app)
            .post(`/api/llm/conversations/${convId}/branch`)
            .set('Authorization', `Bearer ${token}`)
            .send({ editedMessageId: messageIds[1], newContent: 'Edit A' });

        await request(app)
            .post(`/api/llm/conversations/${convId}/branch`)
            .set('Authorization', `Bearer ${token}`)
            .send({ editedMessageId: messageIds[1], newContent: 'Edit B' });

        const branchesRes = await request(app)
            .get(`/api/conversations/${convId}/branches`)
            .set('Authorization', `Bearer ${token}`);

        expect(branchesRes.body).toHaveLength(3); // root + branch A + branch B
    });

    it('user cannot access another users branch conversation', async () => {
        const { newConversationId } = (await request(app)
            .post(`/api/llm/conversations/${convId}/branch`)
            .set('Authorization', `Bearer ${token}`)
            .send({ editedMessageId: messageIds[0], newContent: 'Edit' })).body;

        const res = await request(app)
            .get(`/api/conversations/${newConversationId}/messages`)
            .set('Authorization', `Bearer ${user2Token}`);

        expect(res.status).toBe(403);
    });

});

