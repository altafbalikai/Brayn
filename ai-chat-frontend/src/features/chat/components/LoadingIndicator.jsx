import React from "react";
import { FaCircle } from "react-icons/fa";

/**
 * LoadingIndicator - displays animated dots while waiting for response
 * @param {{style?: object}} props
 */
function LoadingIndicator() {
  return (
    <div className="pt-2">
    <FaCircle
      size={14}
      className="text-theme-text animate-pulse drop-shadow-[0_0_12px_rgba(120,180,255,0.35)]"
    />
    </div>
  );
}

export default React.memo(LoadingIndicator);
