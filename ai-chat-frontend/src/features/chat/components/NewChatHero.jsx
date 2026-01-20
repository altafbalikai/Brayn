import React from "react";
import { GiBrain } from "react-icons/gi";

function NewChatHero({
  onNewChat,
  onPromptClick,
  showPrompts = true,
  showComposer = false,
  Composer,
  disabled = false,
  variant = "center", // "center" | "compact"
}) {
  const isCompact = variant === "compact";

  return (
    <div
      className={`
    w-full
    max-w-[700px]
    mx-auto
    ${isCompact ? "text-left" : "text-center"}
  `}
    >
      {/* Logo / Identity */}
      <div
        className={`
      flex items-center
      ${isCompact ? "justify-start gap-2 mb-3" : "justify-center gap-2 mb-3"}
    `}
      >
        <GiBrain size={isCompact ? 24 : 32} className="text-theme-textaccent" />
        <h1
          className={`
        font-bold text-theme-textaccent
        ${isCompact ? "text-lg" : "text-3xl"}
      `}
        >
          Brayn
        </h1>
      </div>

      {/* Value Proposition */}
      {!isCompact && (
        <p className="text-theme-text/80 mb-2">
          Your second brain for thinking, creating, and solving.
        </p>
      )}

      {/* Prompt Suggestions */}
      {/* {showPrompts && (
        <div className="flex flex-wrap gap-2 justify-center mb-3">
          {["Learn something", "Work with text", "Fix a problem"].map(
            (prompt) => (
              <button
                key={prompt}
                onClick={() => onPromptClick?.(prompt)}
                className="
            px-3 py-1.5
            rounded-full
            bg-theme-light/80
            border border-theme-secondary
            text-theme-text/90
            text-xs
            hover:bg-opacity-80
            hover:border-theme-textaccent
            transition-all
            whitespace-nowrap
          "
              >
                {prompt}
              </button>
            )
          )}
        </div>
      )} */}

      <p className="text-theme-muted text-xs mb-3">What can I help with?</p>

      {/* Composer */}
      {showComposer && Composer && (
        <div className="mt-2">
          <Composer disabled={disabled} />
        </div>
      )}
    </div>
  );
}

export default React.memo(NewChatHero);
