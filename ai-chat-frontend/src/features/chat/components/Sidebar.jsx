import React from "react";
import ConversationList from "./ConversationList";
import NewChatControl from "./NewChatControl";
import SidebarFooter from "./SidebarFooter";
import { IoIosAddCircle } from "react-icons/io";

export default function Sidebar({
  user,
  onNewChat,
  toggleSidebar,
  onLogout,
  conversations,
  currentConversationId,
  footerConversationId,
  loading,
  conversationsLoadingMore,
  onSelectConversation,
  onRenameConversation,
  onDeleteConversation,
  isRenamingTitle,
  containerRef,
  onScroll,
}) {
  return (
    <div className="w-full bg-theme-dark border-r border-theme-secondary flex flex-col h-full overflow-hidden">
      <NewChatControl onNewChat={onNewChat} toggleSidebar={toggleSidebar} />

      {/* Right Side: New Chat Button */}
      <button
        onClick={onNewChat}
        className="flex items-center gap-1.5 py-1.5 px-3 text-theme-text rounded-md hover:bg-theme-secondary transition-all font-medium text-ms"
      >
        <IoIosAddCircle size={20} className="text-base text-3xl" />
        <span>New chat</span>
      </button>

      <p className="text-theme-muted text-[14px] pl-3 p-1">Recents</p>

      <ConversationList
        conversations={conversations}
        currentConversationId={currentConversationId}
        loading={loading}
        conversationsLoadingMore={conversationsLoadingMore}
        onSelectConversation={onSelectConversation}
        onRenameConversation={onRenameConversation}
        onDeleteConversation={onDeleteConversation}
        isRenamingTitle={isRenamingTitle}
        containerRef={containerRef}
        onScroll={onScroll}
      />
      <SidebarFooter
        user={user}
        onLogout={onLogout}
        conversationId={footerConversationId || currentConversationId}
      />
    </div>
  );
}
