import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  FaRegCopy,
  FaCheck,
  FaThumbsUp,
  FaThumbsDown,
  FaRegThumbsUp,
  FaRegThumbsDown,
  FaRotateRight,
  FaEllipsis,
} from "react-icons/fa6";
import {
  submitFeedback,
  retryMessage,
  markMessageCopied,
  selectUserFeedback,
  selectFeedbackSubmitting,
  selectIsRetrying,
} from "../../messages/messageInteractionsSlice";

/**
 * MessageActions Component
 *
 * Provides interactive buttons for assistant messages:
 * - Copy to clipboard
 * - Positive/Negative feedback (Thumbs Up/Down)
 * - Regeneration (Retry)
 * - More options (Placeholder)
 *
 * @param {string} messageId - The unique ID of the message
 * @param {string} conversationId - The ID of the conversation
 * @param {string} content - The text content to copy
 * @param {boolean} isAssistant - Whether the message is from the assistant
 * @param {boolean} isLoading - Whether the message is currently streaming/loading
 */
import { MessageVersions } from "./MessageVersions";

/**
 * MessageActions Component
 *
 * Provides interactive buttons for assistant messages:
 * - Copy to clipboard
 * - Positive/Negative feedback (Thumbs Up/Down)
 * - Version navigation (Conditional)
 * - Regeneration (Retry)
 *
 * @param {string} messageId - The unique ID of the message
 * @param {string} conversationId - The ID of the conversation
 * @param {string} content - The text content to copy
 * @param {boolean} isAssistant - Whether the message is from the assistant
 * @param {boolean} isLoading - Whether the message is currently streaming/loading
 * @param {number} totalVersions - Total versions available
 * @param {number} currentVersion - Current version number
 */
export const MessageActions = ({
  messageId,
  conversationId,
  content,
  isAssistant,
  isLoading,
  totalVersions = 1,
  currentVersion = 1,
}) => {
  const dispatch = useDispatch();
  const [copied, setCopied] = useState(false);

  // Redux selectors
  const userFeedback = useSelector((state) =>
    selectUserFeedback(state, messageId),
  );
  const isSubmittingFeedback = useSelector((state) =>
    selectFeedbackSubmitting(state, messageId),
  );
  const isRetrying = useSelector((state) => selectIsRetrying(state, messageId));

  // Don't show for user messages or while initial loading
  if (!isAssistant || isLoading || !messageId) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      dispatch(markMessageCopied({ messageId }));
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  const handleFeedback = (type) => {
    if (isSubmittingFeedback) return;
    dispatch(submitFeedback({ messageId, feedbackType: type, conversationId }));
  };

  const handleRetry = () => {
    if (isRetrying) return;
    dispatch(retryMessage({ conversationId, messageId }));
  };

  const buttonClass =
    "p-1.5 rounded-md transition-all duration-200 flex items-center justify-center hover:bg-theme-secondary text-theme-muted hover:text-theme-text";
  const activeLikeClass = "text-green-500 hover:text-green-400 bg-green-500/10";
  const activeDislikeClass = "text-red-500 hover:text-red-400 bg-red-500/10";

  return (
    <div className="flex items-center gap-1 mt-2 opacity-100 transition-opacity duration-200 -ml-1 flex-wrap">
      {/* 1. Copy Button */}
      <button
        onClick={handleCopy}
        className={`${buttonClass} ml-1`}
        title="Copy to clipboard"
        type="button"
      >
        {copied ? (
          <FaCheck className="text-theme-muted" size={14} />
        ) : (
          <FaRegCopy size={14} />
        )}
      </button>

      {/* 2. Like Button */}
      <button
        onClick={() => handleFeedback("positive")}
        className={buttonClass}
        // className={`
        //     ${buttonClass}
        //     ${userFeedback === "positive" ? activeLikeClass : ""}`}
        disabled={isSubmittingFeedback}
        title="Helpful"
        type="button"
      >
        {userFeedback === "positive" ? (
          <FaThumbsUp size={14} />
        ) : (
          <FaRegThumbsUp size={14} />
        )}
      </button>

      {/* 3. Dislike Button */}
      <button
        onClick={() => handleFeedback("negative")}
        className={buttonClass}
        // className={`${buttonClass} ${userFeedback === "negative" ? activeDislikeClass : ""}`}
        disabled={isSubmittingFeedback}
        title="Not helpful"
        type="button"
      >
        {userFeedback === "negative" ? (
          <FaThumbsDown size={14} />
        ) : (
          <FaRegThumbsDown size={14} />
        )}
      </button>

      {/* 4. Retry Button */}
      <button
        onClick={handleRetry}
        className={buttonClass}
        // className={`${buttonClass} ${isRetrying ? "animate-spin" : ""}`}
        disabled={isRetrying}
        title="Regenerate response"
        type="button"
      >
        <FaRotateRight size={14} />
      </button>

      {/* 5. Version Switcher (Conditional) */}
      {totalVersions > 1 && (
        <MessageVersions
          messageId={messageId}
          conversationId={conversationId}
          totalVersions={totalVersions}
          currentVersion={currentVersion}
        />
      )}

      {(isSubmittingFeedback || isRetrying) && (
        <span className="text-[10px] text-theme-muted animate-pulse ml-1 whitespace-nowrap">
          {isRetrying ? "Regenerating..." : "Saving feedback..."}
        </span>
      )}
    </div>
  );
};

export default MessageActions;
