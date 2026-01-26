import React from "react";

/**
 * Loading state for conversations list.
 */
function ConversationListLoading() {
  return (
    <div className="px-3 py-0.5 space-y-3 flex-1 overflow-hidden">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-8 w-full rounded-lg shimmer" />
      ))}
    </div>
  );
}

export default React.memo(ConversationListLoading);
