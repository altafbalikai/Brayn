import React, { useState, useMemo, useEffect, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
  setEditingMessage,
  cancelEditing,
  editMessage,
  activateNode,
} from "../../../features/conversations/conversationSlice";
import { selectPersonas } from "../../../features/persona/personaSlice";
import { getPersonaIcon } from "../../../utils/personaIcons";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
// import "highlight.js/styles/github-dark.css";
import remarkBreaks from "remark-breaks";
import {
  FaPen,
  FaChevronLeft,
  FaChevronRight,
  FaRegCopy,
  FaCheck,
} from "react-icons/fa6";
import LoadingIndicator from "./LoadingIndicator";
import { MessageActions } from "./MessageActions";
import ReasoningDisplay from "./ReasoningDisplay";
import SpiningLoader from "../../../components/ui/SpiningLoader";
/**
 * Validate that an ID is a real MongoDB ObjectId (24-char hex string)
 * Temp frontend IDs like 'user-1772849303104' will fail this check
 */
const isValidMongoId = (id) => /^[a-f\d]{24}$/i.test(id?.toString() ?? "");

/**
 * Fixes incomplete markdown during streaming
 * Only handles critical issues that would break rendering
 */
function quickFixMarkdown(text) {
  if (!text) return "";

  // Fix unclosed code blocks that would break everything
  return text.replace(/```(\w*)\n((?!```)[\s\S])*$/g, (match) => {
    // If at end and unclosed, temporarily close it
    return match + "\n```";
  });
}

/**
 * Code block renderer with copy functionality
 * CRITICAL: Properly distinguishes between inline and block code
 */
function CodeBlock({ node, inline, className, children, ...props }) {
  const [copied, setCopied] = useState(false);
  const isBlock = className && className.startsWith("hljs language-");
  const language = isBlock ? className.replace("hljs language-", "") : null;

  const code = Array.isArray(children)
    ? children
        .map((child) =>
          typeof child === "string" ? child : (child.props?.children ?? ""),
        )
        .join("")
    : String(children);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Copy failed", err);
    }
  };

  // INLINE CODE: Single backticks - render inline without copy button
  if (!isBlock) {
    // INLINE CODE
    return (
      <code className="bg-theme-inline-code text-theme-textaccent px-1.5 py-0.5 rounded text-sm font-mono">
        {children}
      </code>
    );
  }

  // CODE BLOCK: Triple backticks - render as block with copy button
  return (
    <div className="relative my-3 max-w-full overflow-x-auto">
      {language && (
        <div className="absolute left-2 top-2 z-10 px-2 py-1 text-xs rounded-md text-theme-muted select-none">
          {language}
        </div>
      )}
      <button
        onClick={handleCopy}
        className="absolute right-2 top-2 z-10 px-2 py-1 text-xs rounded-md bg-theme-code-header text-theme-text hover:bg-theme-secondary transition-colors border border-theme-secondary"
        type="button"
      >
        {copied ? "Copied" : <FaRegCopy size={14} />}
      </button>

      <pre className="rounded-md bg-theme-code-bg text-theme-text text-sm pt-10 max-w-full overflow-x-auto border border-theme-secondary">
        <code
          className={`
            ${className || ""}
            block
            font-mono
            text-[0.85rem]
            px-4 pt-2 pb-4
          `}
          {...props}
        >
          {children}
        </code>
      </pre>
    </div>
  );
}

function MessageItem({
  msg,
  showTime,
  conversationId,
  editingMessageId,
  siblingCounts,
  currentConversationId,
}) {
  const dispatch = useDispatch();
  const sending = useSelector((state) => state.conversation.sending);
  const isUser = msg.role === "user";
  const realMessageId = msg._id?.toString();
  const useNodeTree = import.meta.env.VITE_USE_NODE_TREE === "true";

  // Only use msg._id (real MongoDB ObjectId), never the temp frontend ID (msg.id)
  const isEditing = !!realMessageId && editingMessageId === realMessageId;
  const isMessageSynced = isValidMongoId(msg._id);

  const [editContent, setEditContent] = useState(msg.text || "");
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => {
    setEditContent(msg.text || "");
  }, [msg.text]);

  useEffect(() => {
    if (!isEditing) setIsSubmittingEdit(false);
  }, [isEditing]);

  // Position cursor at end of textarea when edit mode opens
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      const el = textareaRef.current;
      // Auto-grow on mount
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
      // Position cursor at end
      const len = el.value.length;
      el.focus();
      el.setSelectionRange(len, len);
    }
  }, [isEditing]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const updateViewportFlag = (e) => setIsMobileViewport(e.matches);
    setIsMobileViewport(mediaQuery.matches);

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", updateViewportFlag);
      return () => mediaQuery.removeEventListener("change", updateViewportFlag);
    }

    mediaQuery.addListener(updateViewportFlag);
    return () => mediaQuery.removeListener(updateViewportFlag);
  }, []);

  const handleEditSubmit = async () => {
    const trimmed = editContent.trim();
    if (!trimmed || sending || isSubmittingEdit || !isMessageSynced) {
      return;
    }

    const targetConvId = (
      msg.conversationId ||
      currentConversationId ||
      conversationId
    )?.toString();

    if (!targetConvId) {
      return;
    }

    setIsSubmittingEdit(true);
    try {
      await dispatch(
        editMessage({
          messageId: msg._id,
          conversationId: targetConvId,
          newContent: trimmed,
          tempAssistantId: `ast-${Date.now()}`,
        }),
      ).unwrap();

      dispatch(cancelEditing());
    } catch (err) {
      console.error("Failed to edit message:", err);
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const conversationSiblingCounts =
    siblingCounts?.[(msg.conversationId || conversationId)?.toString()] || {};
  const msgSiblingData = conversationSiblingCounts[msg._id?.toString()];
  const totalVersions = msgSiblingData?.total || 1;
  const currentPosition = msgSiblingData?.position ?? 0;
  const siblingIds = msgSiblingData?.siblingIds || [];
  const displayIndex = currentPosition;

  const handleNavPrev = () => {
    if (displayIndex <= 0 || siblingIds.length === 0) return;
    const targetSiblingId = siblingIds[displayIndex - 1];
    if (!targetSiblingId) return;
    dispatch(
      activateNode({
        conversationId: (msg.conversationId || conversationId)?.toString(),
        nodeId: msg._id?.toString(),
        targetSiblingId,
      }),
    );
  };

  const handleNavNext = () => {
    if (displayIndex >= totalVersions - 1 || siblingIds.length === 0) return;
    const targetSiblingId = siblingIds[displayIndex + 1];
    if (!targetSiblingId) return;
    dispatch(
      activateNode({
        conversationId: (msg.conversationId || conversationId)?.toString(),
        nodeId: msg._id?.toString(),
        targetSiblingId,
      }),
    );
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(msg.text ?? "");
    } catch {
      const el = document.createElement("textarea");
      el.value = msg.text ?? "";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const actionButtonClass =
    "p-1.5 rounded-md transition-all duration-200 flex items-center justify-center hover:bg-theme-secondary text-theme-muted hover:text-theme-text";

  // Check if message is in any processing state (streaming, retrying, pending, initializing)
  const isProcessing = [
    "streaming",
    "retrying",
    "pending",
    "initializing",
  ].includes(msg.status);

  const displayText = msg.text || "";

  // Show loading when message is being processed but has no content yet (including no reasoning)
  const isLoading = isProcessing && !displayText && !msg.isReasoning && !msg.reasoning;
  const isAssistant = msg.role === "assistant";

  // 1. Hooks MUST be at top level
  const personas = useSelector(selectPersonas);

  // 2. Computed values after hooks
  const persona = useMemo(() => {
    if (!isAssistant || !msg.personaId) return null;
    return personas.find((p) => p.id === msg.personaId);
  }, [isAssistant, msg.personaId, personas]);

  const PersonaIcon = persona ? getPersonaIcon(persona.slug) : null;

  const processedText = useMemo(() => {
    if (!displayText) return "";
    return isProcessing ? quickFixMarkdown(displayText) : displayText;
  }, [displayText, isProcessing]);

  // console.log("MessageItem repainting");
  return (
    <div
      className={`group flex w-full min-w-0 ${
        msg.role === "user" ? "justify-end" : "justify-start"
      } px-2 md:px-4 mb-1`}
      onMouseEnter={() => {
        if (isUser) setIsHovered(true);
      }}
      onMouseLeave={() => {
        if (isUser) setIsHovered(false);
      }}
    >
      {/* Bubble wrapper */}
      <div
        className={`flex flex-col min-w-0 transition-all duration-200 ${
          msg.role === "user"
            ? isEditing
              ? "w-full max-w-full" // ← full width in edit mode
              : "max-w-[80%] md:max-w-[70%]" // ← normal bubble width otherwise
            : "max-w-[100%] md:max-w-[100%]"
        }`}
      >
        {showTime && (
          <div
            className={`text-xs text-theme-muted opacity-50 mb-1 ${
              msg.role === "user" ? "text-right" : "text-left"
            }`}
          >
            {new Date(msg.createdAt || msg.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        )}

        {/* Bubble */}
        <div
          className={`rounded-lg min-w-0 ${
            msg.role === "user"
              ? isEditing
                ? "text-theme-text" // ← no padding/bg, editor takes over
                : "px-4 py-3 bg-theme-secondary text-theme-text"
              : "px-0 py-0 bg-theme-transparent text-theme-chat-text"
          }`}
        >
          {isLoading ? (
            // Initial loading state (no content yet)
            <LoadingIndicator />
          ) : (
            <>
              {isAssistant && persona && (
                <div className="flex items-center gap-1.5 mb-1 px-0.5">
                  {/* {PersonaIcon && (
                    <PersonaIcon className="w-3.5 h-3.5 text-theme-accent opacity-80" />
                  )}
                  <span className="text-[10px] font-medium text-theme-muted uppercase tracking-wider">
                    {persona.name}
                  </span> */}
                </div>
              )}
              {isAssistant ? (
                // Assistant message with markdown rendering
                <div className="prose prose-invert max-w-none text-sm min-w-0 overflow-x-hidden">
                  <div className="relative">
                    {msg.role === 'assistant' && (msg.reasoning || msg.isReasoning) && (
                      <ReasoningDisplay
                        reasoning={msg.reasoning ?? ''}
                        isReasoning={msg.isReasoning ?? false}
                        reasoningDoneAt={msg.reasoningDoneAt ?? null}
                        startedAt={msg.timestamp ? new Date(msg.timestamp).getTime() : new Date(msg.createdAt).getTime()}
                        reasoningDurationSeconds={msg.reasoningDurationSeconds ?? null}
                      />
                    )}
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkBreaks]}
                      rehypePlugins={
                        isLoading ? [] : [rehypeRaw, rehypeHighlight]
                      }
                      components={{
                        code: CodeBlock,

                        p: ({ children }) => (
                          <p className="mb-2 leading-[1.6] text-theme-chat-text">
                            {children}
                          </p>
                        ),

                        strong: ({ children }) => (
                          <strong className="font-semibold text-theme-text">
                            {children}
                          </strong>
                        ),

                        em: ({ children }) => (
                          <em className="italic opacity-90">{children}</em>
                        ),

                        ul: ({ children }) => (
                          <ul className="list-disc pl-5 mb-2 space-y-1">
                            {children}
                          </ul>
                        ),

                        ol: ({ children }) => (
                          <ol className="list-decimal pl-5 mb-2 space-y-1">
                            {children}
                          </ol>
                        ),

                        h1: ({ children }) => (
                          <h1 className="text-xl font-semibold mt-4 mb-2 text-theme-text">
                            {children}
                          </h1>
                        ),

                        h2: ({ children }) => (
                          <h2 className="text-lg font-semibold mt-3 mb-2 text-theme-text">
                            {children}
                          </h2>
                        ),

                        h3: ({ children }) => (
                          <h3 className="text-base font-semibold mt-2 mb-1 text-theme-text">
                            {children}
                          </h3>
                        ),

                        table: ({ children }) => (
                          <div className="overflow-x-auto my-3 rounded-lg border border-theme-secondary">
                            <table className="w-full text-sm">{children}</table>
                          </div>
                        ),

                        th: ({ children }) => (
                          <th className="px-3 py-2 text-left bg-theme-accent text-theme-text border-b border-theme-secondary">
                            {children}
                          </th>
                        ),

                        td: ({ children }) => (
                          <td className="px-3 py-2 border-b border-theme-secondary">
                            {children}
                          </td>
                        ),
                      }}
                    >
                      {processedText}
                    </ReactMarkdown>

                    {msg.status === "cancelled" && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "5px",
                          marginTop: "6px",
                          fontSize: "12px",
                          color: "var(--color-text-tertiary)",
                        }}
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                        >
                          <circle cx="8" cy="8" r="6.5" />
                          <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" />
                        </svg>
                        {msg.text?.trim()
                          ? "Generation stopped"
                          : "Generation stopped before any response was received"}
                      </div>
                    )}

                    {/* Show "Generating..." while isProcessing AND text is empty */}
                    {isProcessing && !displayText && (
                      <div className="flex items-center gap-2 py-2 text-theme-muted italic text-xs animate-pulse">
                        <LoadingIndicator />
                      </div>
                    )}

                    {/* Show actions and versions ONLY when NOT processing */}
                    {!isProcessing && (
                      <div className="not-prose flex w-full items-center justify-start  min-h-[32px] mt-2 pr-2">
                        <div className="flex min-w-0 items-center">
                          <MessageActions
                            messageId={msg._id}
                            conversationId={
                              conversationId || msg.conversationId
                            }
                            content={displayText}
                            isAssistant={isAssistant}
                            isLoading={false}
                            totalVersions={useNodeTree ? 1 : totalVersions || 1}
                            currentVersion={msg.currentVersion || 1}
                          />
                        </div>

                        {/* Assistant node navigator — node-tree mode only */}
                        {useNodeTree && isAssistant && totalVersions > 1 && (
                          <div className="flex items-center bg-theme-secondary/40 rounded-md p-0.5 min-h-[32px] shrink-0">
                            <button
                              onClick={() => {
                                if (
                                  currentPosition <= 0 ||
                                  siblingIds.length === 0
                                )
                                  return;
                                const targetSiblingId =
                                  siblingIds[currentPosition - 1];
                                if (!targetSiblingId) return;
                                dispatch(
                                  activateNode({
                                    conversationId: (
                                      msg.conversationId || conversationId
                                    )?.toString(),
                                    nodeId: msg._id?.toString(),
                                    targetSiblingId,
                                  }),
                                );
                              }}
                              disabled={currentPosition <= 0}
                              className={`p-1.5 rounded-md transition-colors ${
                                currentPosition <= 0
                                  ? "text-theme-muted opacity-30 cursor-not-allowed"
                                  : "text-theme-text hover:bg-theme-secondary"
                              }`}
                              title="Previous response"
                              type="button"
                            >
                              <FaChevronLeft size={12} />
                            </button>
                            <span className="text-[12px] font-medium px-1.5 text-theme-muted select-none whitespace-nowrap flex items-center gap-1">
                              {currentPosition + 1}
                              <span className="opacity-50">/</span>
                              {totalVersions}
                            </span>
                            <button
                              onClick={() => {
                                if (
                                  currentPosition >= siblingIds.length - 1 ||
                                  siblingIds.length === 0
                                )
                                  return;
                                const targetSiblingId =
                                  siblingIds[currentPosition + 1];
                                if (!targetSiblingId) return;
                                dispatch(
                                  activateNode({
                                    conversationId: (
                                      msg.conversationId || conversationId
                                    )?.toString(),
                                    nodeId: msg._id?.toString(),
                                    targetSiblingId,
                                  }),
                                );
                              }}
                              disabled={
                                currentPosition >= siblingIds.length - 1
                              }
                              className={`p-1.5 rounded-md transition-colors ${
                                currentPosition >= siblingIds.length - 1
                                  ? "text-theme-muted opacity-30 cursor-not-allowed"
                                  : "text-theme-text hover:bg-theme-secondary"
                              }`}
                              title="Next response"
                              type="button"
                            >
                              <FaChevronRight size={12} />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                // User message (plain text)
                <div className="whitespace-pre-wrap break-words min-w-0">
                  {isEditing ? (
                    <div className="flex flex-col w-full rounded-xl border border-theme-secondary bg-theme-secondary/30 overflow-hidden">
                      {/* Auto-growing textarea — no fixed min-height */}
                      <textarea
                        value={editContent}
                        onChange={(e) => {
                          setEditContent(e.target.value);
                          // Auto-grow
                          e.target.style.height = "auto";
                          e.target.style.height = `${e.target.scrollHeight}px`;
                        }}
                        ref={textareaRef}
                        className="
                          w-full
                          bg-theme-dark
                          border-none
                          outline-none
                          resize-none
                          overflow-y-auto
                          text-theme-text
                          placeholder:text-theme-muted
                          text-sm md:text-base
                          leading-6
                          px-4 pt-3 pb-2
                          min-h-[2.5rem]
                          max-h-[60vh]
                        "
                        disabled={sending || isSubmittingEdit}
                      />

                      {/* Footer */}
                      <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-theme-secondary">
                        <button
                          type="button"
                          onClick={() => dispatch(cancelEditing())}
                          className="
                            inline-flex items-center justify-center
                            h-8 px-4 rounded-lg text-sm leading-none
                            text-theme-muted hover:text-theme-text
                            bg-transparent hover:bg-theme-secondary
                            transition-colors duration-150
                            border border-theme-secondary
                          "
                          disabled={sending || isSubmittingEdit}
                        >
                          Cancel
                        </button>

                        <button
                          type="button"
                          onClick={handleEditSubmit}
                          className="
                            inline-flex items-center justify-center
                            h-8 px-4 rounded-lg text-sm leading-none
                            text-theme-text bg-theme-secondary
                            hover:opacity-90 active:opacity-80
                            transition-opacity duration-150
                            disabled:opacity-40 disabled:cursor-not-allowed
                            border border-theme-secondary
                          "
                          disabled={
                            sending ||
                            isSubmittingEdit ||
                            !editContent.trim() ||
                            editContent.trim() === displayText
                          }
                        >
                          {isSubmittingEdit ? (
                            <SpiningLoader size={10} />
                          ) : (
                            "Submit"
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="relative group/userMsg">{displayText}</div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Unified action bar ─────────────────────────────── */}
        {isUser && !isEditing && (
          <div
            className="
            flex items-center gap-1 justify-end
            mt-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200
          "
          >
            {/* 1 ── Copy button */}
            <button
              onClick={handleCopy}
              title="Copy to clipboard"
              className={`${actionButtonClass} ml-1`}
              type="button"
            >
              {isCopied ? (
                <FaCheck className="text-theme-muted" size={14} />
              ) : (
                <FaRegCopy size={14} />
              )}
            </button>

            {/* 2 ── Edit button */}
            <button
              onClick={() => {
                if (!isMessageSynced || sending || !realMessageId) return;
                dispatch(setEditingMessage(realMessageId));
              }}
              disabled={!isMessageSynced || sending}
              title={
                !isMessageSynced
                  ? "Message still sending..."
                  : sending
                    ? "Cannot edit while sending"
                    : "Edit message"
              }
              className={`${actionButtonClass} ${
                !isMessageSynced || sending
                  ? "opacity-30 cursor-not-allowed hover:bg-transparent hover:text-theme-muted"
                  : ""
              }`}
              type="button"
            >
              <FaPen size={14} />
            </button>

            {totalVersions > 1 && (
              <div
                className="
                flex items-center bg-theme-secondary/40 rounded-md p-0.5 min-h-[32px]
              "
              >
                {/* Left arrow */}
                <button
                  onClick={handleNavPrev}
                  disabled={displayIndex <= 0}
                  title="Previous version"
                  className={`p-1.5 rounded-md transition-colors ${
                    displayIndex <= 0
                      ? "text-theme-muted opacity-30 cursor-not-allowed"
                      : "text-theme-text hover:bg-theme-secondary"
                  }`}
                  type="button"
                >
                  <FaChevronLeft size={12} />
                </button>

                {/* Version label */}
                <span
                  className="
                  text-[12px] font-medium px-1.5 text-theme-muted select-none whitespace-nowrap flex items-center gap-1
                "
                >
                  {displayIndex + 1} <span className="opacity-50">/</span>{" "}
                  {totalVersions}
                </span>

                {/* Right arrow */}
                <button
                  onClick={handleNavNext}
                  disabled={displayIndex >= totalVersions - 1}
                  title="Next version"
                  className={`p-1.5 rounded-md transition-colors ${
                    displayIndex >= totalVersions - 1
                      ? "text-theme-muted opacity-30 cursor-not-allowed"
                      : "text-theme-text hover:bg-theme-secondary"
                  }`}
                  type="button"
                >
                  <FaChevronRight size={12} />
                </button>
              </div>
            )}
          </div>
        )}
        {/* ── End action bar ──────────────────────────────────── */}
      </div>
    </div>
  );
}

export default React.memo(MessageItem);
