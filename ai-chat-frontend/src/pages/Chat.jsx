import { useEffect, useRef, useMemo, useCallback, useState } from "react";
import { useDispatch, useSelector, shallowEqual } from "react-redux";
import { useNavigate } from "react-router-dom";
import { logout } from "../features/auth/authSlice";
import { GiBrain } from "react-icons/gi";
import {
  fetchConversations,
  createConversation,
  fetchMessages,
  sendMessage,
  setCurrentConversation,
  updateConversationTitle,
  setConversationTitle,
  clearMessages,
} from "../features/conversations/conversationSlice";

import { cache, CACHE_KEYS } from "../utils/cache";
import { groupMessagesByTime } from "../utils/messageGrouping";
import {
  VirtualizedMessageList,
  Composer,
  Sidebar,
  ConversationItem,
} from "../components/chat";
import RewindBackground from "../components/ui/RewindBackground.jsx";
import NewChatHero from "../components/chat/NewChatHero";
import { isDraft } from "@reduxjs/toolkit";

// Component implementations moved to `src/components/chat/*`

export default function Chat() {
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Refs for infinite scroll
  const conversationsScrollRef = useRef(null);
  const messagesScrollRef = useRef(null);
  const loadingMoreRef = useRef(false);
  const titleUpdatedRef = useRef(false);

  // Optimized selectors with shallowEqual to prevent unnecessary re-renders
  const user = useSelector((state) => state.auth.user);
  const conversations = useSelector(
    (state) => state.conversation.conversations,
    shallowEqual
  );
  const currentConversation = useSelector(
    (state) => state.conversation.currentConversation
  );
  const messages = useSelector(
    (state) => state.conversation.messages,
    shallowEqual
  );
  const loading = useSelector((state) => state.conversation.loading);
  const sending = useSelector((state) => state.conversation.sending);
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
    (state) => state.conversation.messagesPages,
    shallowEqual
  );
  const messagesLoadingMore = useSelector(
    (state) => state.conversation.messagesLoadingMore,
    shallowEqual
  );

  const messagesLoading =
    !!currentConversation?._id &&
    messagesPages?.[currentConversation._id] === undefined;

  const assistantTyping = useSelector(
    (state) =>
      state.conversation.assistantTyping?.[currentConversation?._id] ?? false
  );

  // Load conversations with cache
  useEffect(() => {
    // Check cache first
    const cached = cache.get(CACHE_KEYS.CONVERSATIONS);
    if (cached && cached.length > 0) {
      // Use cached data, but still fetch fresh data in background
      dispatch(fetchConversations({ page: 1, append: false }));
    } else {
      dispatch(fetchConversations({ page: 1, append: false }));
    }
  }, [dispatch]);

  // Cache conversations when they update
  useEffect(() => {
    if (conversations.length > 0) {
      cache.set(CACHE_KEYS.CONVERSATIONS, conversations);
    }
  }, [conversations]);

  // Load messages with cache
  const hydratedRef = useRef({});

  useEffect(() => {
    if (!currentConversation) return;
    if (!currentConversation._id || currentConversation.isDraft) return;

    const conversationId = currentConversation._id;

    // ✅ hydrate ONLY once per conversation
    if (hydratedRef.current[conversationId]) return;
    hydratedRef.current[conversationId] = true;

    dispatch(
      fetchMessages({
        conversationId,
        page: 1,
        append: false,
      })
    );
  }, [currentConversation?._id, dispatch]);

  // Cache messages when they update
  useEffect(() => {
    if (currentConversation && messages[currentConversation._id]) {
      const cacheKey = CACHE_KEYS.MESSAGES(currentConversation._id);
      cache.set(cacheKey, messages[currentConversation._id]);
    }
  }, [messages, currentConversation]);

  // Debounced scroll function
  const scrollToBottom = useCallback(() => {
    const scrollContainer = messagesEndRef.current?.parentElement;
    if (scrollContainer) {
      const isNearBottom =
        scrollContainer.scrollHeight -
          scrollContainer.scrollTop -
          scrollContainer.clientHeight <
        100;
      if (isNearBottom) {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
      }
    }
  }, []);

  useEffect(() => {
    // Debounce scroll updates to avoid excessive scrolling
    const timeoutId = setTimeout(() => {
      scrollToBottom();
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [messages, currentConversation, scrollToBottom]);

  // Auto-scroll to bottom when conversation changes
  useEffect(() => {
    if (currentConversation) {
      const timeoutId = setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
      }, 50);
      return () => clearTimeout(timeoutId);
    }
  }, [currentConversation?._id]);

  const handleSelectConversation = useCallback(
    (conv) => {
      dispatch(setCurrentConversation(conv));
    },
    [dispatch]
  );

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setSidebarOpen(true);
      }
    };

    handleResize(); // run once
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleNewChat = useCallback(() => {
    dispatch(
      setCurrentConversation({
        _id: null,
        isDraft: true,
        agentId: "default",
        title: "New Chat",
        messages: [],
      })
    );

    titleUpdatedRef.current = false;
  }, [dispatch]);

  const handleSendMessage = useCallback(
    async (message) => {
      console.log("Sending message:", message);
      if (!message?.trim() || !currentConversation) return;
      console.log("Sending message:", message);
      const convo_title = message.trim();
      let conversationId = currentConversation._id;

      // 🟡 CREATE conversation ONLY on first message
      if (currentConversation.isDraft) {
        const MAX_TITLE_LENGTH = 40;
        let title =
          convo_title.length > MAX_TITLE_LENGTH
            ? convo_title.slice(0, MAX_TITLE_LENGTH).trim() + "…"
            : convo_title;

        const createResult = await dispatch(
          createConversation({
            agentId: currentConversation.agentId,
            title,
          })
        );

        if (!createConversation.fulfilled.match(createResult)) {
          // handle error (toast, alert, etc.)
          return;
        }

        const realConversation = createResult.payload;

        // Replace draft with real conversation
        dispatch(setCurrentConversation(realConversation));

        conversationId = realConversation._id;
      }

      const tempAssistantId = `temp-assistant-${Date.now()}`;

      await dispatch(
        sendMessage({
          message: convo_title,
          conversationId,
          tempAssistantId,
        })
      );
    },
    [dispatch, currentConversation]
  );

  const handlePromptClick = useCallback(
    async (prompt) => {
      console.log("Prompt clicked:", prompt);
      if (!prompt?.trim()) return;

      console.log("Prompt clicked:", prompt);

      const convo_title = prompt.trim();
      const MAX_TITLE_LENGTH = 40;

      const title =
        convo_title.length > MAX_TITLE_LENGTH
          ? convo_title.slice(0, MAX_TITLE_LENGTH).trim() + "…"
          : convo_title;

      // 1️⃣ Create conversation immediately
      const createResult = await dispatch(
        createConversation({
          agentId: "default",
          title,
        })
      );

      if (!createConversation.fulfilled.match(createResult)) {
        // optional: show toast
        return;
      }

      const realConversation = createResult.payload;

      // 2️⃣ Set it as current conversation
      dispatch(setCurrentConversation(realConversation));
      titleUpdatedRef.current = true;

      // 3️⃣ Send the first message
      const tempAssistantId = `temp-assistant-${Date.now()}`;

      await dispatch(
        sendMessage({
          message: convo_title,
          conversationId: realConversation._id,
          tempAssistantId,
        })
      );
    },
    [dispatch]
  );

  const handleLogout = useCallback(async () => {
    await dispatch(logout());
    dispatch(clearMessages());
    navigate("/login");
  }, [dispatch, navigate]);

  // Memoized current messages to prevent recalculation
  const currentMessages = useMemo(() => {
    return currentConversation ? messages[currentConversation._id] || [] : [];
  }, [currentConversation, messages]);

  // Group messages by time for better visual organization
  const groupedMessages = useMemo(() => {
    return groupMessagesByTime(currentMessages);
  }, [currentMessages]);

  // Infinite scroll handler for conversations
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

  // Infinite scroll handler for messages (load older messages when scrolling up)
  const handleMessagesScroll = useCallback(
    (e) => {
      const { scrollTop } = e.target;
      const conversationId = currentConversation?._id;

      if (!conversationId) return;

      const messagePageInfo = messagesPages[conversationId];
      const isLoadingMore = messagesLoadingMore[conversationId];

      // Load older messages when scrolling near top
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

  // Memoized conversation list to prevent unnecessary re-renders
  const conversationList = useMemo(() => {
    if (loading && conversations.length === 0) {
      return (
        <div className="text-theme-accent text-center py-4">Loading...</div>
      );
    }
    if (conversations.length === 0) {
      return (
        <div className="text-theme-accent text-center py-4 text-sm">
          No conversations yet
        </div>
      );
    }
    return conversations.map((conv) => (
      <ConversationItem
        key={conv._id}
        conv={conv}
        isActive={currentConversation?._id === conv._id}
        onSelect={handleSelectConversation}
      />
    ));
  }, [conversations, currentConversation, loading, handleSelectConversation]);

  const showHero =
    !currentConversation ||
    (currentConversation.isDraft &&
      (!currentConversation.messages ||
        currentConversation.messages.length === 0));

  return (
    <>
      <div className="relative h-full w-full bg-transparent overflow-hidden flex">
        {/* Mobile Hamburger Button (Top Left) */}
        <button
          className="md:hidden fixed top-3 left-3 z-50 p-2 rounded-md bg-theme-dark text-theme-muted"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open sidebar"
        >
          ☰
        </button>

        {/* Sidebar Drawer - Hidden on mobile unless opened */}
        <div
          className={`
          fixed inset-y-0 left-0 z-50 md:z-10 w-64 bg-theme-dark
          transform transition-transform duration-300
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          md:static  md:transform-none
        `}
        >
          <Sidebar
            user={user}
            onNewChat={handleNewChat}
            onLogout={handleLogout}
            conversations={conversations}
            currentConversationId={currentConversation?._id}
            loading={loading}
            conversationsLoadingMore={conversationsLoadingMore}
            onSelectConversation={handleSelectConversation}
            containerRef={conversationsScrollRef}
            onScroll={handleConversationsScroll}
          />
        </div>
        {/* Mobile overlay to close sidebar */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main Chat Area */}
        <RewindBackground />
        <div className="flex-1 flex flex-col min-h-0 min-w-0 relative overflow-hidden">
          {showHero ? (
            <div className="flex-1 flex items-center justify-center px-4">
              <div className="max-w-4xl w-full">
                <NewChatHero
                  onNewChat={handleNewChat}
                  onPromptClick={handlePromptClick}
                  showPrompts
                  showComposer
                  Composer={(props) => (
                    <Composer
                      {...props}
                      onSend={handlePromptClick}
                      disabled={sending || assistantTyping}
                      position="center"
                    />
                  )}
                />
              </div>
            </div>
          ) : (
            <>
              {/* Messages - Virtualized for long conversations */}
              <VirtualizedMessageList
                messages={currentMessages}
                messagesEndRef={messagesEndRef}
                containerRef={messagesContainerRef}
                onScroll={handleMessagesScroll}
                groupedMessages={groupedMessages}
                isLoadingMore={messagesLoadingMore[currentConversation._id]}
                isLoading={messagesLoading}
              />
              {/* sending indicator removed - streaming placeholder is rendered inside the messages list */}

              {/* <div className="flex-shrink-0"> */}
              <Composer
                onSend={handleSendMessage}
                disabled={sending || assistantTyping}
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}
