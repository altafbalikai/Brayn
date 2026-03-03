// src/test/messageFeedback.test.js
//
// Unit tests for the MessageFeedback model.
// Run:  npx jest src/test/messageFeedback.test.js
//
// These tests use mongodb-memory-server so they don't touch a real database.

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const MessageFeedback = require('../models/MessageFeedback');

let mongoServer;

// ─── Setup / Teardown ──────────────────────────────────────────────────────────
beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

afterEach(async () => {
    await MessageFeedback.deleteMany({});
});

// ─── Helpers ───────────────────────────────────────────────────────────────────
const validFeedback = (overrides = {}) => ({
    messageId: new mongoose.Types.ObjectId(),
    userId: new mongoose.Types.ObjectId(),
    conversationId: new mongoose.Types.ObjectId(),
    feedbackType: 'positive',
    ...overrides
});

// ─── Tests ─────────────────────────────────────────────────────────────────────
describe('MessageFeedback Model', () => {

    // ── Basic CRUD ─────────────────────────────────────────────────────────────
    describe('Creation & Defaults', () => {
        it('should create a feedback document with valid fields', async () => {
            const fb = await MessageFeedback.create(validFeedback({
                reason: 'Very helpful answer',
                tags: ['helpful', 'accurate'],
                ipAddress: '127.0.0.1',
                userAgent: 'Mozilla/5.0'
            }));

            expect(fb._id).toBeDefined();
            expect(fb.feedbackType).toBe('positive');
            expect(fb.reason).toBe('Very helpful answer');
            expect(fb.tags).toEqual(['helpful', 'accurate']);
            expect(fb.createdAt).toBeInstanceOf(Date);
            expect(fb.updatedAt).toBeInstanceOf(Date);
        });

        it('should default tags to an empty array', async () => {
            const fb = await MessageFeedback.create(validFeedback());
            expect(fb.tags).toEqual([]);
        });
    });

    // ── Validation ─────────────────────────────────────────────────────────────
    describe('Validation', () => {
        it('should reject when messageId is missing', async () => {
            await expect(
                MessageFeedback.create(validFeedback({ messageId: undefined }))
            ).rejects.toThrow(/messageId is required/);
        });

        it('should reject when userId is missing', async () => {
            await expect(
                MessageFeedback.create(validFeedback({ userId: undefined }))
            ).rejects.toThrow(/userId is required/);
        });

        it('should reject when feedbackType is missing', async () => {
            await expect(
                MessageFeedback.create(validFeedback({ feedbackType: undefined }))
            ).rejects.toThrow(/feedbackType is required/);
        });

        it('should reject invalid feedbackType value', async () => {
            await expect(
                MessageFeedback.create(validFeedback({ feedbackType: 'invalid' }))
            ).rejects.toThrow(/is not a valid feedback type/);
        });

        it('should reject reason exceeding 1000 characters', async () => {
            await expect(
                MessageFeedback.create(validFeedback({ reason: 'x'.repeat(1001) }))
            ).rejects.toThrow(/Reason cannot exceed 1000 characters/);
        });
    });

    // ── Unique Constraint ──────────────────────────────────────────────────────
    describe('Unique compound index (messageId + userId)', () => {
        it('should prevent duplicate feedback from the same user on the same message', async () => {
            const data = validFeedback();
            await MessageFeedback.create(data);

            await expect(
                MessageFeedback.create({ ...data, feedbackType: 'negative' })
            ).rejects.toThrow(/duplicate key|E11000/);
        });
    });

    // ── toJSON ─────────────────────────────────────────────────────────────────
    describe('toJSON()', () => {
        it('should exclude ipAddress, userAgent, and __v', async () => {
            // Need to use `select('+ipAddress +userAgent')` to load them first
            const fb = await MessageFeedback.create(validFeedback({
                ipAddress: '10.0.0.1',
                userAgent: 'TestBot/1.0'
            }));

            const json = fb.toJSON();
            expect(json.ipAddress).toBeUndefined();
            expect(json.userAgent).toBeUndefined();
            expect(json.__v).toBeUndefined();
            expect(json.feedbackType).toBe('positive');
        });
    });

    // ── Static Methods ─────────────────────────────────────────────────────────
    describe('Static: getStatsByMessage()', () => {
        it('should return aggregated counts per feedbackType', async () => {
            const messageId = new mongoose.Types.ObjectId();

            await MessageFeedback.insertMany([
                validFeedback({ messageId, feedbackType: 'positive' }),
                validFeedback({ messageId, feedbackType: 'positive' }),
                validFeedback({ messageId, feedbackType: 'negative' }),
                validFeedback({ messageId, feedbackType: 'neutral' })
            ]);

            const stats = await MessageFeedback.getStatsByMessage(messageId);

            expect(stats.positive).toBe(2);
            expect(stats.negative).toBe(1);
            expect(stats.neutral).toBe(1);
            expect(stats.total).toBe(4);
        });

        it('should return all zeros when no feedback exists', async () => {
            const stats = await MessageFeedback.getStatsByMessage(new mongoose.Types.ObjectId());
            expect(stats).toEqual({ positive: 0, negative: 0, neutral: 0, total: 0 });
        });
    });

    describe('Static: getUserFeedback()', () => {
        it('should return the user\'s feedback on a message', async () => {
            const data = validFeedback({ reason: 'Great!' });
            await MessageFeedback.create(data);

            const result = await MessageFeedback.getUserFeedback(data.userId, data.messageId);

            expect(result).not.toBeNull();
            expect(result.feedbackType).toBe('positive');
            expect(result.reason).toBe('Great!');
        });

        it('should return null when no feedback exists', async () => {
            const result = await MessageFeedback.getUserFeedback(
                new mongoose.Types.ObjectId(),
                new mongoose.Types.ObjectId()
            );
            expect(result).toBeNull();
        });
    });

    // ── Index Verification ─────────────────────────────────────────────────────
    describe('Indexes', () => {
        it('should have all expected indexes', async () => {
            // Ensure indexes are built
            await MessageFeedback.ensureIndexes();
            const indexes = await MessageFeedback.collection.indexes();

            const indexKeys = indexes.map(i => Object.keys(i.key).join(','));

            // Default _id index
            expect(indexKeys).toContain('_id');
            // Individual field indexes declared in schema
            expect(indexKeys).toContain('messageId');
            expect(indexKeys).toContain('userId');
            expect(indexKeys).toContain('conversationId');
            // Compound unique index
            expect(indexKeys).toContain('messageId,userId');
            // CreatedAt sort index
            expect(indexKeys).toContain('createdAt');
        });
    });
});
