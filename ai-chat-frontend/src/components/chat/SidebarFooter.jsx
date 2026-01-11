import React, { useEffect, useRef, useState } from "react";
import UserProfile from "./UserMenu/UserProfile";
import About from "./UserMenu/About";
import Settings from "./UserMenu/Settings";
import Logout from "./UserMenu/Logout";
import ModalPortal from "../ui/ModalPortal";
import { LuUser, LuSettings, LuInfo, LuLogOut } from "react-icons/lu";

/**
 * Sidebar footer showing user avatar
 * @param {{user: {email?: string, name?: string, _id?: string}, onLogout: function}} props
 */
function SidebarFooter({ user, onLogout }) {
  const [activeMenuOption, setActiveMenuOption] = useState(null);
  const [open, setOpen] = useState(null);
  const [menuPos, setMenuPos] = useState(null);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);
  const activeItemRef = useRef(null);
  const MENU_HEIGHT = 180;

  const getInitial = () => {
    return user?.name
      ? user.name.charAt(0).toUpperCase() + user.name.charAt(1).toUpperCase()
      : user?.email?.charAt(0).toUpperCase() || "U";
  };

  const handleOpen = (e) => {
    e.stopPropagation();

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

    const handleClickOutside = (e) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };

    const handleResize = () => {
      setOpen(false);
    };

    const handleScroll = () => {
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

  const MENU_ITEMS = [
    { id: "profile", label: "Profile", icon: LuUser },
    { id: "settings", label: "Settings", icon: LuSettings },
    { id: "about", label: "About", icon: LuInfo },
    { id: "logout", label: "Logout", icon: LuLogOut, danger: true },
  ];

  const handleUserMenu = (e, itemId) => {
    e.stopPropagation();
    setActiveMenuOption(itemId);
    setOpen(false);
  };

  return (
    <>
      <div className="p-2 border-t border-theme-secondary">
        <button
          ref={buttonRef}
          onClick={handleOpen}
          type="button"
          className="w-full flex items-center gap-2 p-1 rounded-md hover:bg-theme-secondary/20 transition"
        >
          {/* User Avatar */}
          <div className="w-8 h-8 pb-[3px] bg-theme-secondary rounded-full flex items-center justify-center text-theme-text text-sm leading-none flex-shrink-0">
            {getInitial()}
          </div>
          {/* User Info */}
          <div className="text-left min-w-0">
            <div className="text-theme-text text-xs font-medium truncate leading-tight">
              {user?.name || user?.email?.split("@")[0] || "User"}
            </div>
            <div className="text-theme-muted text-[10px] truncate leading-tight">
              {user?.email}
            </div>
          </div>
        </button>
      </div>

      {open && menuPos && (
        <ModalPortal>
          <div
            ref={menuRef}
            className="
              fixed z-[1000]
              w-60 h-46
              rounded-lg
              bg-theme-contextMenu
              border border-theme-secondary
              text-[14px]
              overflow-y-auto
              p-2
            "
            style={{
              top: menuPos.top,
              left: menuPos.left,
              // transform:
              //   menuPos.placement === "top"
              //     ? "translateY(-100%)"
              //     : "translateY(0)",
              transform: "translateY(-100%)",
              // transform: "translateY(0%)",
            }}
          >
            {MENU_ITEMS.map(({ id, label, icon: Icon, danger }) => (
              <button
                key={id}
                type="button"
                onClick={(e) => handleUserMenu(e, id)}
                className={`
                  w-full flex items-center gap-3 px-2 py-2 rounded-lg
                  text-sm text-left transition-colors
                  ${
                    danger
                      ? "text-red-400 hover:bg-red-500/10"
                      : "text-theme-textaccent hover:bg-theme-secondary"
                  }
                `}
              >
                <Icon size={16} className="opacity-80" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </ModalPortal>
      )}

      {/* User Profile Modal */}
      {activeMenuOption === "profile" && (
        <UserProfile user={user} onClose={() => setActiveMenuOption(null)} />
      )}

      {/* User Profile Modal */}
      {activeMenuOption === "settings" && (
        <Settings onClose={() => setActiveMenuOption(null)} />
      )}
      {/* User Settings Modal */}
      {activeMenuOption === "about" && (
        <About onClose={() => setActiveMenuOption(null)} />
      )}
      {/* User Logout Modal */}
      {activeMenuOption === "logout" && (
        <Logout onClose={() => setActiveMenuOption(null)} />
      )}
    </>
  );
}

export default React.memo(SidebarFooter);
