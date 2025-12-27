import React, { useState } from "react";
import UserProfile from "./UserProfile";

/**
 * Sidebar footer showing user avatar
 * @param {{user: {email?: string, name?: string, _id?: string}, onLogout: function}} props
 */
function SidebarFooter({ user, onLogout }) {
  const [showProfile, setShowProfile] = useState(false);

  const getInitial = () => {
    return user?.name
      ? user.name.charAt(0).toUpperCase()
      : user?.email?.charAt(0).toUpperCase() || "U";
  };

  return (
    <>
      <div className="p-2 border-t border-theme-secondary">
        <button
          onClick={() => setShowProfile(true)}
          className="w-full flex items-center gap-2 p-1 rounded-md hover:bg-theme-secondary/20 transition"
        >
          {/* User Avatar */}
          <div className="w-8 h-8 bg-theme-secondary rounded-full flex items-center justify-center text-theme-text text-[20px] flex-shrink-0">
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

      {/* User Profile Modal */}
      {showProfile && (
        <UserProfile user={user} onClose={() => setShowProfile(false)} />
      )}
    </>
  );
}

export default React.memo(SidebarFooter);
