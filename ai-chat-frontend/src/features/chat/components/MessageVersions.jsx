import React from "react";
import { useDispatch, useSelector } from "react-redux";
import { FaChevronLeft, FaChevronRight, FaRotateRight } from "react-icons/fa6";
import {
  switchVersion,
  retryMessage,
  selectCurrentVersionNumber,
  selectTotalVersions,
  selectVersionsLoading,
  selectIsRetrying,
} from "../../messages/messageInteractionsSlice";

/**
 * MessageVersions Component
 *
 * Provides navigation between different versions of an assistant message.
 * Displayed as "Version X of Y" with navigation arrows.
 *
 * @param {string} messageId - The unique ID of the message
 * @param {string} conversationId - The ID of the conversation
 * @param {number} totalVersions - Total number of versions available (initial prop)
 * @param {number} currentVersion - Current version number (initial prop)
 */
export const MessageVersions = ({
  messageId,
  conversationId,
  totalVersions: initialTotalVersions,
  currentVersion: initialCurrentVersion,
}) => {
  const dispatch = useDispatch();

  // Redux selectors for real-time updates
  const stateCurrentVersion = useSelector((state) =>
    selectCurrentVersionNumber(state, messageId),
  );
  const stateTotalVersions = useSelector((state) =>
    selectTotalVersions(state, messageId),
  );
  const isLoading = useSelector((state) =>
    selectVersionsLoading(state, messageId),
  );
  const isRetrying = useSelector((state) => selectIsRetrying(state, messageId));

  // 🎯 Single Source of Truth: Prefer props (from conversationSlice) over auxiliary slice state
  const current = initialCurrentVersion || stateCurrentVersion;
  const total =
    initialTotalVersions > 1 ? initialTotalVersions : stateTotalVersions;

  // Only show if there are multiple versions
  if (total <= 1) return null;

  const handlePrevious = () => {
    if (current > 1 && !isLoading) {
      dispatch(
        switchVersion({
          conversationId,
          messageId,
          versionNumber: current - 1,
        }),
      );
    }
  };

  const handleNext = () => {
    if (current < total && !isLoading) {
      dispatch(
        switchVersion({
          conversationId,
          messageId,
          versionNumber: current + 1,
        }),
      );
    }
  };

  const handleRegenerate = () => {
    if (isRetrying) return;
    dispatch(retryMessage({ conversationId, messageId }));
  };

  return (
    <div className="flex items-center bg-theme-secondary/40 rounded-md p-0.5 min-h-[32px]">
      <button
        onClick={handlePrevious}
        disabled={current <= 1 || isLoading}
        className={`p-1.5 rounded-md transition-colors ${
          current <= 1 || isLoading
            ? "text-theme-muted opacity-30 cursor-not-allowed"
            : "text-theme-text hover:bg-theme-secondary"
        }`}
        title="Previous version"
        type="button"
      >
        <FaChevronLeft size={12} />
      </button>

      <span className="text-[12px] font-medium px-1.5 text-theme-muted select-none whitespace-nowrap flex items-center gap-1">
        {current} <span className="opacity-50">/</span> {total}
      </span>

      <button
        onClick={handleNext}
        disabled={current >= total || isLoading}
        className={`p-1.5 rounded-md transition-colors ${
          current >= total || isLoading
            ? "text-theme-muted opacity-30 cursor-not-allowed"
            : "text-theme-text hover:bg-theme-secondary"
        }`}
        title="Next version"
        type="button"
      >
        <FaChevronRight size={12} />
      </button>

      {isLoading && (
        <div className="ml-1 w-2.5 h-2.5 border border-theme-accent border-t-transparent rounded-full animate-spin"></div>
      )}
    </div>
  );
};

export default MessageVersions;
