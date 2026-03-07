import React from "react";
import MessageItem from "./MessageItem";
import { formatGroupTime } from "../../../utils/messageGrouping";

/**
 * @param {{group: {messages: Array, timestamp: string}, isFirst?: boolean}} props
 */
function MessageGroup({ group, isFirst, conversationId, editingMessageId, branchMap, currentConversationId }) {
  // console.log("MessageGroup.jsx replainting");
  return (
    <div className="mb-4">
      {!isFirst && (
        <div className="text-center text-theme-muted my-3">
          <span className="text-xs opacity-50 bg-theme-light px-3 py-1 rounded-full">
            {formatGroupTime(group.timestamp)}
          </span>
        </div>
      )}
      <div className="space-y-1">
        {group.messages.map((msg, idx) => (
          <MessageItem
            key={msg._id || msg.id || `${msg.role}-${idx}`}
            msg={msg}
            conversationId={conversationId}
            showTime={
              group.messages.length === 1 || idx === group.messages.length - 1
            }
            editingMessageId={editingMessageId}
            branchMap={branchMap}
            currentConversationId={currentConversationId}
          />
        ))}
      </div>
    </div>
  );
}

export default React.memo(MessageGroup);
