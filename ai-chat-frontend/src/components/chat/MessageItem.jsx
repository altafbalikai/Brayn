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
      <code className="text-theme-textaccent px-1.5 py-0.5 rounded text-sm font-mono">
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
        className="absolute right-2 top-2 z-10 px-2 py-1 text-xs rounded-md bg-gray-800 text-gray-200 hover:bg-gray-600 transition-colors"
        type="button"
      >
        {copied ? "Copied" : "Copy"}
      </button>

      <pre className="rounded-md bg-theme-dark text-gray-100 text-sm pt-10 max-w-full overflow-x-auto">
        <code
          className={`
            ${className || ""}
            block
            bg-red-500
            font-mono
            text-[0.85rem]
          `}
          {...props}
        >
          {children}
        </code>
      </pre>
    </div>
  );
}

// function CodeBlock({ inline, className, children, ...props }) {
//   const [copied, setCopied] = useState(false);
//   const isBlock = className?.startsWith("language-");
//   const language = isBlock ? className.replace("language-", "") : null;

//   const code = String(children).replace(/\n$/, "");

//   const handleCopy = async () => {
//     await navigator.clipboard.writeText(code);
//     setCopied(true);
//     setTimeout(() => setCopied(false), 1500);
//   };

//   // Inline code
//   if (!isBlock) {
//     return (
//       <code
//         className="
//           px-1.5 py-0.5 rounded-md
//           bg-[rgba(148,163,184,0.15)]
//           text-theme-text
//           font-mono text-[0.85em]
//         "
//       >
//         {children}
//       </code>
//     );
//   }

//   // Block code
//   return (
//     <div className="my-4 rounded-xl overflow-hidden bg-[rgba(15,23,42,0.9)]">
//       {/* Header */}
//       <div className="flex items-center justify-between px-4 py-2 text-xs bg-[rgba(30,41,59,0.8)] text-theme-muted">
//         <span className="uppercase tracking-wide">{language || "code"}</span>
//         <button
//           onClick={handleCopy}
//           className="
//             px-2 py-1 rounded-md
//             hover:bg-theme-secondary
//             transition-colors
//           "
//         >
//           {copied ? "Copied ✓" : "Copy"}
//         </button>
//       </div>

//       {/* Code */}
//       <pre className="overflow-x-auto p-4 text-sm leading-relaxed">
//         <code className="font-mono text-theme-text" {...props}>
//           {code}
//         </code>
//       </pre>
//     </div>
//   );
// }

/**
 * Message bubble with real-time streaming support
 */
// function MessageItem({ msg, showTime }) {
//   const isStreaming = msg.status === "streaming";
//   const isLoading = isStreaming && !msg.text;
//   const displayText = msg.text || "";
//   const isAssistant = msg.role === "assistant";

//   // Apply minimal fixes for streaming content
//   const processedText = useMemo(() => {
//     if (!displayText) return "";
//     return isStreaming ? quickFixMarkdown(displayText) : displayText;
//   }, [displayText, isStreaming]);

//   return (
//     <div
//       className={`flex w-full min-w-0 ${
//         msg.role === "user" ? "justify-end" : "justify-start"
//       } px-2 md:px-4 mb-1`}
//     >
//       {/* Bubble wrapper */}
//       <div
//         className={`flex flex-col min-w-0 sm:max-w-[80%] ${
//           msg.role === "user"
//             ? "max-w-[80%] md:max-w-[70%]"
//             : "max-w-[100%] md:max-w-[100%]"
//         }`}
//       >
//         {showTime && (
//           <div
//             className={`text-xs text-theme-muted opacity-50 mb-1 ${
//               msg.role === "user" ? "text-right" : "text-left"
//             }`}
//           >
//             {new Date(msg.createdAt || msg.timestamp).toLocaleTimeString([], {
//               hour: "2-digit",
//               minute: "2-digit",
//             })}
//           </div>
//         )}

//         {/* Bubble */}
//         <div
//           className={`rounded-lg min-w-0 overflow-hidden ${
//             msg.role === "user"
//               ? "px-4 py-3 bg-theme-secondary text-theme-text"
//               : "px-0 py-0 bg-theme-transparent text-theme-textaccent"
//           }`}
//         >
//           {isLoading ? (
//             // Initial loading state (no content yet)
//             <div className="flex gap-1 h-6">
//               <span className="animate-bounce">.</span>
//               <span className="animate-bounce [animation-delay:0.15s]">.</span>
//               <span className="animate-bounce [animation-delay:0.3s]">.</span>
//             </div>
//           ) : isAssistant ? (
//             // Assistant message with markdown rendering
//             <div className="prose prose-invert max-w-none text-sm min-w-0 overflow-x-hidden">
//               <div className="relative">
//                 <ReactMarkdown
//                   remarkPlugins={[remarkGfm, remarkBreaks]}
//                   rehypePlugins={isStreaming ? [] : [rehypeHighlight]}
//                   components={{
//                     code: CodeBlock,

//                     p: ({ children }) => (
//                       <p className="mb-2 leading-relaxed">{children}</p>
//                     ),

//                     strong: ({ children }) => (
//                       <strong className="font-semibold text-theme-textaccent">
//                         {children}
//                       </strong>
//                     ),

//                     em: ({ children }) => (
//                       <em className="italic opacity-90">{children}</em>
//                     ),

//                     ul: ({ children }) => (
//                       <ul className="list-disc pl-5 mb-2 space-y-1">
//                         {children}
//                       </ul>
//                     ),

//                     ol: ({ children }) => (
//                       <ol className="list-decimal pl-5 mb-2 space-y-1">
//                         {children}
//                       </ol>
//                     ),

//                     h1: ({ children }) => (
//                       <h1 className="text-xl font-bold mt-4 mb-2">
//                         {children}
//                       </h1>
//                     ),

//                     h2: ({ children }) => (
//                       <h2 className="text-lg font-bold mt-3 mb-2">
//                         {children}
//                       </h2>
//                     ),

//                     h3: ({ children }) => (
//                       <h3 className="text-base font-bold mt-2 mb-1">
//                         {children}
//                       </h3>
//                     ),

//                     table: ({ children }) => (
//                       <div className="overflow-x-auto my-3">
//                         <table className="w-full border-collapse text-sm">
//                           {children}
//                         </table>
//                       </div>
//                     ),

//                     th: ({ children }) => (
//                       <th className="border border-theme-secondary px-3 py-2 text-left bg-theme-dark">
//                         {children}
//                       </th>
//                     ),

//                     td: ({ children }) => (
//                       <td className="border border-theme-secondary px-3 py-2">
//                         {children}
//                       </td>
//                     ),
//                   }}
//                 >
//                   {processedText}
//                 </ReactMarkdown>

//                 {/* Animated cursor while streaming */}
//                 {isStreaming && (
//                   <span className="inline-block w-0.5 h-4 bg-blue-500 animate-pulse ml-0.5 align-middle" />
//                 )}
//               </div>
//             </div>
//           ) : (
//             // User message (plain text)
//             <div className="whitespace-pre-wrap break-words min-w-0">
//               {displayText}
//             </div>
//           )}
//         </div>
//       </div>
//     </div>
//   );
// }

function MessageItem({ msg, showTime }) {
  const isStreaming = msg.status === "streaming";
  const isLoading = isStreaming && !msg.text;
  const displayText = msg.text || "";
  const isAssistant = msg.role === "assistant";

  // Apply minimal fixes for streaming content
  const processedText = useMemo(() => {
    if (!displayText) return "";
    return isStreaming ? quickFixMarkdown(displayText) : displayText;
  }, [displayText, isStreaming]);

  console.log("MessageItem repainting");
  return (
    <div
      className={`flex w-full min-w-0 ${
        msg.role === "user" ? "justify-end" : "justify-start"
      } px-2 md:px-4 mb-1`}
    >
      {/* Bubble wrapper */}
      <div
        className={`flex flex-col min-w-0 sm:max-w-[80%] ${
          msg.role === "user"
            ? "max-w-[80%] md:max-w-[70%]"
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
          className={`rounded-lg min-w-0 overflow-hidden ${
            msg.role === "user"
              ? "px-4 py-3 bg-theme-secondary text-theme-text"
              : "px-0 py-0 bg-theme-transparent text-theme-chat-text"
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
                  remarkPlugins={[remarkGfm, remarkBreaks]}
                  rehypePlugins={isStreaming ? [] : [rehypeHighlight]}
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

                {/* Animated cursor while streaming */}
                {isStreaming && (
                  <span
                    className="
                    inline-block w-[2px] h-[1.2em]
                    bg-theme-muted
                    animate-pulse
                    ml-1 align-middle
                  "
                  />
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
