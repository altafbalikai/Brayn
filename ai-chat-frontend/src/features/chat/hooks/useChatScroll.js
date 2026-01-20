import { useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { useDispatch } from 'react-redux';
import { fetchConversations, fetchMessages } from '../../conversations/conversationSlice';

export const useChatScroll = ({
    currentConversation,
    messages,
    conversationsHasMore,
    conversationsLoadingMore,
    conversationsPage,
    messagesPages,
    messagesLoadingMore,
}) => {
    const dispatch = useDispatch();
    const loadingMoreRef = useRef(false);

    // Own refs to prevent undefined/contract violations
    const messagesEndRef = useRef(null);
    const messagesContainerRef = useRef(null);
    const conversationsScrollRef = useRef(null);

    // Debounced scroll function
    const scrollToBottom = useCallback(() => {
        // Try scrolling via ref first (best for non-virtualized)
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "auto" });
            return;
        }

        // Fallback: Scroll container directly (required for virtualization or initial load)
        if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
    }, []);

    // Auto-scroll on content updates
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            scrollToBottom();
        }, 100);
        return () => clearTimeout(timeoutId);
    }, [messages, currentConversation, scrollToBottom]);

    // Auto-scroll on new conversation (Initial load)
    useLayoutEffect(() => {
        if (currentConversation) {
            // Immediate scroll attempt for fast hydration
            scrollToBottom();

            // Retry after short delay to catch render
            const timeoutId = setTimeout(() => {
                scrollToBottom();
            }, 50);
            return () => clearTimeout(timeoutId);
        }
    }, [currentConversation?._id, scrollToBottom]);

    // Infinite scroll: Conversations
    const handleConversationsScroll = useCallback(
        (e) => {
            const { scrollTop, scrollHeight, clientHeight } = e.target;
            const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;

            if (
                isNearBottom &&
                conversationsHasMore &&
                !conversationsLoadingMore &&
                !loadingMoreRef.current
            ) {
                loadingMoreRef.current = true;
                dispatch(
                    fetchConversations({ page: conversationsPage + 1, append: true })
                ).finally(() => {
                    loadingMoreRef.current = false;
                });
            }
        },
        [
            conversationsHasMore,
            conversationsLoadingMore,
            conversationsPage,
            dispatch,
        ]
    );

    // Infinite scroll: Messages
    const handleMessagesScroll = useCallback(
        (e) => {
            const { scrollTop } = e.target;
            const conversationId = currentConversation?._id;

            if (!conversationId) return;

            const messagePageInfo = messagesPages?.[conversationId];
            const isLoadingMore = messagesLoadingMore?.[conversationId];

            if (
                scrollTop < 200 &&
                messagePageInfo?.hasMore &&
                !isLoadingMore &&
                !loadingMoreRef.current
            ) {
                loadingMoreRef.current = true;
                dispatch(
                    fetchMessages({
                        conversationId,
                        page: (messagePageInfo.page || 1) + 1,
                        append: true,
                    })
                ).finally(() => {
                    loadingMoreRef.current = false;
                });
            }
        },
        [currentConversation, messagesPages, messagesLoadingMore, dispatch]
    );

    return {
        messagesEndRef,
        messagesContainerRef,
        conversationsScrollRef,
        scrollToBottom,
        handleConversationsScroll,
        handleMessagesScroll,
    };
};
