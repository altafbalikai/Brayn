import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { submitFeedback as apiSubmitFeedback, getFeedback, retryMessageStream, switchVersion as apiSwitchVersion } from '../../api/services/messageInteractionsService';

// To avoid circular dependency with conversationSlice, we use string action types for cross-slice dispatches
const conversationSliceActions = {
    startRetry: (payload) => ({ type: 'conversation/startRetry', payload }),
    updateAssistantText: (payload) => ({ type: 'conversation/updateAssistantText', payload }),
    appendMessageChunk: (payload) => ({ type: 'conversation/appendMessageChunk', payload }),
    finalizeAssistantMessage: (payload) => ({ type: 'conversation/finalizeAssistantMessage', payload }),
    switchMessageVersion: (payload) => ({ type: 'conversation/switchMessageVersion', payload })
};

// ─── Async Thunks ────────────────────────────────────────────────────────────

/**
 * Submit feedback (positive/negative/neutral) for a message
 */
export const submitFeedback = createAsyncThunk(
    'messageInteractions/submitFeedback',
    async ({ messageId, feedbackType, conversationId, reason, tags }, { rejectWithValue }) => {
        try {
            const data = await apiSubmitFeedback(messageId, {
                feedbackType,
                conversationId,
                reason,
                tags
            });
            return { messageId, ...data }; // data includes userFeedback and stats
        } catch (error) {
            return rejectWithValue(error.message || 'Failed to submit feedback');
        }
    }
);

/**
 * Fetch feedback stats and user's current feedback for a message
 */
export const fetchFeedback = createAsyncThunk(
    'messageInteractions/fetchFeedback',
    async (messageId, { rejectWithValue }) => {
        try {
            const data = await getFeedback(messageId);
            return { messageId, ...data };
        } catch (error) {
            return rejectWithValue(error.message || 'Failed to fetch feedback');
        }
    }
);

/**
 * Regenerate an assistant response (Retry) with real-time streaming
 */
export const retryMessage = createAsyncThunk(
    'messageInteractions/retryMessage',
    async ({ conversationId, messageId, options = {} }, { dispatch, rejectWithValue }) => {
        try {
            // 1. Prepare for streaming (initialize version, show loading)
            dispatch(conversationSliceActions.startRetry({ conversationId, messageId }));

            // 2. Start the stream
            const stream = retryMessageStream({ conversationId, messageId, options });

            const result = await stream.start(
                // onChunk (Internal update) - USE APPEND TO FIX FLICKERING
                (chunk) => {
                    dispatch(conversationSliceActions.appendMessageChunk({
                        conversationId,
                        messageId,
                        chunk
                    }));
                },
                // onComplete (Not strictly needed for the thunk return but good for metadata)
                (fullText, metadata) => {
                    // Finalize in message list
                    dispatch(conversationSliceActions.finalizeAssistantMessage({
                        conversationId,
                        tempId: messageId,
                        text: fullText,
                        status: 'sent'
                    }));
                }
            );

            // Result contains { fullText, metadata }
            return { messageId, ...result.metadata };
        } catch (error) {
            return rejectWithValue(error.message || 'Failed to retry message');
        }
    }
);

/**
 * Switch the active displayed version of a message
 */
export const switchVersion = createAsyncThunk(
    'messageInteractions/switchVersion',
    async ({ conversationId, messageId, versionId, versionNumber }, { dispatch, rejectWithValue }) => {
        try {
            const data = await apiSwitchVersion(messageId, { versionId, versionNumber });

            // Instantly sync the main conversation text UI
            dispatch(conversationSliceActions.switchMessageVersion({
                conversationId,
                messageId,
                versionNumber: data.message.version
            }));

            return { messageId, ...data };
        } catch (error) {
            return rejectWithValue(error.message || 'Failed to switch version');
        }
    }
);

// ─── Initial State ──────────────────────────────────────────────────────────

const initialState = {
    feedback: {
        byMessageId: {} // { [messageId]: { userFeedback, stats, loading, submitting, error } }
    },
    versions: {
        byMessageId: {} // { [messageId]: { versions, currentVersionNumber, totalVersions, loading, error } }
    },
    retry: {
        byMessageId: {} // { [messageId]: { isRetrying, error, retryCount } }
    },
    clipboard: {
        lastCopiedId: null,
        copiedAt: null
    }
};

// ─── Slice Definition ────────────────────────────────────────────────────────

const messageInteractionsSlice = createSlice({
    name: 'messageInteractions',
    initialState,
    reducers: {
        markMessageCopied: (state, action) => {
            const { messageId } = action.payload;
            state.clipboard.lastCopiedId = messageId;
            state.clipboard.copiedAt = new Date().toISOString();
        },
        clearError: (state, action) => {
            const { messageId, type } = action.payload; // type: 'feedback', 'versions', or 'retry'
            if (state[type]?.byMessageId[messageId]) {
                state[type].byMessageId[messageId].error = null;
            }
        },
        resetMessage: (state, action) => {
            const messageId = action.payload;
            delete state.feedback.byMessageId[messageId];
            delete state.versions.byMessageId[messageId];
            delete state.retry.byMessageId[messageId];
        }
    },
    extraReducers: (builder) => {
        builder
            // ── Feedback ──
            .addCase(fetchFeedback.pending, (state, action) => {
                const messageId = action.meta.arg;
                if (!state.feedback.byMessageId[messageId]) {
                    state.feedback.byMessageId[messageId] = {
                        userFeedback: null,
                        stats: { positive: 0, negative: 0 },
                        loading: true,
                        submitting: false,
                        error: null
                    };
                } else {
                    state.feedback.byMessageId[messageId].loading = true;
                }
            })
            .addCase(fetchFeedback.fulfilled, (state, action) => {
                const { messageId, userFeedback, stats } = action.payload;
                state.feedback.byMessageId[messageId] = {
                    userFeedback,
                    stats,
                    loading: false,
                    submitting: false,
                    error: null
                };
            })
            .addCase(fetchFeedback.rejected, (state, action) => {
                const messageId = action.meta.arg;
                if (!state.feedback.byMessageId[messageId]) {
                    state.feedback.byMessageId[messageId] = { stats: { positive: 0, negative: 0 }, loading: false, submitting: false, error: null };
                }
                state.feedback.byMessageId[messageId].loading = false;
                state.feedback.byMessageId[messageId].error = action.payload;
            })
            .addCase(submitFeedback.pending, (state, action) => {
                const { messageId } = action.meta.arg;
                if (!state.feedback.byMessageId[messageId]) {
                    state.feedback.byMessageId[messageId] = {
                        userFeedback: null,
                        stats: { positive: 0, negative: 0 },
                        loading: false,
                        submitting: true,
                        error: null
                    };
                } else {
                    state.feedback.byMessageId[messageId].submitting = true;
                }
            })
            .addCase(submitFeedback.fulfilled, (state, action) => {
                const { messageId, userFeedback, stats } = action.payload;
                state.feedback.byMessageId[messageId] = {
                    ...state.feedback.byMessageId[messageId],
                    userFeedback,
                    stats,
                    submitting: false,
                    error: null
                };
            })
            .addCase(submitFeedback.rejected, (state, action) => {
                const { messageId } = action.meta.arg;
                if (!state.feedback.byMessageId[messageId]) {
                    state.feedback.byMessageId[messageId] = { stats: { positive: 0, negative: 0 }, loading: false, submitting: false, error: null };
                }
                state.feedback.byMessageId[messageId].submitting = false;
                state.feedback.byMessageId[messageId].error = action.payload;
            })

            // ── Versions ──
            .addCase(switchVersion.pending, (state, action) => {
                const { messageId } = action.meta.arg;
                if (!state.versions.byMessageId[messageId]) {
                    state.versions.byMessageId[messageId] = { versions: [], loading: true, error: null };
                } else {
                    state.versions.byMessageId[messageId].loading = true;
                }
            })
            .addCase(switchVersion.fulfilled, (state, action) => {
                const { messageId, message } = action.payload;
                // Update specific message version state
                if (state.versions.byMessageId[messageId]) {
                    state.versions.byMessageId[messageId] = {
                        ...state.versions.byMessageId[messageId],
                        currentVersionNumber: message.version,
                        loading: false,
                        error: null
                    };
                }
            })
            .addCase(switchVersion.rejected, (state, action) => {
                const { messageId } = action.meta.arg;
                if (!state.versions.byMessageId[messageId]) {
                    state.versions.byMessageId[messageId] = { versions: [], loading: false, error: null };
                }
                state.versions.byMessageId[messageId].loading = false;
                state.versions.byMessageId[messageId].error = action.payload;
            })

            // ── Retry ──
            .addCase(retryMessage.pending, (state, action) => {
                const { messageId } = action.meta.arg;
                if (!state.retry.byMessageId[messageId]) {
                    state.retry.byMessageId[messageId] = { retryCount: 0 };
                }
                state.retry.byMessageId[messageId].isRetrying = true;
            })
            .addCase(retryMessage.fulfilled, (state, action) => {
                const { messageId } = action.payload;
                const existing = state.retry.byMessageId[messageId] || { retryCount: 0 };
                state.retry.byMessageId[messageId] = {
                    ...existing,
                    isRetrying: false,
                    retryCount: (existing.retryCount || 0) + 1,
                    error: null
                };
            })
            .addCase(retryMessage.rejected, (state, action) => {
                const { messageId } = action.meta.arg;
                if (!state.retry.byMessageId[messageId]) {
                    state.retry.byMessageId[messageId] = { retryCount: 0, isRetrying: false, error: null };
                }
                state.retry.byMessageId[messageId].isRetrying = false;
                state.retry.byMessageId[messageId].error = action.payload;
            });
    }
});

// ─── Selectors ───────────────────────────────────────────────────────────────

// Helper to avoid undefined errors
const getMsgState = (slice, messageId) => slice.byMessageId[messageId] || {};

// Feedback Selectors
export const selectUserFeedback = (state, messageId) =>
    getMsgState(state.messageInteractions.feedback, messageId).userFeedback;

export const selectFeedbackStats = (state, messageId) =>
    getMsgState(state.messageInteractions.feedback, messageId).stats || { positive: 0, negative: 0 };

export const selectFeedbackLoading = (state, messageId) =>
    getMsgState(state.messageInteractions.feedback, messageId).loading || false;

export const selectFeedbackSubmitting = (state, messageId) =>
    getMsgState(state.messageInteractions.feedback, messageId).submitting || false;

export const selectFeedbackError = (state, messageId) =>
    getMsgState(state.messageInteractions.feedback, messageId).error || null;

// Version Selectors
export const selectMessageVersions = (state, messageId) =>
    getMsgState(state.messageInteractions.versions, messageId).versions || [];

export const selectCurrentVersionNumber = (state, messageId) =>
    getMsgState(state.messageInteractions.versions, messageId).currentVersionNumber || 1;

export const selectTotalVersions = (state, messageId) =>
    getMsgState(state.messageInteractions.versions, messageId).totalVersions || 1;

export const selectVersionsLoading = (state, messageId) =>
    getMsgState(state.messageInteractions.versions, messageId).loading || false;

export const selectVersionsError = (state, messageId) =>
    getMsgState(state.messageInteractions.versions, messageId).error || null;

// Retry Selectors
export const selectIsRetrying = (state, messageId) =>
    getMsgState(state.messageInteractions.retry, messageId).isRetrying || false;

export const selectRetryError = (state, messageId) =>
    getMsgState(state.messageInteractions.retry, messageId).error || null;

export const selectRetryCount = (state, messageId) =>
    getMsgState(state.messageInteractions.retry, messageId).retryCount || 0;

// Clipboard Selectors
export const selectLastCopied = (state) => state.messageInteractions.clipboard.lastCopiedId;
export const selectLastCopiedTime = (state) => state.messageInteractions.clipboard.copiedAt;

// ─── Exports ─────────────────────────────────────────────────────────────────

export const { markMessageCopied, clearError, resetMessage } = messageInteractionsSlice.actions;
export default messageInteractionsSlice.reducer;
