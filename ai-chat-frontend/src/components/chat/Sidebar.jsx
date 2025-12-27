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
  loading,
  conversationsLoadingMore,
  onSelectConversation,
  containerRef,
  onScroll,
}) {
  return (
    <div className="w-full bg-theme-dark border-r border-theme-secondary flex flex-col h-full overflow-hidden">
      <NewChatControl onNewChat={onNewChat} toggleSidebar={toggleSidebar} />

      {/* Right Side: New Chat Button */}
      <button
        onClick={onNewChat}
        className="flex items-center gap-1.5 py-1.5 px-3 text-theme-text rounded-md hover:bg-opacity-90 transition-all font-medium text-ms"
      >
        <IoIosAddCircle size={28} className="text-base text-3xl" />
        <span>New Chat</span>
      </button>

      <p className="text-theme-muted pl-3 p-1">Recents</p>

      <ConversationList
        conversations={conversations}
        currentConversationId={currentConversationId}
        loading={loading}
        conversationsLoadingMore={conversationsLoadingMore}
        onSelectConversation={onSelectConversation}
        containerRef={containerRef}
        onScroll={onScroll}
      />
      <SidebarFooter user={user} onLogout={onLogout} />
    </div>
  );
}
