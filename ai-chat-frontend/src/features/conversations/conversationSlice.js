import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { conversationService } from '../../api/services/conversationService';
import { llmService } from '../../api/services/llmService';

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
    async ({ agentId, title }, { rejectWithValue }) => {
        try {
            const data = await conversationService.createConversation(agentId, title);
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
    async ({ message, conversationId, tempAssistantId }, { dispatch, rejectWithValue }) => {
        try {
            // Add user message immediately
            const userMsg = {
                _id: `user-${Date.now()}`,
                role: 'user',
                text: message,
                createdAt: new Date().toISOString(),
                status: 'sent'
            };
            dispatch({ type: 'conversation/addMessageToConversation', payload: { conversationId, message: userMsg } });

            // Use streaming API
            const stream = llmService.askStream({ message, conversationId });
            const tempId = tempAssistantId || `temp-assistant-${Date.now()}`;

            // Add placeholder for assistant message
            dispatch({ type: 'conversation/addAssistantPlaceholder', payload: { conversationId, message: { _id: tempId, role: 'assistant', text: '', createdAt: new Date().toISOString(), status: 'streaming' } } });

            dispatch(setAssistantTyping({ conversationId, value: true }));
            let accumulated = '';

            const full = await stream.start((chunk) => {
                accumulated += chunk;
                dispatch({ type: 'conversation/updateAssistantText', payload: { conversationId, tempId, text: accumulated } });
            });

            // finalize locally
            const finalMsg = { _id: tempId, role: 'assistant', text: full, createdAt: new Date().toISOString(), status: 'sent' };
            dispatch({ type: 'conversation/finalizeAssistantMessage', payload: { conversationId, tempId, finalMsg } });

            return { conversationId, aiMessage: finalMsg };
        } catch (error) {
            const errMsg = error.message || 'Failed to stream message';
            return rejectWithValue(errMsg);
        }
    }
);

export const updateConversationTitle = createAsyncThunk(
    'conversation/updateConversationTitle',
    async ({ conversationId, title }, { rejectWithValue }) => {
        try {
            const data = await conversationService.updateConversationTitle(conversationId, title);
            return data;
        } catch (error) {
            return rejectWithValue(
                error.response?.data?.error || 'Failed to update conversation title'
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
        },
        addAssistantPlaceholder: (state, action) => {
            const { conversationId, message } = action.payload;
            if (!state.messages[conversationId]) state.messages[conversationId] = [];
            state.messages[conversationId].push(message);
        },
        updateAssistantText: (state, action) => {
            const { conversationId, tempId, text } = action.payload;
            const list = state.messages[conversationId] || [];
            const idx = list.findIndex(m => m._id === tempId);
            if (idx !== -1) {
                list[idx] = { ...list[idx], text };
            }
        },
        finalizeAssistantMessage: (state, action) => {
            const { conversationId, tempId, finalMsg } = action.payload;
            const list = state.messages[conversationId] || [];
            const idx = list.findIndex(m => m._id === tempId);
            if (idx !== -1) {
                list[idx] = finalMsg;
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

                const existing = state.messages[conversationId] || [];
                if (append) {
                    // Prepend older messages for infinite scroll (scrolling up)
                    state.messages[conversationId] = [...items, ...existing];
                } else {
                    // Replace for initial load
                    // state.messages[conversationId] = items || [];
                    if (existing.length === 0) {
                        state.messages[conversationId] = items || [];
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
            .addCase(sendMessage.pending, (state, action) => {
                state.sending = true;
                state.error = null;
            })
            .addCase(sendMessage.fulfilled, (state, action) => {
                state.sending = false;
                const { conversationId } = action.payload;
                if (conversationId) {
                    state.assistantTyping[conversationId] = false;
                }
                // Streaming flow updates messages locally via placeholder actions; nothing else required here
            })
            .addCase(sendMessage.rejected, (state, action) => {
                state.sending = false;
                state.error = action.payload;
                const { conversationId } = action.meta.arg;
                if (conversationId) {
                    state.assistantTyping[conversationId] = false;
                }
            })
            // Update conversation title
            .addCase(updateConversationTitle.fulfilled, (state, action) => {
                const updatedConv = action.payload;
                state.currentConversation = { ...state.currentConversation, title: updatedConv.title };
                state.conversations = state.conversations.map(conv =>
                    conv._id === updatedConv._id ? { ...conv, title: updatedConv.title } : conv
                )
            })
            .addCase(updateConversationTitle.rejected, (state, action) => {
                state.error = action.payload || 'Failed to update conversation title';
            });
    },
});

export const {
    setCurrentConversation,
    clearCurrentConversation,
    addMessageToConversation,
    setAssistantTyping,
    addAssistantPlaceholder,
    updateAssistantText,
    finalizeAssistantMessage,
    setConversationTitle,
    clearMessages,
    clearError,
} = conversationSlice.actions;
export default conversationSlice.reducer;
