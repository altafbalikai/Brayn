import React from "react";
import ConversationItem from "./ConversationItem";

/**
 * @typedef {Object} Conversation
 * @property {string} _id
 * @property {string} title
 * @property {string} createdAt
 */

/**
 * Render list of conversation items.
 * @param {{conversations: Conversation[], currentConversationId?: string, onSelectConversation: function}} props
 */
function ConversationListItems({
  conversations,
  currentConversationId,
  onSelectConversation,
  onRenameConversation,
  onDeleteConversation,
  isRenamingTitle,
}) {
  return (
    <>
      {conversations.map((conv) => (
        <ConversationItem
          key={conv._id}
          conv={conv}
          isActive={currentConversationId === conv._id}
          onSelect={onSelectConversation}
          onRename={onRenameConversation}
          onDelete={onDeleteConversation}
          isRenamingTitle={isRenamingTitle}
        />
      ))}
    </>
  );
}

export default React.memo(ConversationListItems);
