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
        ${isCompact ? "text-left" : "text-center"}
      `}
    >
      {/* Logo / Identity */}
      <div
        className={`
          flex items-center
          ${
            isCompact ? "justify-start gap-2 mb-3" : "justify-center gap-2 mb-4"
          }
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
        <p className="text-theme-text mb-4">
          Your AI assistant for thinking, creating, and problem-solving.
        </p>
      )}

      {/* Prompt Suggestions */}
      {showPrompts && (
        <div
          className="
      flex flex-wrap gap-2
      justify-center
    "
        >
          {[
            "Explain a concept simply",
            "Summarize this document",
            "Generate ideas for a project",
            "Help debug my code",
          ].map((prompt) => (
            <button
              key={prompt}
              onClick={() => onPromptClick?.(prompt)}
              className="
          px-3 py-1.5
          rounded-full
          bg-theme-light
          border border-theme-secondary
          text-theme-text
          text-xs

          hover:bg-opacity-80
          hover:border-theme-textaccent
          transition-all
          whitespace-nowrap
        "
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      <p className="text-theme-muted mb-4 pt-3">Or ask anything below.</p>
      {/* Primary Action */}
      {/* <button
        onClick={onNewChat}
        className={`
          mx-auto
          py-3 px-8
          bg-theme-secondary text-theme-text
          rounded-xl font-medium
          shadow-lg
          hover:scale-[1.02]
          hover:shadow-xl
          transition-all
          mt-6
          ${isCompact ? "w-full" : ""}
        `}
      >
        Start a New Chat
      </button> */}

      {/* Composer */}
      {showComposer && Composer && (
        <div className="mt-4">
          <Composer disabled={disabled} />
        </div>
      )}
    </div>
  );
}

export default React.memo(NewChatHero);
