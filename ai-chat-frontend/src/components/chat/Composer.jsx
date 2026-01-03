import React, { useEffect, useState, useRef } from "react";
import { TiArrowUp } from "react-icons/ti";

/**
 * Composer - floating glass input with multi-line support
 */
function Composer({ onSend, disabled, position, currentConversationId }) {
  const [text, setText] = useState("");
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const textareaRef = useRef(null);

  const submit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text.trim());
    setText("");
  };

  const handleKeyDown = (e) => {
    const isDesktop = window.matchMedia("(hover: hover)").matches;

    if (e.key === "Enter" && !e.shiftKey && isDesktop) {
      e.preventDefault();
      submit(e);
    }
  };

  const positionClasses =
    position === "center"
      ? `relative`
      : `absolute bottom-4 left-1/2 -translate-x-1/2`;

  const PLACEHOLDERS = [
    "Think through a problem…",
    "Drop code, get clarity…",
    "Turn notes into insight…",
    "What’s on your mind?",
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % PLACEHOLDERS.length);
    }, 3000); // every 3 seconds

    return () => clearInterval(interval);
  }, []);

  // Auto-resize textarea as content changes
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const newHeight = Math.min(textarea.scrollHeight, 200);
      textarea.style.height = newHeight + "px";
    }
  }, [text]);

  return (
    <form
      onSubmit={submit}
      className={`
        ${positionClasses}
        z-30
        w-[100%]
        max-w-4xl
        px-4 md:px-6
        h-14 sm:h-16 md:h-auto
      `}
    >
      {/* Floating glass bar */}
      <div
        className="
          relative
          flex items-end gap-2
          rounded-[2.5rem]
          px-2 md:px-2
          py-2

          min-h-14
          bg-theme-light
          backdrop-blur-xl
          border border-theme-secondary
          shadow-[0_12px_40px_rgba(0,0,0,0.35)]

          focus-within:ring-2
          focus-within:ring-theme-secondary

          transition-all
        "
      >
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          aria-label="Message"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            currentConversationId
              ? "Ask anything"
              : PLACEHOLDERS[placeholderIndex]
          }
          disabled={disabled}
          rows={1}
          className="
            flex-1 min-w-0
            bg-transparent
            border-none
            outline-none
            resize-none

            text-theme-text
            placeholder:text-theme-muted
            text-sm md:text-base
            leading-6

            px-1
            py-2.5

            max-h-[200px]
            overflow-y-auto


          "
        />

        {/* Send button */}
        <button
          type="submit"
          disabled={!text.trim() || disabled}
          className="
            shrink-0
            h-11 w-11
            rounded-full

            bg-theme-muted
            text-theme-text

            flex items-center justify-center

            shadow-lg
            hover:brightness-110
            active:scale-95
            transition-all duration-200

            disabled:opacity-40
            disabled:cursor-not-allowed
            disabled:scale-100
          "
        >
          <TiArrowUp className="w-6 h-6 md:w-7 md:h-7 text-theme-accent" />
        </button>

        {/* Glass edge highlight */}
        <div
          className="

            pointer-events-none
            absolute inset-0 rounded-[2.5rem]
            ring-1 ring-white/20
          "
        />
      </div>
    </form>
  );
}

export default React.memo(Composer);
