import React, { useState } from "react";
import ModalPortal from "../../../components/ui/ModalPortal";
import SpiningLoader from "../../../components/ui/SpiningLoader";

function DeleteConfirmationModal({ onConfirm, onClose, title }) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    await onConfirm();
    setLoading(false);
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
              <p>Are you sure you want to delete this conversation?</p>
            </div>

            {/* Actions */}
            <div className="flex gap-4 pt-4">
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
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="
                    w-full py-2.5 rounded-lg
                    border border-red-400/50
                    text-red-400
                    hover:bg-red-500/10
                    hover:border-red-400
                    transition-colors
                    "
              >
                {loading ? <SpiningLoader /> : "Delete"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

export default DeleteConfirmationModal;
