import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import ModalPortal from "../../ui/ModalPortal";

function Settings({ onClose }) {
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
            <h2 className="text-lg font-semibold text-theme-text">Settings</h2>
            <button
              onClick={onClose}
              className="text-theme-muted hover:text-theme-text transition"
            >
              ✕
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto text-theme-text text-sm">
            <p className="text-theme-muted">
              Settings are currently under development.
            </p>

            <p className="text-theme-muted">
              This section will allow you to customize your experience in future
              updates, including preferences related to appearance, models, and
              behavior.
            </p>

            <div className="pt-4 border-t border-theme-secondary text-xs text-theme-muted">
              <p>More customization options will be available soon.</p>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

export default React.memo(Settings);
