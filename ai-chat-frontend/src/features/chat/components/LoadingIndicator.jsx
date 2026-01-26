import React from "react";
import { FaCircle } from "react-icons/fa";

/**
 * LoadingIndicator - displays animated dots while waiting for response
 * @param {{style?: object}} props
 */
function LoadingIndicator() {
  return (
    <FaCircle
      size={18}
      className="text-theme-text animate-pulse drop-shadow-[0_0_12px_rgba(120,180,255,0.35)]"
    />
  );
}

export default React.memo(LoadingIndicator);
