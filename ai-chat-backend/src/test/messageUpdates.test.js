// src/test/messageUpdates.test.js
//
// Tests for the new fields and methods added to Message model (Phase 1.3)
// Run:  npx jest src/test/messageUpdates.test.js

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Message = require('../models/Message');

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
    await Message.deleteMany({});
});

// ─── Helpers ───────────────────────────────────────────────────────────────────
const validMessage = (overrides = {}) => ({
    conversationId: new mongoose.Types.ObjectId(),
    userId: new mongoose.Types.ObjectId(),
    role: 'assistant',
    text: 'Hello, world!',
    ...overrides
});

// ─── Tests ─────────────────────────────────────────────────────────────────────
describe('Message Model — Phase 1.3 Updates', () => {

    // ── Default values for new fields ──────────────────────────────────────────
    describe('New field defaults', () => {
        it('should initialize feedback with zeros and null userFeedback', async () => {
            const msg = await Message.create(validMessage());

            expect(msg.feedback.positive).toBe(0);
            expect(msg.feedback.negative).toBe(0);
            expect(msg.feedback.userFeedback).toBeNull();
        });

        it('should initialize versions as empty array', async () => {
            const msg = await Message.create(validMessage());
            expect(msg.versions).toEqual([]);
        });

        it('should default currentVersionId to null', async () => {
            const msg = await Message.create(validMessage());
            expect(msg.currentVersionId).toBeNull();
        });

        it('should default isRetried to false', async () => {
            const msg = await Message.create(validMessage());
            expect(msg.isRetried).toBe(false);
        });

        it('should default parentMessageId to null', async () => {
            const msg = await Message.create(validMessage());
            expect(msg.parentMessageId).toBeNull();
        });

        it('should default copiedCount to 0', async () => {
            const msg = await Message.create(validMessage());
            expect(msg.copiedCount).toBe(0);
        });

        it('should default lastCopiedAt to null', async () => {
            const msg = await Message.create(validMessage());
            expect(msg.lastCopiedAt).toBeNull();
        });
    });

    // ── Backward compatibility ─────────────────────────────────────────────────
    describe('Backward compatibility', () => {
        it('should still create messages with only the original fields', async () => {
            const msg = await Message.create({
                conversationId: new mongoose.Types.ObjectId(),
                userId: new mongoose.Types.ObjectId(),
                role: 'user',
                text: 'Hi there'
            });

            expect(msg._id).toBeDefined();
            expect(msg.text).toBe('Hi there');
            expect(msg.role).toBe('user');
        });
    });

    // ── Validation ─────────────────────────────────────────────────────────────
    describe('Validation', () => {
        it('should reject invalid userFeedback value', async () => {
            await expect(
                Message.create(validMessage({
                    feedback: { positive: 0, negative: 0, userFeedback: 'invalid' }
                }))
            ).rejects.toThrow();
        });
    });

    // ── updateFeedbackStats() ──────────────────────────────────────────────────
    describe('updateFeedbackStats()', () => {
        it('should increment positive count on first feedback', async () => {
            const msg = await Message.create(validMessage());
            await msg.updateFeedbackStats('positive');

            expect(msg.feedback.positive).toBe(1);
            expect(msg.feedback.negative).toBe(0);
            expect(msg.feedback.userFeedback).toBe('positive');
        });

        it('should switch from positive to negative correctly', async () => {
            const msg = await Message.create(validMessage());
            await msg.updateFeedbackStats('positive');
            await msg.updateFeedbackStats('negative', 'positive');

            expect(msg.feedback.positive).toBe(0);
            expect(msg.feedback.negative).toBe(1);
            expect(msg.feedback.userFeedback).toBe('negative');
        });

        it('should not double-increment on same feedback type', async () => {
            const msg = await Message.create(validMessage());
            await msg.updateFeedbackStats('positive');
            await msg.updateFeedbackStats('positive', 'positive');

            expect(msg.feedback.positive).toBe(1);
        });
    });

    // ── incrementCopyCount() ───────────────────────────────────────────────────
    describe('incrementCopyCount()', () => {
        it('should increment copiedCount and set lastCopiedAt', async () => {
            const msg = await Message.create(validMessage());
            const before = new Date();

            await msg.incrementCopyCount();

            expect(msg.copiedCount).toBe(1);
            expect(msg.lastCopiedAt).toBeInstanceOf(Date);
            expect(msg.lastCopiedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
        });

        it('should accumulate multiple copies', async () => {
            const msg = await Message.create(validMessage());
            await msg.incrementCopyCount();
            await msg.incrementCopyCount();
            await msg.incrementCopyCount();

            expect(msg.copiedCount).toBe(3);
        });
    });

    // ── addVersion() ───────────────────────────────────────────────────────────
    describe('addVersion()', () => {
        it('should add a version ID to the versions array', async () => {
            const msg = await Message.create(validMessage());
            const versionId = new mongoose.Types.ObjectId();

            await msg.addVersion(versionId);

            expect(msg.versions).toHaveLength(1);
            expect(msg.versions[0].toString()).toBe(versionId.toString());
        });

        it('should accumulate multiple versions', async () => {
            const msg = await Message.create(validMessage());
            await msg.addVersion(new mongoose.Types.ObjectId());
            await msg.addVersion(new mongoose.Types.ObjectId());

            expect(msg.versions).toHaveLength(2);
        });
    });

    // ── setCurrentVersion() ────────────────────────────────────────────────────
    describe('setCurrentVersion()', () => {
        it('should set currentVersionId', async () => {
            const msg = await Message.create(validMessage());
            const versionId = new mongoose.Types.ObjectId();

            await msg.setCurrentVersion(versionId);

            expect(msg.currentVersionId.toString()).toBe(versionId.toString());
        });

        it('should change currentVersionId on subsequent calls', async () => {
            const msg = await Message.create(validMessage());
            const v1 = new mongoose.Types.ObjectId();
            const v2 = new mongoose.Types.ObjectId();

            await msg.setCurrentVersion(v1);
            await msg.setCurrentVersion(v2);

            expect(msg.currentVersionId.toString()).toBe(v2.toString());
        });
    });
});
