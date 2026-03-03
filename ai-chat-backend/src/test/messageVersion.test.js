// src/test/messageVersion.test.js
//
// Unit tests for the MessageVersion model.
// Run:  npx jest src/test/messageVersion.test.js
//
// Uses mongodb-memory-server — no real database needed.

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const MessageVersion = require('../models/MessageVersion');

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
    await MessageVersion.deleteMany({});
});

// ─── Helpers ───────────────────────────────────────────────────────────────────
const validVersion = (overrides = {}) => ({
    messageId: new mongoose.Types.ObjectId(),
    conversationId: new mongoose.Types.ObjectId(),
    version: 1,
    content: 'This is the response text.',
    ...overrides
});

// ─── Tests ─────────────────────────────────────────────────────────────────────
describe('MessageVersion Model', () => {

    // ── Basic CRUD ─────────────────────────────────────────────────────────────
    describe('Creation & Defaults', () => {
        it('should create a version with valid fields', async () => {
            const v = await MessageVersion.create(validVersion({
                personaId: 'persona-123',
                modelId: 'gpt-4',
                temperature: 0.7,
                tokens: { prompt: 100, completion: 200, total: 300 }
            }));

            expect(v._id).toBeDefined();
            expect(v.version).toBe(1);
            expect(v.content).toBe('This is the response text.');
            expect(v.personaId).toBe('persona-123');
            expect(v.modelId).toBe('gpt-4');
            expect(v.temperature).toBe(0.7);
            expect(v.tokens.total).toBe(300);
            expect(v.createdAt).toBeInstanceOf(Date);
        });

        it('should default isActive to false', async () => {
            const v = await MessageVersion.create(validVersion());
            expect(v.isActive).toBe(false);
        });

        it('should default generatedAt to current date', async () => {
            const before = new Date();
            const v = await MessageVersion.create(validVersion());
            expect(v.generatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
        });

        it('should default parentMessageId to null', async () => {
            const v = await MessageVersion.create(validVersion());
            expect(v.parentMessageId).toBeNull();
        });

        it('should default tokens to zeros', async () => {
            const v = await MessageVersion.create(validVersion());
            expect(v.tokens.prompt).toBe(0);
            expect(v.tokens.completion).toBe(0);
            expect(v.tokens.total).toBe(0);
        });
    });

    // ── Validation ─────────────────────────────────────────────────────────────
    describe('Validation', () => {
        it('should reject when messageId is missing', async () => {
            await expect(
                MessageVersion.create(validVersion({ messageId: undefined }))
            ).rejects.toThrow(/messageId is required/);
        });

        it('should reject when version is missing', async () => {
            await expect(
                MessageVersion.create(validVersion({ version: undefined }))
            ).rejects.toThrow(/version is required/);
        });

        it('should reject when content is missing', async () => {
            await expect(
                MessageVersion.create(validVersion({ content: undefined }))
            ).rejects.toThrow(/content is required/);
        });

        it('should reject version = 0 (must be >= 1)', async () => {
            await expect(
                MessageVersion.create(validVersion({ version: 0 }))
            ).rejects.toThrow(/version must be a positive integer/);
        });

        it('should reject negative version number', async () => {
            await expect(
                MessageVersion.create(validVersion({ version: -1 }))
            ).rejects.toThrow(/version must be a positive integer/);
        });

        it('should reject non-integer version number', async () => {
            await expect(
                MessageVersion.create(validVersion({ version: 1.5 }))
            ).rejects.toThrow(/not a valid version/);
        });
    });

    // ── Unique compound index (messageId + version) ────────────────────────────
    describe('Unique version per message', () => {
        it('should prevent duplicate version numbers for the same message', async () => {
            const messageId = new mongoose.Types.ObjectId();
            await MessageVersion.create(validVersion({ messageId, version: 1 }));

            await expect(
                MessageVersion.create(validVersion({ messageId, version: 1, content: 'Different' }))
            ).rejects.toThrow(/duplicate key|E11000/);
        });

        it('should allow the same version number for different messages', async () => {
            await MessageVersion.create(validVersion({ version: 1 }));
            await MessageVersion.create(validVersion({ version: 1 })); // different messageId (auto-generated)
            const count = await MessageVersion.countDocuments();
            expect(count).toBe(2);
        });
    });

    // ── toJSON ─────────────────────────────────────────────────────────────────
    describe('toJSON()', () => {
        it('should strip __v', async () => {
            const v = await MessageVersion.create(validVersion());
            const json = v.toJSON();
            expect(json.__v).toBeUndefined();
            expect(json.content).toBe('This is the response text.');
        });
    });

    // ── Static: getVersionsByMessage ────────────────────────────────────────────
    describe('Static: getVersionsByMessage()', () => {
        it('should return versions sorted by version number ascending', async () => {
            const messageId = new mongoose.Types.ObjectId();
            // Insert out of order
            await MessageVersion.create(validVersion({ messageId, version: 3, content: 'v3' }));
            await MessageVersion.create(validVersion({ messageId, version: 1, content: 'v1' }));
            await MessageVersion.create(validVersion({ messageId, version: 2, content: 'v2' }));

            const versions = await MessageVersion.getVersionsByMessage(messageId);

            expect(versions).toHaveLength(3);
            expect(versions[0].version).toBe(1);
            expect(versions[1].version).toBe(2);
            expect(versions[2].version).toBe(3);
        });

        it('should return empty array when no versions exist', async () => {
            const versions = await MessageVersion.getVersionsByMessage(new mongoose.Types.ObjectId());
            expect(versions).toEqual([]);
        });
    });

    // ── Static: getActiveVersion ────────────────────────────────────────────────
    describe('Static: getActiveVersion()', () => {
        it('should return the active version', async () => {
            const messageId = new mongoose.Types.ObjectId();
            await MessageVersion.create(validVersion({ messageId, version: 1, isActive: false }));
            await MessageVersion.create(validVersion({ messageId, version: 2, isActive: true, content: 'active' }));

            const active = await MessageVersion.getActiveVersion(messageId);
            expect(active).not.toBeNull();
            expect(active.version).toBe(2);
            expect(active.content).toBe('active');
        });

        it('should return null when no active version', async () => {
            const messageId = new mongoose.Types.ObjectId();
            await MessageVersion.create(validVersion({ messageId, version: 1, isActive: false }));

            const active = await MessageVersion.getActiveVersion(messageId);
            expect(active).toBeNull();
        });
    });

    // ── Static: setActiveVersion ────────────────────────────────────────────────
    describe('Static: setActiveVersion()', () => {
        it('should activate the target version and deactivate all others', async () => {
            const messageId = new mongoose.Types.ObjectId();
            const v1 = await MessageVersion.create(validVersion({ messageId, version: 1, isActive: true }));
            const v2 = await MessageVersion.create(validVersion({ messageId, version: 2, isActive: false, content: 'v2' }));

            const activated = await MessageVersion.setActiveVersion(messageId, v2._id);

            expect(activated.isActive).toBe(true);
            expect(activated.version).toBe(2);

            // Verify v1 is now inactive
            const refreshedV1 = await MessageVersion.findById(v1._id);
            expect(refreshedV1.isActive).toBe(false);
        });

        it('should throw when versionId does not belong to the message', async () => {
            const messageId = new mongoose.Types.ObjectId();
            const fakeVersionId = new mongoose.Types.ObjectId();

            await expect(
                MessageVersion.setActiveVersion(messageId, fakeVersionId)
            ).rejects.toThrow(/not found/);
        });
    });

    // ── Index verification ─────────────────────────────────────────────────────
    describe('Indexes', () => {
        it('should have all expected indexes', async () => {
            await MessageVersion.ensureIndexes();
            const indexes = await MessageVersion.collection.indexes();
            const indexKeys = indexes.map(i => Object.keys(i.key).join(','));

            expect(indexKeys).toContain('_id');
            expect(indexKeys).toContain('messageId');
            expect(indexKeys).toContain('conversationId');
            expect(indexKeys).toContain('messageId,isActive');
            expect(indexKeys).toContain('messageId,version'); // unique
        });
    });
});
