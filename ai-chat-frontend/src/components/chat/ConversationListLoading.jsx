import React from "react";

/**
 * Loading state for conversations list.
 */
function ConversationListLoading() {
  return <div className="text-theme-accent text-center py-4">Loading...</div>;
}

export default React.memo(ConversationListLoading);
