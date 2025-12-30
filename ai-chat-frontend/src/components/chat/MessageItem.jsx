import React, { useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import remarkBreaks from "remark-breaks";
import { FaCheck } from "react-icons/fa6";

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
          typeof child === "string" ? child : child.props?.children ?? ""
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
      <code className="bg-gray-800/80 text-orange-400 px-1.5 py-0.5 rounded text-sm font-mono">
        {children}
      </code>
    );
  }

  // CODE BLOCK: Triple backticks - render as block with copy button
  return (
    <div className="relative my-3 max-w-full overflow-x-auto">
      {language && (
        <div className="absolute left-2 top-2 z-10 px-2 py-1 text-xs rounded-md text-gray-200 select-none">
          {language}
        </div>
      )}
      <button
        onClick={handleCopy}
        className="absolute right-2 top-2 z-10 px-2 py-1 text-xs rounded-md bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors"
        type="button"
      >
        {copied ? "Copied" : "Copy"}
      </button>

      <pre className="rounded-md bg-gray-900 text-gray-100 text-sm p-4 pt-10 max-w-full overflow-x-auto">
        <code className={className || "text-gray-100"} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
}

/**
 * Message bubble with real-time streaming support
 */
function MessageItem({ msg, style, showTime }) {
  const isStreaming = msg.status === "streaming";
  const isLoading = isStreaming && !msg.text;
  const displayText = msg.text || "";
  const isAssistant = msg.role === "assistant";

  // Apply minimal fixes for streaming content
  const processedText = useMemo(() => {
    if (!displayText) return "";
    return isStreaming ? quickFixMarkdown(displayText) : displayText;
  }, [displayText, isStreaming]);

  return (
    <div
      style={style}
      className={`flex w-full min-w-0 ${
        msg.role === "user" ? "justify-end" : "justify-start"
      } px-2 md:px-4 mb-1`}
    >
      {/* Bubble wrapper */}
      <div className="flex flex-col min-w-0 max-w-[90%] sm:max-w-[80%] md:max-w-[70%]">
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
          className={`rounded-lg px-4 py-3 min-w-0 overflow-hidden ${
            msg.role === "user"
              ? "bg-theme-secondary text-theme-text"
              : "bg-theme-surface text-theme-textaccent"
          }`}
        >
          {isLoading ? (
            // Initial loading state (no content yet)
            <div className="flex gap-1 h-6">
              <span className="animate-bounce">.</span>
              <span className="animate-bounce [animation-delay:0.15s]">.</span>
              <span className="animate-bounce [animation-delay:0.3s]">.</span>
            </div>
          ) : isAssistant ? (
            // Assistant message with markdown rendering
            <div className="prose prose-invert max-w-none text-sm min-w-0 overflow-x-hidden">
              <div className="relative">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={isStreaming ? [] : [rehypeHighlight]}
                  components={{
                    code: CodeBlock,

                    p: ({ children }) => (
                      <p className="mb-2 last:mb-0">{children}</p>
                    ),

                    strong: ({ children }) => (
                      <strong className="font-semibold text-theme-textaccent">
                        {children}
                      </strong>
                    ),

                    em: ({ children }) => (
                      <em className="italic">{children}</em>
                    ),

                    ul: ({ children }) => (
                      <ul className="list-disc list-outside pl-5 mb-2 space-y-1">
                        {children}
                      </ul>
                    ),

                    ol: ({ children }) => (
                      <ol className="list-decimal list-outside pl-5 mb-2 space-y-1">
                        {children}
                      </ol>
                    ),

                    li: ({ children }) => <li>{children}</li>,

                    h1: ({ children }) => (
                      <h1 className="text-xl font-bold mb-2 mt-4 first:mt-0">
                        {children}
                      </h1>
                    ),

                    h2: ({ children }) => (
                      <h2 className="text-lg font-bold mb-2 mt-3 first:mt-0">
                        {children}
                      </h2>
                    ),

                    h3: ({ children }) => (
                      <h3 className="text-base font-bold mb-2 mt-2 first:mt-0">
                        {children}
                      </h3>
                    ),

                    /* TABLES */
                    table: ({ children }) => (
                      <div className="overflow-x-auto my-3">
                        <table className="w-full border-collapse">
                          {children}
                        </table>
                      </div>
                    ),

                    thead: ({ children }) => (
                      <thead className="bg-theme-accent text-theme-text">
                        {children}
                      </thead>
                    ),

                    tr: ({ children }) => (
                      <tr className="border-b border-gray-600 odd:bg-gray-900 even:bg-gray-800">
                        {children}
                      </tr>
                    ),

                    th: ({ children }) => (
                      <th className="border border-gray-600 px-3 py-2 text-left font-semibold">
                        {children}
                      </th>
                    ),

                    td: ({ children }) => (
                      <td className="border border-gray-600 px-3 py-2">
                        {children}
                      </td>
                    ),
                  }}
                >
                  {processedText}
                </ReactMarkdown>

                {/* Animated cursor while streaming */}
                {isStreaming && (
                  <span className="inline-block w-0.5 h-4 bg-blue-500 animate-pulse ml-0.5 align-middle" />
                )}
              </div>
            </div>
          ) : (
            // User message (plain text)
            <div className="whitespace-pre-wrap break-words min-w-0">
              {displayText}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default React.memo(MessageItem);
