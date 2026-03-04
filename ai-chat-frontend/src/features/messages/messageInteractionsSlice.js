import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { submitFeedback as apiSubmitFeedback, getFeedback, retryMessageStream, switchVersion as apiSwitchVersion } from '../../api/services/messageInteractionsService';
import { conversationService } from '../../api/services/conversationService';
import { generateUuid } from '../../api/utils/retryWithBackoff';
import { classifyError } from '../../api/utils/modelFailover';

// Helper to calculate exponential backoff delay
function calculateBackoff(attempt) {
    const baseDelay = 500;
    const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
    const jitter = exponentialDelay * 0.1 * Math.random();
    return Math.min(exponentialDelay + jitter, 30000);
}

// To avoid circular dependency with conversationSlice, we use string action types for cross-slice dispatches
const conversationSliceActions = {
    startRetry: (payload) => ({ type: 'conversation/startRetry', payload }),
    markRetrying: (payload) => ({ type: 'conversation/markRetrying', payload }),
    updateAssistantText: (payload) => ({ type: 'conversation/updateAssistantText', payload }),
    appendMessageChunk: (payload) => ({ type: 'conversation/appendMessageChunk', payload }),
    finalizeAssistantMessage: (payload) => ({ type: 'conversation/finalizeAssistantMessage', payload }),
    completeRetry: (payload) => ({ type: 'conversation/completeRetry', payload }),
    switchMessageVersion: (payload) => ({ type: 'conversation/switchMessageVersion', payload }),
    clearMessageText: (payload) => ({ type: 'conversation/clearMessageText', payload }),
};

// Import thunks from conversationSlice (using string types or direct import if safe, 
// but here we follow the existing pattern of matching the slice name)
import { updateConversationModel } from '../conversations/conversationSlice';

const abortControllers = {}; // ✅ NEW: Track active streams for manual aborts

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
 * ✅ NEW: Automatic retry with internal request key
 * Used when stream fails automatically - same requestKey across all attempts
 */
export const retryMessage = createAsyncThunk(
    'messageInteractions/retryMessage',
    async (
        { conversationId, messageId, options = {} },
        { dispatch, getState, rejectWithValue }
    ) => {
        const state = getState();
        const currentConv = state.conversation.currentConversation;
        const selectedModelId = currentConv?.selectedModelId;

        // 1. Prepare ordered list of models: selected first, then others
        const allModels = state.llmModels.llmmodels.filter(m => m.status === "active");
        const otherModels = allModels.filter(m => m._id !== selectedModelId);
        const selectedModel = allModels.find(m => m._id === selectedModelId);

        const orderedModels = selectedModel ? [selectedModel, ...otherModels] : allModels;

        // BUG 1: Rotate requestKey every time we switch models
        let requestKey = generateUuid();
        let previousRequestKey = requestKey;
        let lastError = null;

        // OUTER LOOP: Iterate through models
        for (let modelIndex = 0; modelIndex < orderedModels.length; modelIndex++) {
            const model = orderedModels[modelIndex];
            const isModelSwitch = model._id !== selectedModelId;

            if (modelIndex > 0) {
                previousRequestKey = requestKey;
                requestKey = generateUuid();
                // console.log('[RETRY] Model switch — requestKey rotated:', {
                //     previousKey: previousRequestKey,
                //     newKey: requestKey,
                //     modelId: model._id
                // });

                dispatch(updateModelFailover({
                    messageId,
                    modelName: model.displayName || model.name || model.modelId,
                    isSwitching: true
                }));
            } else {
                // console.log('[RETRY] First model — requestKey stays:', requestKey);
            }

            // INNER LOOP: Attempts for current model
            for (let attempt = 1; attempt <= 5; attempt++) {
                try {
                    // On absolute first attempt of the whole thunk, prepare new version
                    if (attempt === 1 && modelIndex === 0) {
                        dispatch(conversationSliceActions.startRetry({
                            conversationId,
                            messageId
                        }));
                    } else {
                        // All other attempts (retry same model or switch model): mark retrying
                        dispatch(conversationSliceActions.markRetrying({
                            conversationId,
                            messageId
                        }));
                    }

                    dispatch(updateRetryProgress({
                        messageId,
                        attempt,
                        maxAttempts: 5
                    }));

                    // Stream attempt with overrideModelId
                    const stream = retryMessageStream({
                        conversationId,
                        messageId,
                        options: { ...options, overrideModelId: model._id },
                        requestKey
                    });

                    const result = await stream.start(
                        (chunk) => {
                            dispatch(conversationSliceActions.appendMessageChunk({
                                conversationId,
                                messageId,
                                chunk
                            }));
                        },
                        (fullText, metadata) => {
                            dispatch(conversationSliceActions.finalizeAssistantMessage({
                                conversationId,
                                tempId: messageId,
                                text: fullText,
                                status: 'sent'
                            }));
                        }
                    );

                    // SUCCESS: Persist new model if we switched
                    if (isModelSwitch) {
                        try {
                            // ✅ FINAL GAP 3: Use thunk for robust state sync
                            await dispatch(updateConversationModel({
                                conversationId,
                                modelId: model._id
                            })).unwrap();
                        } catch (persistErr) {
                            console.error("Failed to persist model switch to DB:", persistErr);
                            // BUG 3: Show alert if persistence fails
                            window.alert(`Response generated by ${model.displayName || model.name}, but could not save it as your default model.`);
                        }
                    }

                    dispatch(clearModelFailover(messageId));
                    dispatch(conversationSliceActions.completeRetry({
                        conversationId,
                        messageId,
                        success: true
                    }));

                    return {
                        messageId,
                        attempt,
                        ...result.metadata
                    };

                } catch (error) {
                    const classified = classifyError(error);
                    lastError = classified;

                    // If model is unavailable AND we have more models to try, move to next model
                    if (classified.isUnavailable && modelIndex < orderedModels.length - 1) {
                        break; // Break inner loop -> move to next model in outer loop
                    }

                    // If not retriable or last attempt for THIS model, handle fatal
                    if (!classified.isRetriable || attempt === 5) {
                        // If this was the last model, or not retriable, finalize failure
                        if (!classified.isRetriable || modelIndex === orderedModels.length - 1) {
                            dispatch(clearModelFailover(messageId));
                            dispatch(conversationSliceActions.completeRetry({
                                conversationId,
                                messageId,
                                success: false,
                                error: classified.message
                            }));

                            return rejectWithValue({
                                message: classified.message,
                                status: classified.status,
                                attempt,
                                isFatal: classified.isFatal
                            });
                        }
                        break; // Try next model
                    }

                    // Backoff before next attempt for the SAME model
                    const delay = calculateBackoff(attempt);
                    await new Promise(r => setTimeout(r, delay));
                }
            }
        }

        return rejectWithValue(lastError.message);
    }
);

/**
 * ✅ NEW: Manual retry - user clicks "Retry" button after failure
 * Generates NEW request key to bypass idempotency cache and create fresh version
 */
export const manualRetry = createAsyncThunk(
    'messageInteractions/manualRetry',
    async ({ conversationId, messageId, options = {} }, { dispatch, getState, rejectWithValue }) => {
        const state = getState();
        const currentConv = state.conversation.currentConversation;
        const selectedModelId = currentConv?.selectedModelId;
        const allModels = state.llmModels.llmmodels.filter(m => m.status === "active");
        const otherModels = allModels.filter(m => m._id !== selectedModelId);
        const selectedModel = allModels.find(m => m._id === selectedModelId);
        const orderedModels = selectedModel ? [selectedModel, ...otherModels] : allModels;
        const maxAttempts = 5;

        // BUG 2: Abort existing stream for this message (safety against double clicks)
        if (abortControllers[messageId]) {
            abortControllers[messageId].abort();
            delete abortControllers[messageId];
        }
        abortControllers[messageId] = new AbortController();
        const signal = abortControllers[messageId].signal;

        let requestKey = generateUuid();
        let previousRequestKey = requestKey;
        let streamSucceeded = false;
        let lastError = null;

        try {
            for (let modelIndex = 0; modelIndex < orderedModels.length; modelIndex++) {
                const model = orderedModels[modelIndex];
                const isModelSwitch = model._id !== selectedModelId;

                // Rotate key if switching away from original model
                if (modelIndex > 0) {
                    previousRequestKey = requestKey;
                    requestKey = generateUuid();
                    dispatch(updateModelFailover({
                        messageId,
                        modelName: model.displayName || model.name || model.modelId,
                        isSwitching: true
                    }));
                }

                for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                    try {
                        // CASE B: startRetry creates versions, so only call once
                        if (attempt === 1 && modelIndex === 0) {
                            dispatch(conversationSliceActions.startRetry({ conversationId, messageId }));
                        } else if (attempt === 1 && modelIndex > 0) {
                            // Fresh attempt for a switch — clear previous model's error state/text
                            dispatch(conversationSliceActions.clearMessageText({ conversationId, messageId }));
                        } else {
                            dispatch(conversationSliceActions.markRetrying({ conversationId, messageId }));
                        }

                        dispatch(updateRetryProgress({ messageId, attempt, maxAttempts }));

                        const stream = retryMessageStream({
                            conversationId,
                            messageId,
                            options: { ...options, overrideModelId: model._id },
                            requestKey,
                            signal
                        });

                        const result = await stream.start(
                            (chunk) => dispatch(conversationSliceActions.appendMessageChunk({ conversationId, messageId, chunk })),
                            (fullText, metadata) => dispatch(conversationSliceActions.finalizeAssistantMessage({
                                conversationId,
                                tempId: messageId,
                                text: fullText,
                                status: 'sent'
                            }))
                        );

                        // SUCCESS: Sync model if switched
                        if (isModelSwitch) {
                            try {
                                await dispatch(updateConversationModel({
                                    conversationId,
                                    modelId: model._id
                                })).unwrap();
                            } catch (persistErr) {
                                console.error('Model persistence failed:', persistErr);
                                window.alert(`Response generated by ${model.displayName || model.name}, but could not save it as your default model.`);
                            }
                        }

                        dispatch(clearModelFailover(messageId));
                        dispatch(conversationSliceActions.completeRetry({ conversationId, messageId, success: true }));
                        streamSucceeded = true;

                        // FINAL GAP 4: Confirmed result shape { fullText, metadata }
                        return { messageId, attempt, ...result.metadata };

                    } catch (err) {
                        const { isUnavailable, isRetriable } = classifyError(err);
                        lastError = err;

                        // FIX 2: Corrected Catch Logic
                        if (isUnavailable) {
                            break; // Move to next model
                        }

                        if (isRetriable && attempt < maxAttempts) {
                            const delay = calculateBackoff(attempt);
                            await new Promise(r => setTimeout(r, delay));
                            continue;
                        }

                        // Exhausted or fatal
                        if (modelIndex < orderedModels.length - 1) {
                            break; // Try next model
                        }

                        throw err; // Surfaces to rejected case below
                    }
                }
            }

            // FIX 1: Throw if all exhausted
            if (!streamSucceeded) {
                throw new Error('Selected LLM model is unavailable. Please try again later.');
            }
        } catch (error) {
            dispatch(conversationSliceActions.completeRetry({
                conversationId,
                messageId,
                success: false,
                error: error.message
            }));

            return rejectWithValue(error.message);
        } finally {
            delete abortControllers[messageId];
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
        byMessageId: {} // { [messageId]: { isRetrying, currentAttempt, maxAttempts, error, isFatalError, retryCount } }
    },
    modelFailover: {
        byMessageId: {} // { [messageId]: { currentModelName, isSwitching } }
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
        // ✅ NEW: Update retry progress during attempts
        updateRetryProgress: (state, action) => {
            const { messageId, attempt, maxAttempts } = action.payload;
            if (!state.retry.byMessageId[messageId]) {
                state.retry.byMessageId[messageId] = { retryCount: 0 };
            }
            state.retry.byMessageId[messageId].isRetrying = true;
            state.retry.byMessageId[messageId].currentAttempt = attempt;
            state.retry.byMessageId[messageId].maxAttempts = maxAttempts;
        },
        resetMessage: (state, action) => {
            const messageId = action.payload;
            delete state.feedback.byMessageId[messageId];
            delete state.versions.byMessageId[messageId];
            delete state.retry.byMessageId[messageId];
            delete state.modelFailover.byMessageId[messageId];
        },
        updateModelFailover: (state, action) => {
            const { messageId, modelName, isSwitching } = action.payload;
            state.modelFailover.byMessageId[messageId] = {
                currentModelName: modelName,
                isSwitching
            };
        },
        clearModelFailover: (state, action) => {
            const messageId = action.payload;
            delete state.modelFailover.byMessageId[messageId];
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
                    state.retry.byMessageId[messageId] = {
                        retryCount: 0,
                        isRetrying: true,
                        currentAttempt: 1,
                        maxAttempts: 5,
                        error: null,
                        isFatalError: false
                    };
                } else {
                    state.retry.byMessageId[messageId].isRetrying = true;
                    state.retry.byMessageId[messageId].currentAttempt = 1;
                    state.retry.byMessageId[messageId].error = null;
                }
            })
            .addCase(retryMessage.fulfilled, (state, action) => {
                const { messageId, attempt } = action.payload;
                const existing = state.retry.byMessageId[messageId] || { retryCount: 0 };
                state.retry.byMessageId[messageId] = {
                    ...existing,
                    isRetrying: false,
                    retryCount: (existing.retryCount || 0) + 1,
                    error: null,
                    isFatalError: false,
                    currentAttempt: 0
                };
            })
            .addCase(retryMessage.rejected, (state, action) => {
                const { messageId } = action.meta.arg;
                const { message, isFatal, attempt } = action.payload || {};
                if (!state.retry.byMessageId[messageId]) {
                    state.retry.byMessageId[messageId] = {
                        retryCount: 0,
                        isRetrying: false,
                        error: null,
                        isFatalError: false
                    };
                }
                state.retry.byMessageId[messageId].isRetrying = false;
                state.retry.byMessageId[messageId].error = message || action.payload;
                state.retry.byMessageId[messageId].isFatalError = isFatal || false;
                state.retry.byMessageId[messageId].currentAttempt = 0;
            })

            // ── Manual Retry ──
            .addCase(manualRetry.pending, (state, action) => {
                const { messageId } = action.meta.arg;
                if (!state.retry.byMessageId[messageId]) {
                    state.retry.byMessageId[messageId] = { retryCount: 0 };
                }
                state.retry.byMessageId[messageId].isRetrying = true;
                state.retry.byMessageId[messageId].error = null;
                state.retry.byMessageId[messageId].isFatalError = false;
            })
            .addCase(manualRetry.fulfilled, (state, action) => {
                const { messageId } = action.payload;
                const existing = state.retry.byMessageId[messageId] || { retryCount: 0 };
                state.retry.byMessageId[messageId] = {
                    ...existing,
                    isRetrying: false,
                    retryCount: (existing.retryCount || 0) + 1,
                    error: null,
                    isFatalError: false
                };
            })
            .addCase(manualRetry.rejected, (state, action) => {
                const { messageId } = action.meta.arg;
                if (!state.retry.byMessageId[messageId]) {
                    state.retry.byMessageId[messageId] = { retryCount: 0 };
                }
                state.retry.byMessageId[messageId].isRetrying = false;
                state.retry.byMessageId[messageId].error = action.payload;
                state.retry.byMessageId[messageId].isFatalError = true;
            })
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

export const selectRetryAttempt = (state, messageId) =>
    getMsgState(state.messageInteractions.retry, messageId).currentAttempt || 0;

export const selectMaxRetries = (state, messageId) =>
    getMsgState(state.messageInteractions.retry, messageId).maxAttempts || 5;

export const selectIsFatalError = (state, messageId) =>
    getMsgState(state.messageInteractions.retry, messageId).isFatalError || false;

export const selectModelFailover = (state, messageId) =>
    getMsgState(state.messageInteractions.modelFailover, messageId) || { isSwitching: false };

// Clipboard Selectors
export const selectLastCopied = (state) => state.messageInteractions.clipboard.lastCopiedId;
export const selectLastCopiedTime = (state) => state.messageInteractions.clipboard.copiedAt;

// ─── Exports ─────────────────────────────────────────────────────────────────

export const {
    markMessageCopied,
    clearError,
    updateRetryProgress,
    resetMessage,
    updateModelFailover,
    clearModelFailover
} = messageInteractionsSlice.actions;
export default messageInteractionsSlice.reducer;
