import { useEffect, useRef, useMemo } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { cache, CACHE_KEYS } from '../../../utils/cache';
import {
    fetchConversations,
    fetchMessages,
    setCurrentConversation,
} from '../../conversations/conversationSlice';
import { conversationService } from '../../../api/services/conversationService';
import { initializePersonaForConversation } from '../../persona/personaSlice';
import { groupMessagesByTime } from '../../../utils/messageGrouping';

export const useChatMessages = (conversationId) => {
    const dispatch = useDispatch();
    const hydratedRef = useRef({});
    const conversationHydrationRef = useRef({});

    // Selectors
    const conversations = useSelector(
        (state) => state.conversation.conversations,
        shallowEqual
    );
    const currentConversationFromState = useSelector(
        (state) => state.conversation.currentConversation
    );

    // URL is authoritative for "new chat" mode; Redux is authoritative for in-app branch switches.
    const currentConversation = useMemo(() => {
        if (!conversationId) {
            return currentConversationFromState?.isDraft
                ? currentConversationFromState
                : { isDraft: true, messages: [] };
        }

        if (currentConversationFromState?._id || currentConversationFromState?.isDraft) {
            return currentConversationFromState;
        }

        return conversations.find((c) => c._id === conversationId) || { _id: conversationId };
    }, [conversations, conversationId, currentConversationFromState]);

    const messages = useSelector(
        (state) => state.conversation.messages
    );

    const loading = useSelector((state) => state.conversation.loading);

    const conversationsHasMore = useSelector(
        (state) => state.conversation.conversationsHasMore
    );
    const conversationsLoadingMore = useSelector(
        (state) => state.conversation.conversationsLoadingMore
    );
    const conversationsPage = useSelector(
        (state) => state.conversation.conversationsPage
    );

    const messagesPages = useSelector(
        (state) => state.conversation.messagesPages
    );
    const messagesLoadingMore = useSelector(
        (state) => state.conversation.messagesLoadingMore,
        shallowEqual
    );

    const activeConversationId = currentConversation?._id || conversationId;
    const messagesLoading =
        !!activeConversationId &&
        messagesPages?.[activeConversationId] === undefined;

    // Load conversations with cache
    useEffect(() => {
        const cached = cache.get(CACHE_KEYS.CONVERSATIONS);
        if (cached && cached.length > 0) {
            dispatch(fetchConversations({ page: 1, append: false }));
        } else {
            dispatch(fetchConversations({ page: 1, append: false }));
        }
    }, [dispatch]);

    // Cache conversations
    useEffect(() => {
        if (conversations.length > 0) {
            cache.set(CACHE_KEYS.CONVERSATIONS, conversations);
        }
    }, [conversations]);

    // Load messages when conversationId changes (URL-based)
    useEffect(() => {
        if (!conversationId) return;

        if (currentConversationFromState?._id !== conversationId) {
            const matched = conversations.find((c) => c._id === conversationId);
            if (matched) {
                dispatch(setCurrentConversation(matched));
            } else {
                if (conversationHydrationRef.current[conversationId]) return;
                conversationHydrationRef.current[conversationId] = true;

                const hydrateConversation = async () => {
                    try {
                        const conversation = await conversationService.getConversation(conversationId);
                        dispatch(setCurrentConversation(conversation));
                    } catch {
                        dispatch(setCurrentConversation({ _id: conversationId }));
                    }
                };

                hydrateConversation();
            }
        }

        if (hydratedRef.current[conversationId]) return;
        if (messages[conversationId]?.length > 0) {
            hydratedRef.current[conversationId] = true;
            return;
        }
        hydratedRef.current[conversationId] = true;

        dispatch(
            fetchMessages({
                conversationId,
                page: 1,
                append: false,
            })
        );
    }, [
        conversationId,
        currentConversationFromState?._id,
        conversations,
        messages,
        dispatch
    ]);

    // ✅ Load messages when currentConversation changes (Redux branch switch)
    useEffect(() => {
        if (!currentConversation?._id || conversationId === currentConversation._id) return;
        if (hydratedRef.current[currentConversation._id]) return;
        if (messages[currentConversation._id]?.length > 0) {
            hydratedRef.current[currentConversation._id] = true;
            return;
        }
        hydratedRef.current[currentConversation._id] = true;

        dispatch(
            fetchMessages({
                conversationId: currentConversation._id,
                page: 1,
                append: false,
            })
        );
    }, [currentConversation?._id, conversationId, messages, dispatch]);

    // Sync persona ID on conversation change
    useEffect(() => {
        if (currentConversation && !currentConversation.isDraft) {
            dispatch(initializePersonaForConversation(currentConversation.currentPersonaId));
        } else if (currentConversation?.isDraft) {
            dispatch(initializePersonaForConversation(null));
        }
    }, [conversationId, currentConversation?.currentPersonaId, dispatch]);

    // Cache messages
    useEffect(() => {
        if (activeConversationId && messages[activeConversationId]) {
            const cacheKey = CACHE_KEYS.MESSAGES(activeConversationId);
            cache.set(cacheKey, messages[activeConversationId]);
        }
    }, [messages, activeConversationId]);

    // Memoized current messages - reactive to Redux state
    // ✅ Prefer currentConversation._id (reactive to branch switches)
    // over conversationId (URL param, doesn't update on branch switch)
    const currentMessages = useMemo(() => {
        return activeConversationId ? messages[activeConversationId] || [] : [];
    }, [activeConversationId, messages]);

    // Group messages
    const groupedMessages = useMemo(() => {
        return groupMessagesByTime(currentMessages);
    }, [currentMessages]);

    return {
        messages,
        currentConversation,
        currentMessages,
        groupedMessages,
        loading,
        conversations,
        conversationsHasMore,
        conversationsLoadingMore,
        conversationsPage,
        messagesPages,
        messagesLoadingMore,
        messagesLoading,
    };
};
