import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import ModalPortal from "../../../../components/ui/ModalPortal";
import { logout } from "../../../../features/auth/authSlice";

function Logout({ onClose }) {
  const dispatch = useDispatch();
  const { loading: authLoading, error: authError } = useSelector(
    (state) => state.auth
  );

  const handleLogout = async () => {
    await dispatch(logout());

    dispatch(clearCurrentConversation());

    navigate("/login");
    onClose();
  };
  return (
    <ModalPortal>
      <div
        className="
      fixed inset-0 z-50
      grid place-items-center
      p-4 sm:p-6
    "
      >
        {/* Overlay */}
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Modal */}
        <div
          className="
                relative
                z-10
                w-full max-w-md
                rounded-2xl
                bg-theme-light
                backdrop-blur-xl
                border border-theme-light
                shadow-[0_20px_60px_rgba(0,0,0,0.45)]
                overflow-hidden
            "
        >
          {/* Glow ring */}
          <div className="pointer-events-none absolute inset-0 rounded-2xl" />

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-theme-secondary">
            <h2 className="text-lg font-semibold text-theme-text">Logout</h2>
            <button
              onClick={onClose}
              className="text-theme-muted hover:text-theme-text transition"
            >
              ✕
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
            <div className="flex items-center justify-center text-lg text-theme-text">
              Are you sure you want to log out?
            </div>
            {/*  Actions */}
            <div className="flex gap-4 pt-4">
              <button
                onClick={handleLogout}
                disabled={authLoading}
                className="
                    w-full py-2.5 rounded-lg
                    border border-red-400/50
                    text-red-400
                    hover:bg-red-500/10
                    hover:border-red-400
                    transition-colors
                    "
              >
                {authLoading ? "Signing out..." : "Logout"}
              </button>
              <button
                onClick={onClose}
                className="
                  w-full py-2.5 rounded-lg
                  bg-theme-accent
                  text-theme-text
                  hover:brightness-110
                  transition
                  border border-theme-secondary
                  hover:bg-theme-secondary
                "
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

export default React.memo(Logout);
