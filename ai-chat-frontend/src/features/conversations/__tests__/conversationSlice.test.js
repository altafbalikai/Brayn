import { describe, it, expect, vi, beforeEach } from 'vitest';
import reducer, {
    setEditingMessage,
    cancelEditing,
    registerBranch,
    editMessage,
    setCurrentConversation
} from '../conversationSlice';
import * as api from '../../../api/config';
import * as llmService from '../../../api/services/llmService';

// Setup basic mocks
vi.mock('../../../api/config', () => ({
    get: vi.fn(),
    post: vi.fn()
}));

vi.mock('../../../api/services/llmService', () => ({
    askStream: vi.fn()
}));

// Provide a stable UUID generator for mock assertion matching
vi.mock('uuid', () => ({
    v4: vi.fn(() => 'mock-uuid')
}));

describe('conversationSlice reducers', () => {

    const initialState = {
        editingMessageId: null,
        branchMap: {},
        currentConversation: null,
        sending: false
    };

    describe('setEditingMessage', () => {
        it('sets editingMessageId to the given messageId', () => {
            const state = reducer(initialState, setEditingMessage('msg123'));
            expect(state.editingMessageId).toBe('msg123');
        });
    });

    describe('cancelEditing', () => {
        it('clears editingMessageId back to null', () => {
            const state = reducer({ ...initialState, editingMessageId: 'msg123' }, cancelEditing());
            expect(state.editingMessageId).toBeNull();
        });
    });

    describe('registerBranch', () => {
        it('adds a new branch entry under the correct rootConvId key', () => {
            const state = reducer(initialState, registerBranch({
                originalConvId: 'root123',
                branchConvId: 'branch456',
                branchedFromMessageId: 'msg789',
                isRoot: false
            }));
            expect(state.branchMap['root123']).toHaveLength(1);
            expect(state.branchMap['root123'][0].branchConvId).toBe('branch456');
        });

        it('does not add duplicate entries for same branchConvId', () => {
            const payload = {
                originalConvId: 'root123',
                branchConvId: 'branch456',
                branchedFromMessageId: 'msg789'
            };
            let state = reducer(initialState, registerBranch(payload));
            state = reducer(state, registerBranch(payload)); // dispatch twice
            expect(state.branchMap['root123']).toHaveLength(1); // still 1, not 2
        });

        it('supports multiple branches under the same rootConvId', () => {
            let state = reducer(initialState, registerBranch({
                originalConvId: 'root123', branchConvId: 'branch1', branchedFromMessageId: 'msg1'
            }));
            state = reducer(state, registerBranch({
                originalConvId: 'root123', branchConvId: 'branch2', branchedFromMessageId: 'msg2'
            }));
            expect(state.branchMap['root123']).toHaveLength(2);
        });

        it('supports branches under different rootConvIds independently', () => {
            let state = reducer(initialState, registerBranch({
                originalConvId: 'root1', branchConvId: 'branchA', branchedFromMessageId: 'msgA'
            }));
            state = reducer(state, registerBranch({
                originalConvId: 'root2', branchConvId: 'branchB', branchedFromMessageId: 'msgB'
            }));
            expect(state.branchMap['root1']).toHaveLength(1);
            expect(state.branchMap['root2']).toHaveLength(1);
        });
    });

});

describe('editMessage thunk', () => {
    // To properly test the thunk logic, we configure a mock store with actual logic
    // Using simple mock dispatch mapping here or relying on vitest testing hooks if setup
    // For pure unit testing of the exported slice async thunk, we simulate the dispatch sequence:

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('calls POST /branch with correct payload', async () => {
        const dispatch = vi.fn();
        const getState = vi.fn(() => ({
            conversation: { currentConversation: { _id: 'orig1' } },
            llmModels: { llmmodels: [{ _id: 'mod1', status: 'active' }] }
        }));

        // Mock API response returning the backend data template
        api.post.mockResolvedValueOnce({
            data: {
                newConversationId: 'newConv1',
                conversation: { _id: 'newConv1', parentConversationId: 'orig1' }
            }
        });

        const thunk = editMessage({ messageId: 'm1', conversationId: 'orig1', newContent: 'edited text', tempAssistantId: 'tid1' });
        await thunk(dispatch, getState, undefined);

        expect(api.post).toHaveBeenCalledWith('/llm/conversations/orig1/branch', {
            editedMessageId: 'm1',
            newContent: 'edited text'
        });
    });

    it('dispatches registerBranch with rootId from returned conversation', async () => {
        const dispatch = vi.fn();
        const getState = vi.fn(() => ({
            conversation: { currentConversation: { _id: 'orig1' } },
            llmModels: { llmmodels: [{ _id: 'mod1', status: 'active' }] }
        }));

        api.post.mockResolvedValueOnce({
            data: {
                newConversationId: 'newConv1',
                conversation: { _id: 'newConv1', parentConversationId: 'root1' }
            }
        });

        const thunk = editMessage({ messageId: 'm1', conversationId: 'orig1', newContent: 'edited text', tempAssistantId: 'tid1' });
        await thunk(dispatch, getState, undefined);

        expect(dispatch).toHaveBeenCalledWith(registerBranch({
            originalConvId: 'root1', // Extracted correctly
            branchConvId: 'newConv1',
            branchedFromMessageId: 'm1'
        }));
    });

    it('dispatches setCurrentConversation with full conversation object', async () => {
        const dispatch = vi.fn();
        const getState = vi.fn(() => ({
            conversation: { currentConversation: { _id: 'orig1' } },
            llmModels: { llmmodels: [{ _id: 'mod1', status: 'active' }] }
        }));

        const returnedConv = { _id: 'newConv1', parentConversationId: 'root1' };
        api.post.mockResolvedValueOnce({
            data: {
                newConversationId: 'newConv1',
                conversation: returnedConv
            }
        });

        const thunk = editMessage({ messageId: 'm1', conversationId: 'orig1', newContent: 'edited text', tempAssistantId: 'tid1' });
        await thunk(dispatch, getState, undefined);

        expect(dispatch).toHaveBeenCalledWith(setCurrentConversation(returnedConv));
    });

    it('calls askStream with newConversationId, not original conversationId', async () => {
        const dispatch = vi.fn();
        const getState = vi.fn(() => ({
            conversation: { currentConversation: { _id: 'orig1' } },
            llmModels: { llmmodels: [{ _id: 'mod1', status: 'active' }] }
        }));

        api.post.mockResolvedValueOnce({
            data: {
                newConversationId: 'newConv1',
                conversation: { _id: 'newConv1', parentConversationId: 'orig1' }
            }
        });

        llmService.askStream.mockReturnValue((async function* () {
            yield { text: 'reply', messageId: 'm2', done: true };
        })());

        const thunk = editMessage({ messageId: 'm1', conversationId: 'orig1', newContent: 'text', tempAssistantId: 'tid1' });
        await thunk(dispatch, getState, undefined);

        expect(llmService.askStream).toHaveBeenCalledWith(
            expect.objectContaining({
                conversationId: 'newConv1',
                message: 'text'
            })
        );
    });

    it('dispatches rejectWithValue when POST /branch returns 403', async () => {
        const dispatch = vi.fn();
        const getState = vi.fn();

        api.post.mockRejectedValue({
            response: { status: 403, data: { error: 'Forbidden' } }
        });

        const thunk = editMessage({ messageId: 'm1', conversationId: 'orig1', newContent: 'text', tempAssistantId: 'tid1' });
        const result = await thunk(dispatch, getState, undefined);

        expect(result.type).toBe('conversation/editMessage/rejected');
        expect(result.payload).toEqual({ status: 403, data: { error: 'Forbidden' } });
    });

});
