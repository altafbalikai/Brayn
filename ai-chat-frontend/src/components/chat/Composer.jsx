import React, { useEffect, useState, useRef } from "react";
import { FaArrowCircleUp } from "react-icons/fa";

/**
 * Composer - floating glass input with multi-line support
 */
function Composer({ onSend, disabled, position }) {
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
    // Send on Enter, new line on Shift+Enter
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(e);
    }
  };

  const positionClasses =
    position === "center"
      ? `relative`
      : `absolute bottom-4 left-1/2 -translate-x-1/2`;

  const PLACEHOLDERS = [
    "Explain something you're stuck on…",
    "Paste code and ask for help…",
    "Summarize notes or a document…",
    "What you want to figure out today?",
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
        px-4
      `}
    >
      {/* Floating glass bar */}
      <div
        className="
          relative
          flex items-end gap-2
          rounded-3xl
          px-3 py-2 md:px-4 md:py-3

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
          placeholder={PLACEHOLDERS[placeholderIndex]}
          disabled={disabled}
          rows={1}
          className="
            flex-1 min-w-0
            bg-transparent
            border-none
            outline-none
            resize-none
            pr-1
            text-theme-text
            placeholder:text-theme-muted

            text-sm md:text-base
            leading-tight

            max-h-[200px]
            overflow-y-auto

            disabled:opacity-60

            py-1
          "
        />

        {/* Send button */}
        <button
          type="submit"
          disabled={!text.trim() || disabled}
          className="
            shrink-0
            h-10 w-10 md:h-11 md:w-11
            rounded-full

            bg-theme-secondary
            text-theme-text

            flex items-center justify-center

            shadow-lg
            hover:brightness-110
            active:scale-95

            transition-all duration-200

            disabled:opacity-40
            disabled:cursor-not-allowed
            disabled:scale-100

            mb-0.5
          "
        >
          <FaArrowCircleUp className="w-5 h-5 md:w-6 md:h-6" />
        </button>

        {/* Glass edge highlight */}
        <div
          className="
            pointer-events-none
            absolute inset-0 rounded-3xl
            ring-1 ring-white/20
          "
        />
      </div>
    </form>
  );
}

export default React.memo(Composer);
