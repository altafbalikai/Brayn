import React, { useState } from "react";
import ModalPortal from "../../../../components/ui/ModalPortal";
import { ThemeSelector } from "../../../../components/ThemeSelector";
import MemoryPanel from "../../../../features/memory/MemoryPanel";

/**
 * Settings modal with theme selector and future customization options.
 * @param {{onClose: function}} props
 */
function Settings({ onClose }) {
  const [activeTab, setActiveTab] = useState('general');

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
              className="text-theme-muted hover:text-theme-text transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-muted)] rounded"
              aria-label="Close settings"
            >
              ✕
            </button>
          </div>

          {/* Tab Bar */}
          <div className="flex border-b border-theme-secondary px-6">
            <button
              onClick={() => setActiveTab('general')}
              className={`py-3 mr-6 text-sm font-medium border-b-2 -mb-px transition-colors duration-150 ${
                activeTab === 'general'
                  ? 'border-blue-500 text-theme-text'
                  : 'border-transparent text-theme-muted'
              }`}
            >
              General
            </button>
            <button
              onClick={() => setActiveTab('personalize')}
              className={`py-3 text-sm font-medium border-b-2 -mb-px transition-colors duration-150 ${
                activeTab === 'personalize'
                  ? 'border-blue-500 text-theme-text'
                  : 'border-transparent text-theme-muted'
              }`}
            >
              Personalize
            </button>
          </div>

          {/* Content */}
          <div className="max-h-[70vh] overflow-y-auto">
            {activeTab === 'general' && (
              <div className="p-6 space-y-6">
                {/* Appearance Section */}
                <section>
                  <h3 className="text-sm font-medium text-theme-text mb-3">
                    Appearance
                  </h3>
                  <div className="space-y-3">
                    <div className="w-full">
                      <ThemeSelector />
                    </div>
                  </div>
                </section>

                {/* Divider */}
                <div className="border-t border-theme-secondary" />

                {/* Future Settings Placeholder */}
                <section>
                  <h3 className="text-sm font-medium text-theme-text mb-3">
                    More Options
                  </h3>
                  <p className="text-sm text-theme-muted">
                    Additional customization options will be available in future updates,
                    including preferences for models, behavior, and notifications.
                  </p>
                </section>
              </div>
            )}

            {activeTab === 'personalize' && (
              <div className="p-6">
                <h3 className="text-sm font-medium text-theme-text mb-1">
                  Memory
                </h3>
                <p className="text-xs text-theme-muted mb-4">
                  The AI remembers facts about you across conversations.
                  View, edit, or remove what it knows below.
                </p>
                <MemoryPanel />
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

export default React.memo(Settings);

