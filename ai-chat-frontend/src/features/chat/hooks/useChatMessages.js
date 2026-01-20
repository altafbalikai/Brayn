import { useEffect, useRef, useMemo } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { cache, CACHE_KEYS } from '../../../utils/cache';
import {
    fetchConversations,
    fetchMessages,
} from '../../conversations/conversationSlice';
import { groupMessagesByTime } from '../../../utils/messageGrouping';

export const useChatMessages = (conversationId) => {
    const dispatch = useDispatch();
    const hydratedRef = useRef({});

    // Selectors
    const conversations = useSelector(
        (state) => state.conversation.conversations,
        shallowEqual
    );

    // Derived State: Single Source of Truth from URL params
    const currentConversation = useMemo(() => {
        if (!conversationId) return { isDraft: true, messages: [] };
        return conversations.find((c) => c._id === conversationId) || { _id: conversationId };
    }, [conversations, conversationId]);

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

    const messagesLoading =
        !!conversationId &&
        messagesPages?.[conversationId] === undefined;

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

    // Load messages
    useEffect(() => {
        if (!conversationId) return;

        if (hydratedRef.current[conversationId]) return;
        hydratedRef.current[conversationId] = true;

        dispatch(
            fetchMessages({
                conversationId,
                page: 1,
                append: false,
            })
        );
    }, [conversationId, dispatch]);

    // Cache messages
    useEffect(() => {
        if (conversationId && messages[conversationId]) {
            const cacheKey = CACHE_KEYS.MESSAGES(conversationId);
            cache.set(cacheKey, messages[conversationId]);
        }
    }, [messages, conversationId]);

    // Memoized current messages
    const currentMessages = useMemo(() => {
        return conversationId ? messages[conversationId] || [] : [];
    }, [conversationId, messages]);

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
