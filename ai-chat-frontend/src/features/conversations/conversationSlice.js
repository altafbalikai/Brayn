import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { conversationService } from '../../api/services/conversationService';
import { llmService } from '../../api/services/llmService';
import { logout } from '../auth/authSlice';
import { switchVersion, retryMessage, updateModelFailover, clearModelFailover } from '../messages/messageInteractionsSlice';
import { generateUuid } from '../../api/utils/retryWithBackoff';
import { classifyError } from '../../api/utils/modelFailover';

// Helpers to normalize messages of orphaned 'streaming' status to 'cancelled'
function normalizeMessage(msg) {
    if (!msg) return msg;
    return msg.status === 'streaming'
        ? { ...msg, status: 'cancelled' }
        : msg;
}

function normalizeMessages(messages) {
    if (!Array.isArray(messages)) return messages;
    return messages.map(normalizeMessage);
}

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
    async ({ conversationId, page = 1, append = false }, { dispatch, rejectWithValue }) => {
        try {
            const useNodeTree = import.meta.env.VITE_USE_NODE_TREE === 'true';
            const data = await conversationService.getMessages(
                conversationId, page, 50, useNodeTree
            );

            if (page === 1 && import.meta.env.VITE_USE_NODE_TREE !== 'true') {
                try {
                    const conv = await conversationService.getConversation(conversationId);
                    const rootId = conv.parentConversationId || conversationId;
                    const branches = await conversationService.getBranches(conversationId);

                    branches.forEach(branch => {
                        dispatch(registerBranch({
                            originalConvId: rootId,
                            branchConvId: branch._id,
                            branchedFromMessageId: branch.branchedFromMessageId,
                            editedMessageId: branch.editedMessageId,
                            branchEditedMessageId: branch.branchEditedMessageId,
                            isRoot: branch.isRoot || false
                        }));
                    });
                } catch (branchErr) {
                    console.warn('Branch hydration failed:', branchErr.message);
                }
            }

            return {
                conversationId,
                items: data.items || data.messages || data,
                page,
                append,
                hasMore: data.hasMore !== false && (data.items || data.messages || data).length === 50,
                siblingCounts: data.siblingCounts || null,
            };
        } catch (error) {
            return rejectWithValue({
                status: error.status,
                message: error.message || 'Failed to fetch messages'
            });
        }
    }
);

export const activateNode = createAsyncThunk(
    'conversation/activateNode',
    async ({ conversationId, nodeId, targetSiblingId }, { dispatch, rejectWithValue }) => {
        try {
            const data = await conversationService.activateNode(nodeId, targetSiblingId);
            return {
                conversationId,
                activatedNodeId: data.activatedNodeId,
                updatedPath: data.updatedPath,
                siblingCounts: data.siblingCounts || null,
            };
        } catch (error) {
            return rejectWithValue(
                error.response?.data?.error || 'Failed to activate node'
            );
        }
    }
);

export const sendMessage = createAsyncThunk(
    'conversation/sendMessage',
    async ({ text, message = text, conversationId, tempAssistantId, editNodeId = null, signal: externalSignal }, { dispatch, getState, rejectWithValue }) => {
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
        const controller = new AbortController();
        abortControllers[conversationId] = controller;
        if (externalSignal) {
            if (externalSignal.aborted) {
                controller.abort();
            } else {
                externalSignal.addEventListener(
                    'abort',
                    () => controller.abort(),
                    { once: true }
                );
            }
        }
        const signal = controller.signal;

        let requestKey = generateUuid();
        let streamSucceeded = false;
        let lastError = null;

        try {
            // Add user message immediately
            const tempUserId = `user-${Date.now()}`;
            const userMsg = {
                _id: tempUserId,
                id: tempUserId,
                role: 'user',
                text: message,
                createdAt: new Date().toISOString(),
                status: 'sent'
            };
            if (editNodeId) {
                dispatch(truncateMessagesFromNode({ conversationId, fromNodeId: editNodeId }));
            }
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
                        const useWebSearch = selectUseWebSearch(getState());

                        const stream = llmService.askStream({
                            message,
                            conversationId,
                            overrideModelId: model._id,
                            editNodeId,
                            requestKey,
                            useWebSearch,
                        }, { signal });

                        let realMessageId = null;
                        let accumulated = '';

                        const onMetadata = (data) => {
                            const messageId = typeof data === 'object' ? data?.messageId : data;
                            const userMessageId = typeof data === 'object' ? data?.userMessageId : null;
                            realMessageId = messageId;
                            dispatch(updatePendingPlaceholderWithRealId({
                                conversationId,
                                tempId: tempAssistantId,
                                realId: realMessageId
                            }));

                            if (userMessageId) {
                                dispatch(updateUserMessageId({
                                    conversationId,
                                    tempId: tempUserId,
                                    realId: userMessageId
                                }));
                            }
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

                        if (signal.aborted) {
                            dispatch(setAssistantTyping({ conversationId, value: false }));
                            return rejectWithValue({ cancelled: true, conversationId });
                        }

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
                        if (signal.aborted) {
                            dispatch(setAssistantTyping({ conversationId, value: false }));
                            return rejectWithValue({ cancelled: true, conversationId });
                        }

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

export const regenerateNode = createAsyncThunk(
    'conversation/regenerateNode',
    async ({ conversationId, nodeId },
        { dispatch, rejectWithValue }) => {
        try {
            const tempAssistantId = `temp-regen-${Date.now()}`;

            // Remove the current assistant node and everything after it
            // so the placeholder streams in-place instead of appending below
            dispatch(truncateMessagesFromNode({
                conversationId,
                fromNodeId: nodeId
            }));

            dispatch(addAssistantPlaceholder({
                conversationId,
                message: {
                    _id: tempAssistantId,
                    role: 'assistant',
                    text: '',
                    status: 'pending',
                    versions: [],
                    currentVersion: 1,
                    createdAt: new Date().toISOString(),
                }
            }));

            const stream = llmService.askStream({
                message: '',
                conversationId,
                regenerateNodeId: nodeId,
                requestKey: generateUuid(),
            });

            let realAssistantId = tempAssistantId;

            const onMetadata = (data) => {
                const realId = typeof data === 'object'
                    ? data?.messageId : data;
                if (realId) {
                    realAssistantId = realId;
                    dispatch(updatePendingPlaceholderWithRealId({
                        conversationId,
                        tempId: tempAssistantId,
                        realId,
                    }));
                }
            };

            let accumulated = '';
            const onChunk = (chunk) => {
                accumulated += chunk;
                dispatch(updateAssistantText({
                    conversationId,
                    tempId: realAssistantId,
                    text: accumulated,
                    status: 'streaming',
                }));
            };

            const fullText = await stream.start(onMetadata, onChunk);

            dispatch(finalizeAssistantMessage({
                conversationId,
                tempId: realAssistantId,
                text: fullText,
                status: 'sent',
            }));

            await dispatch(fetchMessages({
                conversationId,
                page: 1,
                append: false,
            })).unwrap();

            return { conversationId, nodeId };
        } catch (error) {
            return rejectWithValue(
                error?.message || 'Regeneration failed'
            );
        }
    }
);

export const editMessage = createAsyncThunk(
    'conversation/editMessage',
    async ({ messageId, conversationId, newContent, tempAssistantId }, { dispatch, getState, rejectWithValue }) => {
        const trimmedContent = (newContent || '').trim();
        const isValidMongoId = /^[a-f\d]{24}$/i.test(messageId ?? '');

        if (!isValidMongoId) {
            console.error('[editMessage] Invalid messageId - not a MongoDB ObjectId:', messageId);
            return rejectWithValue('Cannot edit a message that is still sending.');
        }

        const state = getState();
        if (state.conversation.assistantTyping?.[conversationId]) {
            return rejectWithValue('Cannot edit while a response is streaming.');
        }
        if (!trimmedContent) {
            return rejectWithValue('Edited message cannot be empty.');
        }

        const useNodeTree = import.meta.env.VITE_USE_NODE_TREE === 'true';
        if (useNodeTree) {
            // Node Tree branching: just 'ask' again but telling backend to branch from messageId
            await dispatch(sendMessage({
                conversationId,
                message: trimmedContent,
                editNodeId: messageId,
                tempAssistantId
            })).unwrap();
            await dispatch(fetchMessages({
                conversationId,
                page: 1,
                append: false
            })).unwrap();
            return;
        }

        const currentConv = state.conversation.currentConversation;
        const selectedModelId = currentConv?.selectedModelId;
        const allModels = state.llmModels.llmmodels.filter(m => m.status === 'active');
        const selectedModel = allModels.find(m => m._id === selectedModelId);
        const otherModels = allModels.filter(m => m._id !== selectedModelId);
        const orderedModels = selectedModel ? [selectedModel, ...otherModels] : allModels;
        const maxAttempts = 5;

        let newConversationId = null;
        let rootConversationId = conversationId;
        let tempEditedUserId = null;

        try {
            const res = await llmService.branchConversation({
                conversationId,
                editedMessageId: messageId,
                newContent: trimmedContent,
            });

            newConversationId = res.newConversationId;
            const conversation = res.conversation;

            dispatch(setPendingNavigationConversationId(newConversationId));

            rootConversationId = conversation?.parentConversationId?.toString() || conversationId;
            dispatch(registerBranch({
                originalConvId: rootConversationId,
                branchConvId: newConversationId,
                branchedFromMessageId: conversation.branchedFromMessageId,
                editedMessageId: conversation.editedMessageId || messageId,
                branchEditedMessageId: conversation.branchEditedMessageId || null,
                isRoot: false
            }));

            dispatch(setBranchSwitching(true));
            const fetchResult = await dispatch(
                fetchMessages({ conversationId: newConversationId, page: 1, append: false })
            ).unwrap();
            dispatch(switchToBranch({
                conversation,
                messages: fetchResult?.items || []
            }));
            dispatch(setBranchSwitching(false));

            tempEditedUserId = `edited-user-${Date.now()}`;
            dispatch(addMessageToConversation({
                conversationId: newConversationId,
                message: {
                    _id: tempEditedUserId,
                    id: tempEditedUserId,
                    role: 'user',
                    text: trimmedContent,
                    createdAt: new Date().toISOString(),
                    status: 'sent'
                }
            }));

            if (abortControllers[newConversationId]) {
                abortControllers[newConversationId].abort();
                delete abortControllers[newConversationId];
            }
            abortControllers[newConversationId] = new AbortController();
            const signal = abortControllers[newConversationId].signal;

            let requestKey = generateUuid();
            let streamSucceeded = false;

            const placeholderMsg = {
                _id: tempAssistantId,
                role: 'assistant',
                text: '',
                createdAt: new Date().toISOString(),
                status: 'pending',
                versions: [],
                currentVersion: 1
            };
            dispatch(addAssistantPlaceholder({ conversationId: newConversationId, message: placeholderMsg }));
            dispatch(setAssistantTyping({ conversationId: newConversationId, value: true }));

            for (let modelIndex = 0; modelIndex < orderedModels.length; modelIndex++) {
                const model = orderedModels[modelIndex];
                const isModelSwitch = model._id !== selectedModelId;

                if (modelIndex > 0) {
                    requestKey = generateUuid();
                    dispatch(updateModelFailover({
                        messageId: newConversationId,
                        modelName: model.displayName || model.name || model.modelId,
                        isSwitching: true
                    }));
                }

                for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                    try {
                        const stream = llmService.askStream({
                            message: trimmedContent,
                            conversationId: newConversationId,
                            overrideModelId: model._id,
                            requestKey,
                            signal
                        });

                        let realMessageId = null;
                        let accumulated = '';

                        const onMetadata = (data) => {
                            const incomingMessageId = typeof data === 'object' ? data?.messageId : data;
                            const userMessageId = typeof data === 'object' ? data?.userMessageId : null;
                            realMessageId = incomingMessageId;
                            dispatch(updatePendingPlaceholderWithRealId({
                                conversationId: newConversationId,
                                tempId: tempAssistantId,
                                realId: realMessageId
                            }));

                            if (userMessageId && tempEditedUserId) {
                                dispatch(updateUserMessageId({
                                    conversationId: newConversationId,
                                    tempId: tempEditedUserId,
                                    realId: userMessageId
                                }));
                            }
                        };

                        const onChunk = (chunk) => {
                            accumulated += chunk;
                            if (!realMessageId) return;
                            dispatch(updateAssistantText({
                                conversationId: newConversationId,
                                tempId: realMessageId,
                                text: accumulated,
                                status: 'streaming'
                            }));
                        };

                        const full = await stream.start(onMetadata, onChunk);

                        if (realMessageId) {
                            dispatch(finalizeAssistantMessage({
                                conversationId: newConversationId,
                                tempId: realMessageId,
                                text: full,
                                status: 'sent'
                            }));
                        }

                        if (isModelSwitch) {
                            try {
                                await dispatch(updateConversationModel({
                                    conversationId: newConversationId,
                                    modelId: model._id
                                })).unwrap();
                            } catch (persistErr) {
                                console.error('Model persistence failed:', persistErr);
                            }
                        }

                        dispatch(clearModelFailover(newConversationId));
                        dispatch(setAssistantTyping({ conversationId: newConversationId, value: false }));
                        streamSucceeded = true;
                        break;
                    } catch (err) {
                        const { isUnavailable, isRetriable } = classifyError(err);

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

                if (streamSucceeded) break;
            }

            if (!streamSucceeded) {
                throw new Error('Selected LLM model is unavailable. Please try again later.');
            }

            return { conversationId: newConversationId, rootConversationId };
        } catch (error) {
            const errMsg = error.message || error.response?.data?.error || 'Failed to edit message';
            if (newConversationId) {
                dispatch(setAssistantTyping({ conversationId: newConversationId, value: false }));
                dispatch(clearModelFailover(newConversationId));
            }
            return rejectWithValue(errMsg);
        } finally {
            dispatch(setBranchSwitching(false));
            if (newConversationId) {
                delete abortControllers[newConversationId];
            }
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
    isSwitchingBranch: false,
    editingMessageId: null,
    branchMap: {},
    messages: {},
    loading: false,
    sending: false,
    error: null,
    conversationNotFound: false,
    // Pagination state
    conversationsPage: 1,
    conversationsHasMore: true,
    conversationsLoadingMore: false,
    assistantTyping: {},
    messagesPages: {}, // { conversationId: { page: 1, hasMore: true } }
    messagesLoadingMore: {},
    pendingNavigationConversationId: null,
    siblingCounts: {},
    // shape: { [conversationId]: { [messageId]: { total, position, siblingIds } } }
    useWebSearch: true,
};

const conversationSlice = createSlice({
    name: 'conversation',
    initialState,
    reducers: {
        setCurrentConversation: (state, action) => {
            state.currentConversation = action.payload;
            state.loading = false;
        },
        setBranchSwitching(state, action) {
            state.isSwitchingBranch = !!action.payload;
        },
        switchToBranch(state, action) {
            const { conversation, messages = [] } = action.payload || {};
            if (!conversation?._id) return;

            state.currentConversation = conversation;

            const conversationId = conversation._id;
            state.messages[conversationId] = normalizeMessages(messages || []).map(item => ({
                ...item,
                currentVersion: item.currentVersion || (item.versions?.length || 1)
            }));
            state.loading = false;
        },
        setPendingNavigationConversationId(state, action) {
            state.pendingNavigationConversationId = action.payload;
        },
        clearPendingNavigationConversationId(state) {
            state.pendingNavigationConversationId = null;
        },
        setEditingMessage(state, action) {
            state.editingMessageId = action.payload;
        },
        cancelEditing(state) {
            state.editingMessageId = null;
        },
        setUseWebSearch(state, action) {
            state.useWebSearch = Boolean(action.payload);
        },
        registerBranch(state, action) {
            const {
                originalConvId,
                branchConvId,
                branchedFromMessageId,
                editedMessageId = null,
                branchEditedMessageId = null,
                isRoot
            } = action.payload;
            if (!state.branchMap[originalConvId]) {
                state.branchMap[originalConvId] = [];
            }
            const existing = state.branchMap[originalConvId]
                .find(b => b.branchConvId === branchConvId);

            if (existing) {
                if (typeof branchedFromMessageId !== 'undefined') {
                    existing.branchedFromMessageId = branchedFromMessageId;
                }
                if (editedMessageId) {
                    existing.editedMessageId = editedMessageId;
                }
                if (branchEditedMessageId) {
                    existing.branchEditedMessageId = branchEditedMessageId;
                }
                if (isRoot) {
                    existing.isRoot = true;
                }
            } else {
                state.branchMap[originalConvId].push({
                    branchConvId,
                    branchedFromMessageId,
                    editedMessageId,
                    branchEditedMessageId,
                    isRoot: isRoot || false,
                    createdAt: new Date().toISOString()
                });
            }
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
        updateUserMessageId: (state, action) => {
            const { conversationId, tempId, realId } = action.payload;
            const messages = state.messages[conversationId];
            if (!messages) return;

            const idx = messages.findIndex((m) =>
                m._id === tempId ||
                m.id === tempId ||
                m._id?.toString() === tempId?.toString() ||
                m.id?.toString() === tempId?.toString()
            );
            if (idx !== -1) {
                const normalizedRealId = realId?.toString();
                messages[idx]._id = normalizedRealId;
                messages[idx].id = normalizedRealId;
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
            state.messages[conversationId].push(normalizeMessage(message));
        },
        truncateMessagesFromNode: (state, action) => {
            const { conversationId, fromNodeId } = action.payload;
            const msgs = state.messages[conversationId];
            if (!msgs) return;
            const idx = msgs.findIndex(
                m => String(m._id) === String(fromNodeId)
            );
            if (idx !== -1) {
                state.messages[conversationId] = msgs.slice(0, idx);
            }
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
                const rootConversations = formattedConversations.filter(conv => !conv.parentConversationId);

                if (action.payload.append) {
                    // Append for infinite scroll
                    // state.conversations = [...state.conversations, ...formattedConversations];
                    const existingIds = new Set(state.conversations.map(c => c._id));
                    rootConversations.forEach(conv => {
                        if (!conv.parentConversationId && !existingIds.has(conv._id)) {
                            state.conversations.push(conv);
                        }
                    });
                } else {
                    // Replace for initial load
                    state.conversations = rootConversations;
                }

                state.conversationsPage = action.payload.page || 1;
                state.conversationsHasMore = rootConversations.length === 20; // Assuming limit is 20
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
                if (!newConv.parentConversationId) {
                    state.conversations.unshift(newConv);
                }
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
                    state.conversationNotFound = false;
                }
            })
            .addCase(fetchMessages.fulfilled, (state, action) => {
                const { conversationId, items, append, hasMore, page } = action.payload;
                state.loading = false;
                state.messagesLoadingMore[conversationId] = false;

                // Initialize currentVersion and normalize statuses
                const processedItems = normalizeMessages(items || []).map(item => ({
                    ...item,
                    // Default to latest version if versions exist, otherwise default to 1
                    currentVersion: item.currentVersion || (item.versions?.length || 1)
                }));

                const existing = state.messages[conversationId] || [];
                if (append) {
                    // Prepend older messages for infinite scroll (scrolling up)
                    state.messages[conversationId] = [...processedItems, ...existing];
                } else {
                    // Replace with latest server state for hydration/sync correctness.
                    state.messages[conversationId] = processedItems;
                }

                if (action.payload.siblingCounts) {
                    state.siblingCounts[conversationId] = action.payload.siblingCounts;
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
                const errorPayload = action.payload;
                if (errorPayload?.status === 404) {
                    state.conversationNotFound = true;
                    state.error = null;
                } else {
                    state.error = errorPayload?.message || 'Failed to fetch messages';
                }
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
                if (action.payload?.cancelled) {
                    state.sending = false;
                    const cid = action.payload.conversationId ?? action.meta.arg.conversationId;
                    if (cid) state.assistantTyping[cid] = false;
                    return;
                }
                state.sending = false;
                state.error = action.payload;
                const { conversationId } = action.meta.arg;
                if (conversationId) {
                    state.assistantTyping[conversationId] = false;
                }
            })
            // Edit message
            .addCase(editMessage.pending, (state) => {
                state.sending = true;
                state.error = null;
            })
            .addCase(editMessage.fulfilled, (state, action) => {
                state.sending = false;
                state.editingMessageId = null;
                const { conversationId } = action.payload;
                if (conversationId) {
                    state.assistantTyping[conversationId] = false;
                }
            })
            .addCase(editMessage.rejected, (state, action) => {
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
            })
            .addCase(activateNode.fulfilled, (state, action) => {
                const { conversationId, updatedPath, siblingCounts } = action.payload;
                if (!updatedPath?.length) return;
                state.editingMessageId = null;
                const existingMessages = state.messages[conversationId] || [];
                const firstUpdatedId = String(updatedPath[0]._id);
                const splitIndex = existingMessages.findIndex(
                    m => String(m._id) === firstUpdatedId
                );
                if (splitIndex === -1) {
                    state.messages[conversationId] = normalizeMessages(updatedPath);
                } else {
                    state.messages[conversationId] = [
                        ...existingMessages.slice(0, splitIndex),
                        ...normalizeMessages(updatedPath),
                    ];
                }

                if (siblingCounts) {
                    state.siblingCounts[conversationId] = {
                        ...(state.siblingCounts[conversationId] || {}),
                        ...siblingCounts,
                    };
                }
            })
            .addCase(activateNode.pending, (state) => {
                // No loading state needed — version switch is instant in UI
            })
            .addCase(activateNode.rejected, (state, action) => {
                state.error = action.payload || 'Failed to activate node';
            });

    },
});

export const {
    setCurrentConversation,
    setBranchSwitching,
    switchToBranch,
    setPendingNavigationConversationId,
    clearPendingNavigationConversationId,
    setEditingMessage,
    cancelEditing,
    registerBranch,
    clearCurrentConversation,
    addMessageToConversation,
    setAssistantTyping,
    addAssistantPlaceholder,
    updatePendingPlaceholderWithRealId,
    updateUserMessageId,
    updateAssistantText,
    finalizeAssistantMessage,
    setConversationTitle,
    clearMessages,
    clearError,
    clearMessageText,
    appendMessageChunk,
    startRetry,
    switchMessageVersion,
    truncateMessagesFromNode,
    setUseWebSearch,
} = conversationSlice.actions;

export const selectUseWebSearch = (state) => state.conversation.useWebSearch;
export default conversationSlice.reducer;

