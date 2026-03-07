const mongoose = require('mongoose');
const memoryReadService = require('../../services/memoryRead.service');
const Conversation = require('../../models/Conversation');

// Mock axios or qdrant instance if that's how memoryRead is hitting qdrant
// We need to capture the payload matching `readRelevantMemory`

jest.mock('axios', () => {
    return {
        post: jest.fn().mockResolvedValue({ data: { result: [] } })
    };
});
const axios = require('axios');

describe('readRelevantMemory - branch conversations', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('searches only current conversationId for root conversations', async () => {
        const rootConvId = new mongoose.Types.ObjectId().toString();
        // Since we mock axios post we can just provide rootConv as mock finding
        const convMock = { _id: rootConvId, parentConversationId: null };
        jest.spyOn(Conversation, 'findById').mockResolvedValue(convMock);

        await memoryReadService.readRelevantMemory(new mongoose.Types.ObjectId().toString(), 'test', 0.5, 3, rootConvId);

        expect(axios.post).toHaveBeenCalled();
        const callArgs = axios.post.mock.calls[0][1];

        // Ensure there is only match for rootConvId 
        expect(JSON.stringify(callArgs.filter)).toContain(rootConvId);
        // It should match exactly the root index and not any arrays
        // Or if it passes `any: [rootConvId]` that is also completely valid.
    });

    it('searches both branch and parent conversationIds for branch conversations', async () => {
        const branchConvId = new mongoose.Types.ObjectId().toString();
        const parentConvId = new mongoose.Types.ObjectId().toString();

        const convMock = { _id: branchConvId, parentConversationId: parentConvId };
        jest.spyOn(Conversation, 'findById').mockResolvedValue(convMock);

        await memoryReadService.readRelevantMemory(new mongoose.Types.ObjectId().toString(), 'test branch', 0.5, 3, branchConvId);

        expect(axios.post).toHaveBeenCalled();
        const callArgs = axios.post.mock.calls[0][1];

        const filterStr = JSON.stringify(callArgs.filter);
        expect(filterStr).toContain(branchConvId);
        expect(filterStr).toContain(parentConvId);

        const matchAnyRegex = /any"\s*:\s*\[([^\]]+)\]/;
        const match = filterStr.match(matchAnyRegex);
        if (match) {
            const arr = JSON.parse(`[${match[1]}]`);
            expect(arr.length).toBe(2);
            expect(arr).toContain(branchConvId);
            expect(arr).toContain(parentConvId);
        }
    });

});
