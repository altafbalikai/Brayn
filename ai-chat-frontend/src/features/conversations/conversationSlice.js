import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { conversationService } from '../../api/services/conversationService';
import { llmService } from '../../api/services/llmService';
import { logout } from '../auth/authSlice';
import { switchVersion, retryMessage, updateModelFailover, clearModelFailover } from '../messages/messageInteractionsSlice';
import { generateUuid } from '../../api/utils/retryWithBackoff';
import { classifyError } from '../../api/utils/modelFailover';

// Helper to calculate exponential backoff delay
function calculateBackoff(attempt) {
    const baseDelay = 500;
    const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
    const jitter = exponentialDelay * 0.1 * Math.random();
    return Math.min(exponentialDelay + jitter, 30000);
}

const abortControllers = {};

// Async thunks
export const fetchConversations = createAsyncThunk(
    'conversation/fetchConversations',
    async ({ page = 1, append = false } = {}, { rejectWithValue }) => {
        try {
            const data = await conversationService.listConversations(null, page, 20);
            return { ...data, page, append };
        } catch (error) {
            return rejectWithValue(
                error.response?.data?.error || 'Failed to fetch conversations'
            );
        }
    }
);

export const createConversation = createAsyncThunk(
    'conversation/createConversation',
    async ({ agentId, title, modelId, personaId }, { rejectWithValue }) => {
        try {
            const data = await conversationService.createConversation({ agentId, title, modelId, personaId });
            return data;
        } catch (error) {
            return rejectWithValue(
                error.response?.data?.error || 'Failed to create conversation'
            );
        }
    }
);

export const fetchMessages = createAsyncThunk(
    'conversation/fetchMessages',
    async ({ conversationId, page = 1, append = false }, { rejectWithValue }) => {
        try {
            const data = await conversationService.getMessages(conversationId, page, 50);
            return {
                conversationId,
                items: data.items || data.messages || data,
                page,
                append,
                hasMore: data.hasMore !== false && (data.items || data.messages || data).length === 50
            };
        } catch (error) {
            return rejectWithValue(
                error.response?.data?.error || 'Failed to fetch messages'
            );
        }
    }
);

export const sendMessage = createAsyncThunk(
    'conversation/sendMessage',
    async ({ message, conversationId, tempAssistantId }, { dispatch, getState, rejectWithValue }) => {
        const state = getState();
        const currentConv = state.conversation.currentConversation;
        const selectedModelId = currentConv?.selectedModelId;
        const allModels = state.llmModels.llmmodels.filter(m => m.status === 'active');
        const selectedModel = allModels.find(m => m._id === selectedModelId);
        const otherModels = allModels.filter(m => m._id !== selectedModelId);
        const orderedModels = selectedModel
            ? [selectedModel, ...otherModels]
            : allModels;
        const maxAttempts = 5;

        // Abort any existing stream for this conversation
        if (abortControllers[conversationId]) {
            abortControllers[conversationId].abort();
            delete abortControllers[conversationId];
        }
        abortControllers[conversationId] = new AbortController();
        const signal = abortControllers[conversationId].signal;

        let requestKey = generateUuid();
        let streamSucceeded = false;
        let lastError = null;

        try {
            // Add user message immediately
            const userMsg = {
                _id: `user-${Date.now()}`,
                role: 'user',
                text: message,
                createdAt: new Date().toISOString(),
                status: 'sent'
            };
            dispatch(addMessageToConversation({ conversationId, message: userMsg }));

            // Add pending placeholder assistant message immediately
            const placeholderMsg = {
                _id: tempAssistantId,
                role: 'assistant',
                text: '',
                createdAt: new Date().toISOString(),
                status: 'pending',
                versions: [],
                currentVersion: 1
            };
            dispatch(addAssistantPlaceholder({ conversationId, message: placeholderMsg }));

            dispatch(setAssistantTyping({ conversationId, value: true }));

            for (let modelIndex = 0; modelIndex < orderedModels.length; modelIndex++) {
                const model = orderedModels[modelIndex];
                const isModelSwitch = model._id !== selectedModelId;

                if (modelIndex > 0) {
                    requestKey = generateUuid();
                    dispatch(updateModelFailover({
                        messageId: conversationId,
                        modelName: model.displayName || model.name || model.modelId,
                        isSwitching: true
                    }));
                }

                for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                    try {
                        const stream = llmService.askStream({
                            message,
                            conversationId,
                            overrideModelId: model._id,
                            requestKey,
                            signal
                        });

                        let realMessageId = null;
                        let accumulated = '';

                        const onMetadata = (messageId) => {
                            realMessageId = messageId;
                            dispatch(updatePendingPlaceholderWithRealId({
                                conversationId,
                                tempId: tempAssistantId,
                                realId: realMessageId
                            }));
                        };

                        const onChunk = (chunk) => {
                            accumulated += chunk;
                            if (!realMessageId) return;
                            dispatch(updateAssistantText({
                                conversationId,
                                tempId: realMessageId,
                                text: accumulated,
                                status: 'streaming'
                            }));
                        };

                        const full = await stream.start(onMetadata, onChunk);

                        if (realMessageId) {
                            dispatch(finalizeAssistantMessage({
                                conversationId,
                                tempId: realMessageId,
                                text: full,
                                status: 'sent'
                            }));
                        }

                        // SUCCESS
                        if (isModelSwitch) {
                            try {
                                await dispatch(updateConversationModel({
                                    conversationId,
                                    modelId: model._id
                                })).unwrap();
                            } catch (persistErr) {
                                console.error('Model persistence failed — model switch not saved:', persistErr);
                                window.alert(
                                    `Message sent using ${model.displayName || model.name}, ` +
                                    `but could not save it as your default model. ` +
                                    `Your next message may use the previous model.`
                                );
                            }
                        }

                        dispatch(clearModelFailover(conversationId));
                        dispatch(setAssistantTyping({ conversationId, value: false }));
                        streamSucceeded = true;
                        return { conversationId, aiMessage: { _id: realMessageId, text: full } };

                    } catch (err) {
                        const { isUnavailable, isRetriable } = classifyError(err);
                        lastError = err;

                        if (isUnavailable) break;

                        if (isRetriable && attempt < maxAttempts) {
                            const delay = calculateBackoff(attempt);
                            await new Promise(r => setTimeout(r, delay));
                            continue;
                        }

                        if (modelIndex < orderedModels.length - 1) break;
                        throw err;
                    }
                }
            }

            if (!streamSucceeded) {
                throw new Error('Selected LLM model is unavailable. Please try again later.');
            }

        } catch (error) {
            const errMsg = error.message || 'Failed to stream message';
            dispatch(setAssistantTyping({ conversationId, value: false }));
            dispatch(clearModelFailover(conversationId));
            return rejectWithValue(errMsg);
        } finally {
            delete abortControllers[conversationId];
        }
    }
);

export const renameConversationTitle = createAsyncThunk(
    'conversation/renameConversationTitle',
    async ({ conversationId, title }, { rejectWithValue }) => {
        try {
            const data = await conversationService.renameConversationTitle(conversationId, title);
            return data;
        } catch (error) {
            return rejectWithValue(
                error.response?.data?.error || 'Failed to rename conversation title'
            );
        }
    }
);

export const deleteConversation = createAsyncThunk(
    'conversation/deleteConversation',
    async (conversationId, { rejectWithValue }) => {
        try {
            const data = await conversationService.deleteConversation(conversationId);
            return conversationId;
        } catch (error) {
            return rejectWithValue(
                error.response?.data?.error || 'Failed to delete conversation'
            );
        }
    }
);

export const updateConversationModel = createAsyncThunk(
    "conversation/updateConversationModel",
    async ({ conversationId, modelId }, { rejectWithValue }) => {
        try {
            const data = await conversationService.updateConversationModel(
                conversationId,
                modelId
            );
            return data;
        } catch (error) {
            return rejectWithValue(
                error.response?.data?.error || "Failed to update conversation model"
            );
        }
    }
);



const initialState = {
    conversations: [],
    currentConversation: null,
    messages: {},
    loading: false,
    sending: false,
    error: null,
    // Pagination state
    conversationsPage: 1,
    conversationsHasMore: true,
    conversationsLoadingMore: false,
    assistantTyping: {},
    messagesPages: {}, // { conversationId: { page: 1, hasMore: true } }
    messagesLoadingMore: {},
};

const conversationSlice = createSlice({
    name: 'conversation',
    initialState,
    reducers: {
        setCurrentConversation: (state, action) => {
            state.currentConversation = action.payload;
            state.loading = false;
        },
        addAssistantPlaceholder: (state, action) => {
            const { conversationId, message } = action.payload;
            if (!state.messages[conversationId]) {
                state.messages[conversationId] = [];
            }
            state.messages[conversationId].push(message);
        },
        // Replace temporary pending placeholder with real message ID when metadata arrives
        updatePendingPlaceholderWithRealId: (state, action) => {
            const { conversationId, tempId, realId } = action.payload;
            const messages = state.messages[conversationId];
            if (!messages) return;

            // Find the temporary pending message (usually the last one)
            const tempIndex = messages.findIndex(m => m._id === tempId && m.status === 'pending');
            if (tempIndex !== -1) {
                // Update the message with real ID and status
                messages[tempIndex]._id = realId;
                messages[tempIndex].status = 'streaming';
            }
        },
        // RESTORED: Required by initial sendMessage streaming flow
        updateAssistantText: (state, action) => {
            const { conversationId, tempId, text, status } = action.payload;
            const messages = state.messages[conversationId];
            if (!messages) return;

            const idx = messages.findIndex(m => m._id === tempId);
            if (idx !== -1) {
                messages[idx].text = text;
                messages[idx].status = status || 'streaming';

                // Update versions array during streaming
                if (messages[idx].versions && messages[idx].versions.length > 0) {
                    const currentIdx = messages[idx].currentVersion - 1;
                    if (currentIdx >= 0 && currentIdx < messages[idx].versions.length) {
                        messages[idx].versions[currentIdx].content = text;
                    }
                }
            }
        },
        // 🔄 Correct Real-Time Version Synchronization (Phase 12)
        startRetry: (state, action) => {
            const { conversationId, messageId } = action.payload;
            const messages = state.messages[conversationId];
            if (!messages) return;

            const idx = messages.findIndex(m => m._id === messageId);
            if (idx === -1) return;

            const msg = messages[idx];

            // 1. Migrate legacy text to versions if empty
            if (!msg.versions || msg.versions.length === 0) {
                msg.versions = [{
                    _id: msg.currentVersionId || `v1-${Date.now()}`,
                    content: msg.text,
                    version: 1
                }];
            }

            // 2. Push new placeholder version
            msg.versions.push({
                _id: `temp-v${msg.versions.length + 1}-${Date.now()}`,
                content: '',
                version: msg.versions.length + 1
            });

            // 3. Update active version index IMMEDIATELY
            msg.currentVersion = msg.versions.length;
            msg.text = ''; // Clear main text for streaming UI compatibility
            msg.status = 'streaming';
        },
        // APPEND chunk into ONLY the latest version
        appendMessageChunk: (state, action) => {
            const { conversationId, messageId, chunk } = action.payload;
            const list = state.messages[conversationId];
            if (!list) return;

            const idx = list.findIndex(m => m._id === messageId);
            if (idx !== -1) {
                const msg = list[idx];
                const currentIdx = msg.currentVersion ? msg.currentVersion - 1 : 0;

                if (msg.versions && msg.versions[currentIdx]) {
                    msg.versions[currentIdx].content += chunk;
                }

                // Still update main text for now to maintain compatibility with Markdown component
                // until we refactor MessageItem fully
                msg.text = (msg.text || '') + chunk;
                msg.status = 'streaming';
            }
        },
        // INSTANT UI SYNC for version switching
        switchMessageVersion: (state, action) => {
            const { conversationId, messageId, versionNumber } = action.payload;
            const list = state.messages[conversationId];
            if (!list) return;

            const idx = list.findIndex(m => m._id === messageId);
            if (idx !== -1) {
                const msg = list[idx];
                msg.currentVersion = versionNumber;

                // Keep msg.text in sync if applicable, though MessageItem handles this now
                if (msg.versions && msg.versions[versionNumber - 1]) {
                    msg.text = msg.versions[versionNumber - 1].content;
                }
            }
        },
        finalizeAssistantMessage: (state, action) => {
            const { conversationId, tempId, text, status } = action.payload;
            const list = state.messages[conversationId];
            if (!list) return;

            const idx = list.findIndex(m => m._id === tempId);
            if (idx !== -1) {
                const msg = list[idx];
                msg.status = status || 'sent';
                msg.text = text;
                msg.createdAt = new Date().toISOString();

                // Initialize or update versions array properly
                if (!msg.versions || msg.versions.length === 0) {
                    // Create first version if it doesn't exist
                    msg.versions = [{
                        content: text,
                        version: 1,
                        isActive: true
                    }];
                    msg.currentVersion = 1;
                } else if (msg.currentVersion && msg.currentVersion > 0) {
                    // Update existing version
                    msg.versions[msg.currentVersion - 1].content = text;
                }
            }
        },
        setConversationTitle: (state, action) => {
            const { conversationId, title } = action.payload;
            state.conversations = state.conversations.map(conv =>
                conv._id === conversationId ? { ...conv, title } : conv
            );
            if (state.currentConversation && state.currentConversation._id === conversationId) {
                state.currentConversation = { ...state.currentConversation, title };
            }
        },
        clearCurrentConversation: (state) => {
            state.currentConversation = null;
        },
        addMessageToConversation: (state, action) => {
            const { conversationId, message } = action.payload;
            if (!state.messages[conversationId]) {
                state.messages[conversationId] = [];
            }
            state.messages[conversationId].push(message);
        },
        setAssistantTyping(state, action) {
            const { conversationId, value } = action.payload;
            if (conversationId) {
                state.assistantTyping[conversationId] = value;
            }
        },
        clearMessages(state) {
            state.messagesPages = {};
            state.messagesLoadingMore = {};
            state.currentConversationId = null;
        },
        clearError: (state) => {
            state.error = null;
        },
        clearMessageText: (state, action) => {
            const { conversationId, messageId } = action.payload;
            const messages = state.messages[conversationId];
            if (messages) {
                const idx = messages.findIndex(m => m._id === messageId);
                if (idx !== -1) {
                    messages[idx] = {
                        ...messages[idx],
                        text: '',
                        status: 'streaming'
                    };
                }
            }
        },
        // ✅ NEW: Mark message as retrying WITHOUT clearing text
        markRetrying: (state, action) => {
            const { conversationId, messageId } = action.payload;
            const messages = state.messages[conversationId];
            if (!messages) return;

            const idx = messages.findIndex(m => m._id === messageId);
            if (idx !== -1) {
                messages[idx].status = 'retrying'; // Set status, don't clear text
            }
        },
        // ✅ NEW: Complete retry - clear retrying flag and set final status
        completeRetry: (state, action) => {
            const { conversationId, messageId, success, error } = action.payload;
            const messages = state.messages[conversationId];
            if (!messages) return;

            const idx = messages.findIndex(m => m._id === messageId);
            if (idx !== -1) {
                const msg = messages[idx];
                msg.status = success ? 'sent' : 'failed';
                if (!success) {
                    msg.retryError = error;
                }
            }
        },
    },
    extraReducers: (builder) => {
        builder
            // Fetch conversations
            .addCase(fetchConversations.pending, (state, action) => {
                if (action.meta.arg?.append) {
                    state.conversationsLoadingMore = true;
                } else {
                    state.loading = true;
                }
                state.error = null;
            })
            .addCase(fetchConversations.fulfilled, (state, action) => {
                state.loading = false;
                state.conversationsLoadingMore = false;

                const conversations = action.payload.items || action.payload.conversations || action.payload || [];
                // Pre-format dates to avoid formatting on every render
                const formattedConversations = conversations.map(conv => ({
                    ...conv,
                    formattedDate: conv.createdAt ? new Date(conv.createdAt).toLocaleDateString() : ''
                }));

                if (action.payload.append) {
                    // Append for infinite scroll
                    // state.conversations = [...state.conversations, ...formattedConversations];
                    const existingIds = new Set(state.conversations.map(c => c._id));
                    formattedConversations.forEach(conv => {
                        if (!existingIds.has(conv._id)) {
                            state.conversations.push(conv);
                        }
                    });
                } else {
                    // Replace for initial load
                    state.conversations = formattedConversations;
                }

                state.conversationsPage = action.payload.page || 1;
                state.conversationsHasMore = formattedConversations.length === 20; // Assuming limit is 20
            })
            .addCase(fetchConversations.rejected, (state, action) => {
                state.loading = false;
                state.conversationsLoadingMore = false;
                state.error = action.payload;
            })
            // Create conversation
            .addCase(createConversation.fulfilled, (state, action) => {
                const newConv = {
                    ...action.payload,
                    formattedDate: action.payload.createdAt ? new Date(action.payload.createdAt).toLocaleDateString() : ''
                };
                state.conversations.unshift(newConv);
                state.currentConversation = action.payload;
                state.messages[action.payload._id] = [];
            })
            // Fetch messages
            .addCase(fetchMessages.pending, (state, action) => {
                const { conversationId, append } = action.meta.arg || {};
                if (append) {
                    state.messagesLoadingMore[conversationId] = true;
                } else {
                    state.loading = true;
                }
            })
            .addCase(fetchMessages.fulfilled, (state, action) => {
                const { conversationId, items, append, hasMore, page } = action.payload;
                state.loading = false;
                state.messagesLoadingMore[conversationId] = false;

                // Initialize currentVersion for messages with multiple versions
                const processedItems = (items || []).map(item => ({
                    ...item,
                    // Default to latest version if versions exist, otherwise default to 1
                    currentVersion: item.currentVersion || (item.versions?.length || 1)
                }));

                const existing = state.messages[conversationId] || [];
                if (append) {
                    // Prepend older messages for infinite scroll (scrolling up)
                    state.messages[conversationId] = [...processedItems, ...existing];
                } else {
                    // Replace for initial load
                    if (existing.length === 0) {
                        state.messages[conversationId] = processedItems;
                    }
                }

                // Update pagination state
                if (!state.messagesPages[conversationId]) {
                    state.messagesPages[conversationId] = { page: 1, hasMore: true };
                }
                state.messagesPages[conversationId].page = page || 1;
                state.messagesPages[conversationId].hasMore = hasMore !== false;
            })
            .addCase(fetchMessages.rejected, (state, action) => {
                const { conversationId } = action.meta.arg || {};
                state.loading = false;
                if (conversationId) {
                    state.messagesLoadingMore[conversationId] = false;
                }
                state.error = action.payload;
            })
            // Send message
            .addCase(sendMessage.pending, (state) => {
                state.sending = true;
                state.error = null;
            })
            .addCase(sendMessage.fulfilled, (state, action) => {
                state.sending = false;
                const { conversationId } = action.payload;
                if (conversationId) {
                    state.assistantTyping[conversationId] = false;
                }
            })
            .addCase(sendMessage.rejected, (state, action) => {
                state.sending = false;
                state.error = action.payload;
                const { conversationId } = action.meta.arg;
                if (conversationId) {
                    state.assistantTyping[conversationId] = false;
                }
            })
            // Rename conversation title
            .addCase(renameConversationTitle.fulfilled, (state, action) => {
                const updatedConv = action.payload;
                state.currentConversation = { ...state.currentConversation, title: updatedConv.title };
                state.conversations = state.conversations.map(conv =>
                    conv._id === updatedConv._id ? { ...conv, title: updatedConv.title } : conv
                )
            })
            .addCase(renameConversationTitle.rejected, (state, action) => {
                state.error = action.payload || 'Failed to rename conversation title';
            })
            // Delete conversation
            .addCase(deleteConversation.fulfilled, (state, action) => {
                const deletedConvId = action.payload;
                state.conversations = state.conversations.filter(conv => conv._id !== deletedConvId);
                if (state.currentConversation && state.currentConversation._id === deletedConvId) {
                    state.currentConversation = null;
                }
            })
            .addCase(deleteConversation.rejected, (state, action) => {
                state.error = action.payload || 'Failed to delete conversation';
            })
            // update Conversation Model
            .addCase(updateConversationModel.fulfilled, (state, action) => {
                const updatedConv = action.payload;

                // Update in conversations list
                state.conversations = state.conversations.map(conv =>
                    conv._id === updatedConv._id
                        ? { ...conv, selectedModelId: updatedConv.selectedModelId }
                        : conv
                );

                // Update current conversation
                if (
                    state.currentConversation &&
                    state.currentConversation._id === updatedConv._id
                ) {
                    state.currentConversation = {
                        ...state.currentConversation,
                        selectedModelId: updatedConv.selectedModelId,
                    };
                }
            })
            .addCase(updateConversationModel.rejected, (state, action) => {
                state.error = action.payload;
            })
            // Update message text when version is switched
            .addCase(switchVersion.fulfilled, (state, action) => {
                const { messageId, conversationId, message } = action.payload;
                const messages = state.messages[conversationId];
                if (messages) {
                    const idx = messages.findIndex(m => m._id === messageId);
                    if (idx !== -1) {
                        messages[idx] = {
                            ...messages[idx],
                            text: message.content,
                            version: message.version,
                            currentVersionId: message._id
                        };
                    }
                }
            })
            // Update message list when retried (re-fetch or update)
            .addCase(retryMessage.fulfilled, (state, action) => {
                const { messageId, conversationId, message } = action.payload;
                const messages = state.messages[conversationId];
                if (messages) {
                    const idx = messages.findIndex(m => m._id === messageId);
                    if (idx !== -1) {
                        // The backend 'retry' likely returns the updated parent message or the new version
                        // Assuming it returns the updated parent message structure with new content
                        messages[idx] = {
                            ...messages[idx],
                            text: message.content,
                            version: message.version,
                            currentVersionId: message._id,
                            versions: message.versions // Update versions array
                        };
                    }
                }
            })
            // RESET STATE ON LOGOUT
            .addCase(logout.fulfilled, () => {
                return initialState;
            });

    },
});

export const {
    setCurrentConversation,
    clearCurrentConversation,
    addMessageToConversation,
    setAssistantTyping,
    addAssistantPlaceholder,
    updatePendingPlaceholderWithRealId,
    updateAssistantText,
    finalizeAssistantMessage,
    setConversationTitle,
    clearMessages,
    clearError,
    clearMessageText,
    appendMessageChunk,
    startRetry,
    switchMessageVersion,
} = conversationSlice.actions;
export default conversationSlice.reducer;