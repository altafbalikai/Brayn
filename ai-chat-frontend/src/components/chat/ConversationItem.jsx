import React from "react";

/**
 * ConversationItem presentational component
 * @param {{conv: {title?: string, createdAt?: string, formattedDate?: string, _id: string}, isActive?: boolean, onSelect: function}} props
 */
function ConversationItem({ conv, isActive, onSelect }) {
  return (
    <button
      onClick={() => onSelect(conv)}
      className={`w-60 text-left p-2 my-1.5 mx-[5px] rounded-xl transition-all shadow-sm ${
        isActive
          ? "bg-theme-secondary text-theme-text ring-2 ring-theme-secondary/20 shadow-md"
          : "bg-theme-accent/40 text-theme-text hover:bg-theme-accent/60 hover:translate-x-1"
      }`}
    >
      <div className="text-sm font-semibold truncate leading-tight">
        {conv.title || "Untitled"}
      </div>
      <div className="text-[11px] opacity-70 mt-1 flex justify-between items-center">
        <span>
          {conv.formattedDate ||
            (conv.createdAt
              ? new Date(conv.createdAt).toLocaleDateString()
              : "")}
        </span>
        {isActive && (
          <div className="w-1.5 h-1.5 rounded-full bg-theme-muted animate-pulse" />
        )}
      </div>
    </button>
  );
}

export default React.memo(ConversationItem);
