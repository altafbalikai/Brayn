import { describe, it, expect, vi } from 'vitest';
import reducer, {
    markMessageCopied,
    clearError,
    resetMessage,
    submitFeedback,
    fetchFeedback,
    retryMessage,
    switchVersion
} from '../messageInteractionsSlice';
import * as messageInteractionsService from '../../../api/services/messageInteractionsService';

// Mock the messageInteractionsService
vi.mock('../../../api/services/messageInteractionsService', () => ({
    submitFeedback: vi.fn(),
    getFeedback: vi.fn(),
    retryMessageStream: vi.fn(() => ({
        start: vi.fn().mockResolvedValue({
            fullText: 'new content',
            metadata: { message: { content: 'new content', version: 2 } }
        }),
        cancel: vi.fn()
    })),
    switchVersion: vi.fn()
}));

describe('messageInteractionsSlice', () => {
    const initialState = {
        feedback: { byMessageId: {} },
        versions: { byMessageId: {} },
        retry: { byMessageId: {} },
        clipboard: { lastCopiedId: null, copiedAt: null }
    };

    describe('reducers', () => {
        it('should handle markMessageCopied', () => {
            const state = reducer(initialState, markMessageCopied({ messageId: 'msg1' }));
            expect(state.clipboard.lastCopiedId).toBe('msg1');
            expect(state.clipboard.copiedAt).not.toBeNull();
        });

        it('should handle clearError', () => {
            const stateWithError = {
                ...initialState,
                feedback: {
                    byMessageId: {
                        'msg1': { error: 'some error', loading: false }
                    }
                }
            };
            const state = reducer(stateWithError, clearError({ messageId: 'msg1', type: 'feedback' }));
            expect(state.feedback.byMessageId['msg1'].error).toBeNull();
        });

        it('should handle resetMessage', () => {
            const populatedState = {
                ...initialState,
                feedback: { byMessageId: { 'msg1': { userFeedback: 'positive' } } },
                versions: { byMessageId: { 'msg1': { currentVersionNumber: 2 } } }
            };
            const state = reducer(populatedState, resetMessage('msg1'));
            expect(state.feedback.byMessageId['msg1']).toBeUndefined();
            expect(state.versions.byMessageId['msg1']).toBeUndefined();
        });
    });

    describe('async thunks', () => {
        it('fetchFeedback.fulfilled should update state', () => {
            const payload = {
                messageId: 'msg1',
                userFeedback: 'positive',
                stats: { positive: 1, negative: 0 }
            };
            const action = { type: fetchFeedback.fulfilled.type, payload };
            const state = reducer(initialState, action);

            expect(state.feedback.byMessageId['msg1']).toEqual({
                userFeedback: 'positive',
                stats: { positive: 1, negative: 0 },
                loading: false,
                submitting: false,
                error: null
            });
        });

        it('submitFeedback.fulfilled should update state', () => {
            const existingState = {
                ...initialState,
                feedback: {
                    byMessageId: {
                        'msg1': { stats: { positive: 0, negative: 0 }, loading: false }
                    }
                }
            };
            const payload = {
                messageId: 'msg1',
                userFeedback: 'negative',
                stats: { positive: 0, negative: 1 }
            };
            const action = { type: submitFeedback.fulfilled.type, payload };
            const state = reducer(existingState, action);

            expect(state.feedback.byMessageId['msg1'].userFeedback).toBe('negative');
            expect(state.feedback.byMessageId['msg1'].stats.negative).toBe(1);
        });

        it('retryMessage.fulfilled should update state', () => {
            const payload = { messageId: 'msg1' };
            const action = { type: retryMessage.fulfilled.type, payload };
            const state = reducer(initialState, action);

            expect(state.retry.byMessageId['msg1'].isRetrying).toBe(false);
            expect(state.retry.byMessageId['msg1'].retryCount).toBe(1);
        });

        it('switchVersion.fulfilled should update state', () => {
            const existingState = {
                ...initialState,
                versions: {
                    byMessageId: {
                        'msg1': { currentVersionNumber: 1, loading: false }
                    }
                }
            };
            const payload = {
                messageId: 'msg1',
                message: { version: 2 }
            };
            const action = { type: switchVersion.fulfilled.type, payload };
            const state = reducer(existingState, action);

            expect(state.versions.byMessageId['msg1'].currentVersionNumber).toBe(2);
        });
    });
});
