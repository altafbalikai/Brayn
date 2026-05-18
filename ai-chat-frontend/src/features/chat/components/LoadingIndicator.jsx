import React from "react";
import { FaCircle } from "react-icons/fa";

/**
 * LoadingIndicator - displays animated dots while waiting for response
 * @param {{style?: object}} props
 */
function LoadingIndicator() {
  return (
    <div className="flex items-center justify-center">
      <span className="relative flex h-2 w-2 mx-1">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-theme-textaccent opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-theme-textaccent"></span>
      </span>
    </div>
  );
}

export default React.memo(LoadingIndicator);
