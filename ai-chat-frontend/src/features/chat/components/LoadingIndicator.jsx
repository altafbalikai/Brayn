import React from "react";

/**
 * LoadingIndicator - displays animated dots while waiting for response
 * @param {{style?: object}} props
 */
function LoadingIndicator({ style }) {
  return (
    <div style={style} className="flex justify-start mb-1 px-2 md:px-4">
      <div className="flex flex-col max-w-[85%] sm:max-w-[75%] md:max-w-[70%]">
        <div className="rounded-lg p-4 bg-theme-accent text-theme-dark">
          <div className="flex items-center gap-1 h-6">
            <span className="animate-bounce" style={{ animationDelay: "0s" }}>
              .
            </span>
            <span className="animate-bounce" style={{ animationDelay: "0.2s" }}>
              .
            </span>
            <span className="animate-bounce" style={{ animationDelay: "0.4s" }}>
              .
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default React.memo(LoadingIndicator);
