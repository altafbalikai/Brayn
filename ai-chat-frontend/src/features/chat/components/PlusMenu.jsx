import { useEffect, useId, useRef, useState } from "react";
import { BsPlusLg } from "react-icons/bs";
import ModalPortal from "../../../components/ui/ModalPortal";
import { PersonaSwitcher } from "../../persona/PersonaSwitcher";
import WebSearchToggle from "../../webSearch/WebSearchToggle";

function PlusMenu({ conversationId }) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);
  const personaSubmenuRef = useRef(null);
  const menuId = useId();
  const MENU_HEIGHT = 180;

  const handleOpen = (event) => {
    event.stopPropagation();

    if (open) {
      setOpen(false);
      return;
    }

    const rect = buttonRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;

    const spaceBelow = viewportHeight - rect.bottom;
    const openUpwards = spaceBelow < MENU_HEIGHT;

    setMenuPos({
      left: rect.left,
      top: openUpwards ? rect.top - 8 : rect.bottom + 6,
      placement: openUpwards ? "top" : "bottom",
    });

    setOpen(true);
  };

  // Close menu on outside click, resize, or scroll
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event) => {
      if (personaSubmenuRef.current?.contains(event.target)) return;

      if (
        menuRef.current &&
        !menuRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };

    const handleResize = () => {
      setOpen(false);
    };

    const handleScroll = (event) => {
      if (personaSubmenuRef.current?.contains(event.target)) return;
      setOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label="Open composer tools"
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={handleOpen}
        className={`
          rounded-lg hover:bg-theme-secondary
          flex h-9 w-9 items-center justify-center
          text-theme-text
          transition-colors duration-150
          focus:outline-none focus-visible:ring-2 focus-visible:ring-theme-secondary
          ${open ? "bg-theme-secondary" : ""}
        `}
        title="Open tools"
      >
        <BsPlusLg className="h-4 w-4" aria-hidden="true" />
      </button>

      {open && menuPos && (
        <ModalPortal>
          <div
            ref={menuRef}
            id={menuId}
            role="dialog"
            aria-label="Composer tools"
            className="
              fixed z-[1000]
              w-56
              rounded-xl
              bg-theme-contextMenu
              border border-theme-secondary
              shadow-lg
              p-1
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
            <div
              className="
                flex flex-col rounded-lg px-2 py-1
              "
            >
              <WebSearchToggle />
            </div>

            <div className="flex flex-col rounded-lg px-2 py-1">
              <PersonaSwitcher
                conversationId={conversationId}
                dropdownRef={personaSubmenuRef}
              />
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}

export default PlusMenu;
