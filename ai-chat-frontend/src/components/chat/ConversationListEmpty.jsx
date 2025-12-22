import React from "react";

/**
 * Empty state for conversations list.
 */
function ConversationListEmpty() {
  return (
    <div className="text-theme-accent text-center py-4 text-sm">
      No conversations yet
    </div>
  );
}

export default React.memo(ConversationListEmpty);
