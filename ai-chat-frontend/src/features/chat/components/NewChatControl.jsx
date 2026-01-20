import React from "react";
import { GrAddCircle } from "react-icons/gr";
import { GiBrain } from "react-icons/gi";
import {
  TbLayoutSidebarLeftCollapse,
  TbLayoutSidebarLeftExpand,
} from "react-icons/tb";
import { IoIosAddCircle } from "react-icons/io";

/**
 * NewChatControl - presentational New Chat button
 * @param {{toggleSidebar: function}} props
 */
function NewChatControl({ toggleSidebar }) {
  return (
    <div className="p-3 border-b border-theme-secondary flex items-center justify-between">
      {/* Left Side: Logo/Icon */}
      <div className="flex items-center gap-2">
        <GiBrain size={24} className="text-theme-text text-2xl" />
        {/* <span className="font-bold text-theme-secondary text-sm hidden sm:block">
          BrainAI
        </span> */}
      </div>

      {/* Mobile Hamburger Button (Top Left) */}
      <button
        className="
                  flex items-center gap-1.5 py-1.5 px-3 text-theme-text rounded-md hover:bg-opacity-90 transition-all font-medium text-xs
                "
        onClick={toggleSidebar}
        aria-label="Toggle sidebar"
      >
        {toggleSidebar ? (
          <TbLayoutSidebarLeftCollapse size={24} />
        ) : (
          <TbLayoutSidebarLeftExpand size={24} />
        )}
      </button>
    </div>
  );
}

export default React.memo(NewChatControl);
