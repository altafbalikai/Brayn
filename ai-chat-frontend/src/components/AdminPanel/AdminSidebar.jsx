import { NavLink } from "react-router-dom";
import { TbArrowLeft, TbBrain, TbSettings } from "react-icons/tb";
import {
  TbLayoutSidebarLeftCollapse,
  TbLayoutSidebarLeftExpand,
} from "react-icons/tb";
import { IoChevronBackOutline } from "react-icons/io5";
import { useEffect } from "react";
import { GiBrain } from "react-icons/gi";

export default function AdminSidebar({ onClose, onSelect }) {
  useEffect(() => {
    import("../../pages/Chat");
  }, []);

  const linkClass = ({ isActive }) =>
    `
      flex items-center gap-3 px-4 py-2 rounded-md text-sm
      ${isActive ? "bg-theme-light font-medium" : "hover:bg-theme-light"}
    `;

  return (
    <aside className="h-full flex flex-col">
      {/* Header */}
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
          onClick={onClose}
          aria-label="Toggle sidebar"
        >
          {onClose ? (
            <TbLayoutSidebarLeftCollapse size={24} />
          ) : (
            <TbLayoutSidebarLeftExpand size={24} />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-1.5 px-1 space-y-1 text-theme-text">
        <NavLink to="models" className={linkClass} onClick={onSelect}>
          <TbBrain size={18} />
          LLM Models
        </NavLink>

        <NavLink to="prompt-settings" className={linkClass} onClick={onSelect}>
          <TbSettings size={18} />
          Prompt Settings
        </NavLink>
      </nav>

      {/* Footer */}
      <div className="px-2 py-2 border-t border-theme-secondary">
        <NavLink
          to="/chat"
          className="flex items-center gap-2 px-2 py-2 text-theme-text rounded-md hover:bg-theme-secondary"
        >
          <IoChevronBackOutline size={18} />
          Back
        </NavLink>
      </div>
    </aside>
  );
}
