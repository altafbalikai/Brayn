import React, { useState } from "react";
import { FaArrowCircleUp } from "react-icons/fa";

/**
 * Composer - floating glass input
 */
function Composer({ onSend, disabled, position }) {
  const [text, setText] = useState("");

  const submit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text.trim());
    setText("");
  };

  const positionClasses =
    position === "center"
      ? `relative`
      : `absolute bottom-4 left-1/2 -translate-x-1/2`;

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
          flex items-center gap-2
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
        {/* Input */}
        <input
          aria-label="Message"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask anything..."
          disabled={disabled}
          className="
            flex-1 min-w-0
            bg-transparent
            border-none
            outline-none

            text-theme-text
            placeholder:text-theme-muted

            text-sm md:text-base
            leading-tight

            disabled:opacity-60
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

            bg-theme-accent
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
