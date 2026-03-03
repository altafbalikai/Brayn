const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../../../app');
const User = require('../../../models/User');
const Message = require('../../../models/Message');
const MessageFeedback = require('../../../models/MessageFeedback');
const { signAccessToken } = require('../../../utils/jwt');

let mongoServer;
let testUser;
let authToken;
let testMessage;
let testConversationId;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    // Create a test user
    testUser = await User.create({
        email: 'test@example.com',
        password: 'Password123!',
        name: 'Test User',
        role: 'user'
    });

    // Generate token
    authToken = `Bearer ${signAccessToken({
        id: testUser._id.toString(),
        email: testUser.email,
        role: testUser.role,
        tokenVersion: testUser.tokenVersion
    })}`;

    testConversationId = new mongoose.Types.ObjectId();
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

beforeEach(async () => {
    await Message.deleteMany({});
    await MessageFeedback.deleteMany({});

    // Create a dummy assistant message to give feedback on
    testMessage = await Message.create({
        conversationId: testConversationId,
        userId: testUser._id,
        role: 'assistant',
        text: 'This is an AI response.'
    });
});

describe('Feedback Controller Integration Tests', () => {

    describe('POST /api/messages/:messageId/feedback', () => {
        const getUrl = (id) => `/api/messages/${id}/feedback`;

        test('should save positive feedback and update message stats', async () => {
            const res = await request(app)
                .post(getUrl(testMessage._id))
                .set('Authorization', authToken)
                .send({
                    feedbackType: 'positive',
                    conversationId: testConversationId
                });

            expect([200, 201]).toContain(res.status);
            expect(res.body.success).toBe(true);
            expect(res.body.userFeedback).toBe('positive');
            expect(res.body.stats.positive).toBe(1);

            // Verify DB models
            const fb = await MessageFeedback.findOne({ messageId: testMessage._id });
            expect(fb.feedbackType).toBe('positive');

            const msg = await Message.findById(testMessage._id);
            expect(msg.feedback.positive).toBe(1);
            expect(msg.feedback.userFeedback).toBe('positive');
        });

        test('should allow changing feedback from positive to negative', async () => {
            // First submit positive
            await MessageFeedback.create({
                messageId: testMessage._id,
                userId: testUser._id,
                conversationId: testConversationId,
                feedbackType: 'positive'
            });
            await testMessage.updateFeedbackStats('positive');

            // Then submit negative
            const res = await request(app)
                .post(getUrl(testMessage._id))
                .set('Authorization', authToken)
                .send({
                    feedbackType: 'negative',
                    conversationId: testConversationId
                });

            expect(res.status).toBe(200);
            expect(res.body.userFeedback).toBe('negative');
            expect(res.body.stats.positive).toBe(0);
            expect(res.body.stats.negative).toBe(1);
        });

        test('should return 400 for invalid feedbackType', async () => {
            const res = await request(app)
                .post(getUrl(testMessage._id))
                .set('Authorization', authToken)
                .send({
                    feedbackType: 'invalid-type',
                    conversationId: testConversationId
                });

            expect(res.status).toBe(400);
            expect(res.body.error).toBeDefined();
        });

        test('should return 404 if message not found', async () => {
            const fakeId = new mongoose.Types.ObjectId();
            const res = await request(app)
                .post(getUrl(fakeId))
                .set('Authorization', authToken)
                .send({
                    feedbackType: 'positive',
                    conversationId: testConversationId
                });

            expect(res.status).toBe(404);
        });

        test('should return 401 if not authenticated', async () => {
            const res = await request(app)
                .post(getUrl(testMessage._id))
                .send({
                    feedbackType: 'positive',
                    conversationId: testConversationId
                });

            expect(res.status).toBe(401);
        });
    });

    describe('GET /api/messages/:messageId/feedback', () => {
        const getUrl = (id) => `/api/messages/${id}/feedback`;

        test('should return feedback stats and currentUser feedback', async () => {
            // Setup some aggregate data
            await MessageFeedback.insertMany([
                { messageId: testMessage._id, userId: new mongoose.Types.ObjectId(), conversationId: testConversationId, feedbackType: 'positive' },
                { messageId: testMessage._id, userId: new mongoose.Types.ObjectId(), conversationId: testConversationId, feedbackType: 'negative' },
                // User's own feedback
                { messageId: testMessage._id, userId: testUser._id, conversationId: testConversationId, feedbackType: 'positive' }
            ]);

            const res = await request(app)
                .get(getUrl(testMessage._id))
                .set('Authorization', authToken);

            expect(res.status).toBe(200);
            expect(res.body.stats.positive).toBe(2);
            expect(res.body.stats.negative).toBe(1);
            expect(res.body.userFeedback).toBe('positive');
        });

        test('should work without authentication (anonymous stats)', async () => {
            await MessageFeedback.create({
                messageId: testMessage._id,
                userId: new mongoose.Types.ObjectId(),
                conversationId: testConversationId,
                feedbackType: 'positive'
            });

            const res = await request(app)
                .get(getUrl(testMessage._id));

            expect(res.status).toBe(200);
            expect(res.body.stats.positive).toBe(1);
            expect(res.body.userFeedback).toBeNull();
        });
    });
});
