import React, { useEffect, useRef, useState } from "react";
import { PiDotsThreeBold } from "react-icons/pi";
import ConversationMenuItem from "./ConversationMenuItem";
import { MdOutlineUpdate } from "react-icons/md";
import ModalPortal from "../ui/ModalPortal";

/**
 * ConversationItem presentational component
 * @param {{conv: {title?: string, createdAt?: string, formattedDate?: string, _id: string}, isActive?: boolean, onSelect: function}} props
 */
function ConversationItem({
  conv,
  isActive,
  onSelect,
  onRename,
  onDelete,
  isRenamingTitle,
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);
  const [menuPos, setMenuPos] = useState(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(conv.title || "");
  const inputRef = useRef(null);
  const MENU_HEIGHT = 180; // approximate menu height

  const handleMenuOpen = (e) => {
    e.stopPropagation();

    const el = buttonRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const viewportHeight = window.innerHeight;

    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;

    const openUpwards = spaceBelow < MENU_HEIGHT && spaceAbove > spaceBelow;

    const left = Math.min(rect.right + 8, window.innerWidth - 200);

    setMenuPos({
      left: left,
      top: openUpwards
        ? rect.top - 8 // above dots
        : rect.bottom + 8, // below dots
      placement: openUpwards ? "top" : "bottom",
    });

    setOpen(true);
  };

  useEffect(() => {
    if (isRenaming) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [isRenaming]);

  const commitRename = () => {
    const newTitle = draftTitle.trim();
    setIsRenaming(false);

    if (!newTitle || newTitle === conv.title) return;

    onRename(conv._id, newTitle); // send to parent / API
  };

  const startRename = () => {
    setIsRenaming(true);
    isRenamingTitle?.(true); // 🔔 notify parent
  };

  const cancelRename = () => {
    setDraftTitle(conv.title || "");
    setIsRenaming(false);
  };

  // Close menu on outside click
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div
      onClick={() => onSelect(conv)}
      className={`
        group relative
        flex items-center gap-2
        px-3 py-0.5
        rounded-lg
        cursor-pointer
        transition-colors
        text-theme-textaccent
        ${isActive ? "bg-theme-secondary" : "hover:bg-theme-light"}
      `}
    >
      {/* Title + Title rename input */}
      <div className="flex-1 min-w-0">
        {isRenaming ? (
          <input
            ref={inputRef}
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitRename();
              }
              if (e.key === "Escape") {
                cancelRename();
              }
            }}
            onBlur={commitRename}
            className="
              w-full
              bg-transparent
              text-sm font-medium
              outline-none
              border-b border-theme-secondary
              text-theme-text
            "
          />
        ) : (
          <div className="text-sm font-medium truncate">
            {conv.title || "Untitled"}
          </div>
        )}
      </div>

      {/* 3 dots Actions */}
      <button
        ref={buttonRef}
        onClick={handleMenuOpen}
        className="
          opacity-1000 md:opacity-0 group-hover:opacity-100
          text-theme-muted hover:text-theme-text
          transition-opacity
          py-1 rounded-md
        "
        aria-label="Conversation options"
      >
        <PiDotsThreeBold className="size-[18px] md:size-[24px]" />
      </button>

      {/* Context menu */}
      {open && menuPos && (
        <ModalPortal>
          <div
            ref={menuRef}
            onClick={(e) => e.stopPropagation()}
            className="
              context-menu
              fixed z-[1000]
              w-44 md:w-44
              rounded-md md:rounded-md
              bg-theme-dark
              border border-theme-secondary
              shadow-lg
              text-sm
            "
            style={{
              top: menuPos.top,
              left: menuPos.left,
              transform:
                menuPos.placement === "top"
                  ? "translateY(-100%)"
                  : "translateY(0)",
            }}
          >
            <ConversationMenuItem
              onClick={() => {
                setOpen(false);
                startRename();
              }}
            >
              Rename
            </ConversationMenuItem>

            <ConversationMenuItem
              danger
              onClick={() => {
                setOpen(false);
                onDelete(conv._id);
              }}
            >
              Delete
            </ConversationMenuItem>

            <div className="my-0 h-px bg-theme-secondary/40" />

            <div className="px-4 py-2 text-xs text-theme-muted flex items-center gap-1">
              <MdOutlineUpdate size={18} />
              <span>
                {conv.createdAt
                  ? new Date(conv.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : ""}
              </span>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}

// {isActive && (
//   <div className="w-1.5 h-1.5 rounded-full bg-theme-muted animate-pulse" />
// )}

export default React.memo(ConversationItem);
