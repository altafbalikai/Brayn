import React, { useRef, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { FaAngleRight } from "react-icons/fa";
import { BiCheck } from "react-icons/bi";
import { getPersonaIcon } from "../../utils/personaIcons";
import { usePersona } from "./usePersona";
import { switchPersonaThunk, setCurrentPersona } from "./personaSlice";
import ModalPortal from "../../components/ui/ModalPortal";

export const PersonaSwitcher = ({ conversationId, dropdownRef: externalDropdownRef }) => {
  const dispatch = useDispatch();
  const { personas, currentPersona } = usePersona();

  // UI State
  const [isOpen, setIsOpen] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const internalDropdownRef = useRef(null);
  const buttonRef = useRef(null);
  const activeItemRef = useRef(null);
  const dropdownRef = externalDropdownRef ?? internalDropdownRef;
  const SUBMENU_WIDTH = 224;
  const SUBMENU_MAX_HEIGHT = 256;
  const VIEWPORT_PADDING = 8;
  const SUBMENU_GAP = 6;

  const handleOpen = (e) => {
    e.stopPropagation();
    if (isOpen) {
      setIsOpen(false);
      return;
    }

    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;

    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    let top = rect.top;
    if (top + SUBMENU_MAX_HEIGHT > viewportHeight - VIEWPORT_PADDING) {
      top = Math.max(
        VIEWPORT_PADDING,
        viewportHeight - SUBMENU_MAX_HEIGHT - VIEWPORT_PADDING,
      );
    }

    let left = rect.right + SUBMENU_GAP;
    if (viewportWidth - rect.right < SUBMENU_WIDTH) {
      left = rect.left - SUBMENU_WIDTH - SUBMENU_GAP;
    }

    const maxLeft = Math.max(
      VIEWPORT_PADDING,
      viewportWidth - SUBMENU_WIDTH - VIEWPORT_PADDING,
    );

    left = Math.min(Math.max(VIEWPORT_PADDING, left), maxLeft);

    setMenuPos({
      left,
      top,
    });

    setIsOpen(true);
  };

  // Close menu on outside click, resize, or scroll
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    };

    const handleResize = () => {
      setIsOpen(false);
    };

    const handleScroll = (event) => {
      if (dropdownRef.current?.contains(event.target)) return;
      setIsOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [dropdownRef, isOpen]);

  // Auto scroll to active persona when menu opened
  useEffect(() => {
    if (isOpen && activeItemRef.current) {
      activeItemRef.current.scrollIntoView({
        block: "center",
        behavior: "instant",
      });
    }
  }, [isOpen]);

  const handleSwitch = (personaId) => {
    // console.log("Clicked persona switch", personaId)

    if (!conversationId || conversationId === "draft") {
      // Local switch for draft chats
      dispatch(setCurrentPersona(personaId));
    } else {
      // Backend switch for existing conversations
      dispatch(
        switchPersonaThunk({
          conversationId,
          personaId,
        }),
      );
    }
    setIsOpen(false);
  };

  return (
    <div className="relative">
      {/* Trigger Button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={handleOpen}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className={[
          "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm text-theme-text transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)]/40",
          isOpen ? "bg-theme-light" : "hover:bg-theme-secondary",
        ].join(" ")}
        title={currentPersona?.name || "Use style"}
      >
        {(() => {
          const Icon = getPersonaIcon(currentPersona?.slug);
          return (
            <Icon
              className="h-[18px] w-[18px] flex-shrink-0 text-theme-text"
              aria-hidden="true"
            />
          );
        })()}
        <span className="min-w-0 flex-1 truncate">
          {currentPersona?.name || "Use style"}
        </span>
        <span className="flex-shrink-0 text-theme-muted">
          <FaAngleRight
            size={14}
            aria-hidden="true"
            className="transition-colors duration-150"
          />
        </span>
      </button>

      {/* Dropdown Menu */}
      {isOpen && menuPos && (
        <ModalPortal>
          <div
            ref={dropdownRef}
            onMouseDown={(e) => e.stopPropagation()}
            className="
                            fixed z-[1000]
                            w-56 max-h-64
                            rounded-lg
                            bg-theme-contextMenu
                            border border-theme-secondary
                            shadow-lg
                            text-[14px]
                            overflow-y-auto
                            p-1 custom-scrollbar
                        "
            style={{
              top: menuPos.top,
              left: menuPos.left,
              transform: "none",
            }}
          >
            {personas.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-theme-muted italic">
                No personas loaded
              </div>
            )}
            {personas.map((persona) => {
              const isActive = currentPersona?.id === persona.id;
              const Icon = getPersonaIcon(persona.slug);

              return (
                <button
                  key={persona.id}
                  ref={isActive ? activeItemRef : null}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSwitch(persona.id);
                  }}
                  className={`
                                        mb-0.5 flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left transition-colors last:mb-0
                                        ${
                                          isActive
                                            ? "bg-theme-light text-theme-text"
                                            : "text-theme-text hover:bg-theme-light"
                                        }
                                    `}
                >
                  <Icon
                    className={`mt-0.5 h-4 w-4 flex-shrink-0 ${isActive ? "text-theme-text" : "text-theme-muted"}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold truncate leading-tight">
                      {persona.name}
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-[11px] text-theme-muted">
                      {persona.description}
                    </div>
                  </div>
                  {isActive && (
                    <BiCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--theme-focus-ring)]" />
                  )}
                </button>
              );
            })}
          </div>
        </ModalPortal>
      )}
    </div>
  );
};
