import React from "react";
import ConversationList from "./ConversationList";
import NewChatControl from "./NewChatControl";
import SidebarFooter from "./SidebarFooter";

export default function Sidebar({
  user,
  onNewChat,
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
      <NewChatControl onNewChat={onNewChat} />

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
