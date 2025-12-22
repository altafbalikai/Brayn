import React, { useMemo } from "react";
import ConversationListItems from "./ConversationListItems";
import ConversationListEmpty from "./ConversationListEmpty";
import ConversationListLoading from "./ConversationListLoading";

/**
 * ConversationList (presentational container)
 * @param {{conversations: Array, currentConversationId?: string, loading: boolean, conversationsLoadingMore: boolean, onSelectConversation: function, containerRef: any, onScroll: function}} props
 */
function ConversationList({
  conversations,
  currentConversationId,
  loading,
  conversationsLoadingMore,
  onSelectConversation,
  containerRef,
  onScroll,
}) {
  const content = useMemo(() => {
    if (loading && (!conversations || conversations.length === 0)) {
      return <ConversationListLoading />;
    }
    if (!conversations || conversations.length === 0) {
      return <ConversationListEmpty />;
    }
    return (
      <ConversationListItems
        conversations={conversations}
        currentConversationId={currentConversationId}
        onSelectConversation={onSelectConversation}
      />
    );
  }, [conversations, loading, currentConversationId, onSelectConversation]);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-x-hidden overflow-y-auto min-h-0"
      onScroll={onScroll}
    >
      {content}
      {conversationsLoadingMore && (
        <div className="text-theme-accent text-center py-2 text-sm">
          Loading more...
        </div>
      )}
    </div>
  );
}

export default React.memo(ConversationList);
