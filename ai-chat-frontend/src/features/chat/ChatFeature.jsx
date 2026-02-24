import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom"; // Import routing hooks
import {
  VirtualizedMessageList,
  Composer,
  Sidebar,
  ConversationItem,
} from "./components";
import RewindBackground from "../../components/ui/RewindBackground.jsx";
import NewChatHero from "./components/NewChatHero";
import {
  TbLayoutSidebarLeftExpand,
} from "react-icons/tb";

// Hooks
import { useChatMessages } from "./hooks/useChatMessages";
import { useChatScroll } from "./hooks/useChatScroll";
import { useChatActions } from "./hooks/useChatActions";
import { useChatSidebar } from "./hooks/useChatSidebar";
import { useLLMIntegration } from "./hooks/useLLMIntegration";
import { useCurrentUser } from "./hooks/useCurrentUser";

export default function ChatFeature() {
  const { conversationId } = useParams(); // Get ID from URL
  const navigate = useNavigate();

  // 1. Integrations & Data
  const user = useCurrentUser();
  const { 
    llmmodels, 
    selectedModelId, 
    llmsloading, 
    memoizedLLMModels 
  } = useLLMIntegration();

  const {
    currentConversation,
    conversations,
    loading,
    currentMessages,
    groupedMessages,
    conversationsHasMore,
    conversationsLoadingMore,
    conversationsPage,
    messagesPages,
    messagesLoadingMore,
    messagesLoading
  } = useChatMessages(conversationId); // Pass ID to hook

  // 2. Actions
  const {
    sending,
    assistantTyping,
    handleSelectConversation: selectConversationAction, // Renamed but probably unused now
    handleRenameConversation,
    handleDeleteConversation,
    handleNewChat: newChatAction,
    handleLogout,
    handleSendMessage,
    handlePromptClick,
    titleUpdatedRef
  } = useChatActions(currentConversation, selectedModelId);

  // 3. UI State
  const { sidebarOpen, setSidebarOpen, toggleSidebar } = useChatSidebar();
  const [isRenamingTitle, setIsRenamingTitle] = useState(false);

  // 4. Scroll Logic
  const {
    messagesEndRef,
    messagesContainerRef,
    conversationsScrollRef,
    handleConversationsScroll,
    handleMessagesScroll
  } = useChatScroll({
    currentConversation,
    messages: currentMessages,
    conversationsHasMore,
    conversationsLoadingMore,
    conversationsPage,
    messagesPages,
    messagesLoadingMore,
  });

  // UI Wrappers
  const handleSelectConversation = (conv) => {
    // Navigation instead of Action
    navigate(`/chat/${conv._id}`);
    
    if (window.innerWidth < 768 && !isRenamingTitle) {
      setSidebarOpen(false);
    }
  };

  const handleNewChatWrapper = () => {
    // Navigation instead of Action
    navigate("/chat");
    
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  // Helper
  // Draft logic: If URL has no ID, it's a new chat.
  // Or if currentConversation is a draft object returned by hook.
  const showHero = !conversationId || (currentConversation?.isDraft && (!currentConversation.messages || currentConversation.messages.length === 0));

  return (
    <>
      <div className="relative h-full w-full bg-transparent overflow-hidden flex">
        {/* Mobile Hamburger Button */}
        {!sidebarOpen && (
          <button
            className="fixed top-3 left-3 z-50 p-2 rounded-md bg-transparent z-[60] text-theme-text hover:text-theme-text transition-colors"
            onClick={toggleSidebar}
            aria-label="Toggle sidebar"
          >
            <TbLayoutSidebarLeftExpand size={24} />
          </button>
        )}

        {/* Sidebar Drawer */}
        <div
          className={`fixed inset-y-0 left-0 z-50 w-60 bg-theme-dark transform transition-transform duration-300 ease-in-out ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <Sidebar
            user={user}
            onNewChat={handleNewChatWrapper}
            toggleSidebar={toggleSidebar}
            onLogout={handleLogout}
            conversations={conversations}
            currentConversationId={currentConversation?._id}
            loading={loading}
            conversationsLoadingMore={conversationsLoadingMore}
            onSelectConversation={handleSelectConversation}
            onRenameConversation={handleRenameConversation}
            onDeleteConversation={handleDeleteConversation}
            isRenamingTitle={setIsRenamingTitle}
            containerRef={conversationsScrollRef}
            onScroll={handleConversationsScroll}
          />
        </div>
        
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main Chat Area */}
        <div
          className={`flex-1 flex flex-col min-h-0 overflow-auto transition-[margin] duration-300 ease-in-out ${
            sidebarOpen ? "md:ml-64" : "md:ml-0"
          }`}
        >
          {!currentConversation?._id && <RewindBackground />}
          <div className="flex-1 flex flex-col min-h-0 min-w-0 relative overflow-hidden">
            {showHero ? (
              <div className="flex-1 flex items-center justify-center px-4">
                <div className="max-w-4xl w-full mb-[8rem] overflow-hidden">
                  <NewChatHero
                    onNewChat={handleNewChatWrapper}
                    onPromptClick={handlePromptClick}
                    showPrompts
                    showComposer
                    Composer={(props) => (
                      <Composer
                        {...props}
                        onSend={handleSendMessage}
                        disabled={sending || assistantTyping}
                        position="center"
                        currentConversation={currentConversation}
                        currentConversationId={currentConversation?._id}
                        llmmodels={memoizedLLMModels}
                        selectedModelId={selectedModelId}
                        llmsloading={llmsloading}
                      />
                    )}
                  />
                </div>
              </div>
            ) : (
              <>
                <VirtualizedMessageList
                  messages={currentMessages}
                  messagesEndRef={messagesEndRef}
                  containerRef={messagesContainerRef}
                  onScroll={handleMessagesScroll}
                  groupedMessages={groupedMessages}
                  isLoadingMore={messagesLoadingMore?.[currentConversation._id]}
                  isLoading={messagesLoading}
                />
                
                <Composer
                  onSend={handleSendMessage}
                  disabled={sending || assistantTyping}
                  currentConversation={currentConversation}
                  currentConversationId={currentConversation?._id}
                  llmmodels={memoizedLLMModels}
                  selectedModelId={selectedModelId}
                  llmsloading={llmsloading}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
