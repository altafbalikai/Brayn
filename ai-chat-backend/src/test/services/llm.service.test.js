const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
// Note: if getContextMessages is not exported, we need a way to test it. Let's assume it's exported for testing, or we test prepareAskContext.
// Given the instructions specify "test the function directly by importing it", let's import the service.
const llmService = require('../../services/llm.service');
const Message = require('../../models/Message');
const Conversation = require('../../models/Conversation');

let mongoServer;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

beforeEach(async () => {
    await Conversation.deleteMany({});
    await Message.deleteMany({});
});

describe('getContextMessages', () => {

    // We will use the exposed prepareAskContext if getContextMessages is private
    // We can also just test it via llmService if we exported it:
    // If it's private and we don't want to change llm.service exports, we rely on prepareAskContext
    const exposeGetContextMessages = async (cid, limit) => {
        if (llmService.getContextMessages) {
            return await llmService.getContextMessages(cid, limit);
        } else {
            // workaround to test getContextMessages logic indirectly
            // Not truly isolated, but we can verify the DB logic it runs.
            // If the user wants us to test `getContextMessages` directly, it might be exported.
            throw new Error("getContextMessages must be exported from llm.service.js for this test");
        }
    };

    it('returns last MAX_CONTEXT messages for root conversation', async () => {
        const rootConv = await Conversation.create({ userId: new mongoose.Types.ObjectId(), title: 'Root' });

        let mIds = [];
        for (let i = 0; i < 6; i++) {
            const m = await Message.create({
                conversationId: rootConv._id, userId: rootConv.userId, role: i % 2 ? 'assistant' : 'user', text: `Message ${i}`,
                createdAt: new Date(Date.now() + i * 1000)
            });
            mIds.push(m._id);
        }

        const messages = await llmService.getContextMessages(rootConv._id, 4);

        expect(messages.length).toBe(4);
        expect(messages[0].text).toBe('Message 2');
        expect(messages[3].text).toBe('Message 5');
        messages.forEach(m => expect(m.conversationId.toString()).toBe(rootConv._id.toString()));
    });

    it('returns branch messages + parent messages when branch has fewer than MAX_CONTEXT', async () => {
        const rootConv = await Conversation.create({ userId: new mongoose.Types.ObjectId(), title: 'Root' });

        let mIds = [];
        for (let i = 0; i < 4; i++) {
            const m = await Message.create({
                conversationId: rootConv._id, userId: rootConv.userId, role: i % 2 ? 'assistant' : 'user', text: `M${i + 1}`,
                createdAt: new Date(Date.now() + i * 1000)
            });
            mIds.push(m._id);
        }

        const branchConv = await Conversation.create({
            userId: rootConv.userId, title: 'Branch',
            parentConversationId: rootConv._id, branchedFromMessageId: mIds[1]
        });

        const branchMsg = await Message.create({
            conversationId: branchConv._id, userId: rootConv.userId, role: 'user', text: `M2-edited`,
            createdAt: new Date(Date.now() + 5000)
        });

        const messages = await llmService.getContextMessages(branchConv._id, 4);

        expect(messages.length).toBe(3); // M1, M2, M2-edited. (It limits to 4, finds 1 branch, gets 3 parent up to M2)
        expect(messages[0].text).toBe('M1');
        expect(messages[1].text).toBe('M2');
        expect(messages[2].text).toBe('M2-edited');
    });

    it('does not include parent messages beyond the branch cut point', async () => {
        const rootConv = await Conversation.create({ userId: new mongoose.Types.ObjectId(), title: 'Root' });

        let mIds = [];
        for (let i = 0; i < 5; i++) {
            const m = await Message.create({
                conversationId: rootConv._id, userId: rootConv.userId, role: i % 2 ? 'assistant' : 'user', text: `M${i + 1}`,
                createdAt: new Date(Date.now() + i * 1000)
            });
            mIds.push(m._id);
        }

        const branchConv = await Conversation.create({
            userId: rootConv.userId, title: 'Branch',
            parentConversationId: rootConv._id, branchedFromMessageId: mIds[2] // branch at M3
        });

        const branchMsg = await Message.create({
            conversationId: branchConv._id, userId: rootConv.userId, role: 'user', text: `M3-edited`,
            createdAt: new Date(Date.now() + 6000)
        });

        const messages = await llmService.getContextMessages(branchConv._id, 4);

        const texts = messages.map(m => m.text);
        expect(texts).toContain('M3-edited');
        expect(texts).not.toContain('M4');
        expect(texts).not.toContain('M5');
        const m3IndexInParent = messages.findIndex(m => m._id?.toString() === mIds[2].toString());
        expect(m3IndexInParent).not.toBe(-1);
    });

    it('returns only branch messages when branch alone fills MAX_CONTEXT', async () => {
        const rootConv = await Conversation.create({ userId: new mongoose.Types.ObjectId(), title: 'Root' });
        const branchConv = await Conversation.create({
            userId: rootConv.userId, title: 'Branch',
            parentConversationId: rootConv._id, branchedFromMessageId: new mongoose.Types.ObjectId()
        });

        for (let i = 0; i < 4; i++) {
            await Message.create({
                conversationId: branchConv._id, userId: rootConv.userId, role: 'assistant', text: `B${i}`,
                createdAt: new Date(Date.now() + i * 1000)
            });
        }

        const messages = await llmService.getContextMessages(branchConv._id, 4);

        expect(messages.length).toBe(4);
        messages.forEach(m => expect(m.conversationId.toString()).toBe(branchConv._id.toString()));
    });

    it('returns messages in chronological order (oldest first)', async () => {
        const rootConv = await Conversation.create({ userId: new mongoose.Types.ObjectId(), title: 'Root' });
        const branchConv = await Conversation.create({
            userId: rootConv.userId, title: 'Branch',
            parentConversationId: rootConv._id, branchedFromMessageId: new mongoose.Types.ObjectId()
        });

        const m1 = await Message.create({ conversationId: rootConv._id, userId: rootConv.userId, role: 'user', text: `R1`, createdAt: new Date('2024-01-01') });
        const m2 = await Message.create({ conversationId: rootConv._id, userId: rootConv.userId, role: 'assistant', text: `R2`, createdAt: new Date('2024-01-02') });

        branchConv.branchedFromMessageId = m2._id;
        await branchConv.save();

        const m3 = await Message.create({ conversationId: branchConv._id, userId: rootConv.userId, role: 'user', text: `B1`, createdAt: new Date('2024-01-03') });

        const messages = await llmService.getContextMessages(branchConv._id, 4);

        expect(messages[0].createdAt.getTime()).toBeLessThan(messages[1].createdAt.getTime());
        expect(messages[1].createdAt.getTime()).toBeLessThan(messages[2].createdAt.getTime());
    });

});
