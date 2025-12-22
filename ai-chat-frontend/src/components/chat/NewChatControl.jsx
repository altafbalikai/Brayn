import React from "react";
import { MdOutlinePostAdd } from "react-icons/md";
import { GiBrain } from "react-icons/gi";

/**
 * NewChatControl - presentational New Chat button
 * @param {{onNewChat: function}} props
 */
function NewChatControl({ onNewChat }) {
  return (
    <div className="p-3 border-b border-theme-secondary flex items-center justify-between">
      {/* Left Side: Logo/Icon */}
      <div className="flex items-center gap-2">
        <GiBrain size={28} className="text-theme-text text-2xl" />
        {/* <span className="font-bold text-theme-secondary text-sm hidden sm:block">
          BrainAI
        </span> */}
      </div>

      {/* Right Side: New Chat Button */}
      <button
        onClick={onNewChat}
        className="flex items-center gap-1.5 py-1.5 px-3 bg-theme-secondary text-theme-text rounded-md hover:bg-opacity-90 transition-all font-medium text-xs"
      >
        <MdOutlinePostAdd size={20} className="text-base text-3xl" />
        <span>New Chat</span>
      </button>
    </div>
  );
}

export default React.memo(NewChatControl);
