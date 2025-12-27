import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import remarkBreaks from "remark-breaks";

/**
 * Code block renderer
 */
function CodeBlock({ inline, className, children, ...props }) {
  const [copied, setCopied] = useState(false);

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

  if (inline) {
    return (
      <code className="break-words bg-black/10 px-1 rounded" {...props}>
        {children}
      </code>
    );
  }

  return (
    <div className="relative my-3 max-w-full overflow-x-auto">
      <button
        onClick={handleCopy}
        className="absolute right-2 top-2 z-10 px-2 py-1 text-xs rounded-md bg-theme-secondary text-theme-text"
        type="button"
      >
        {copied ? "Copied" : "Copy"}
      </button>

      <pre className="rounded-md bg-gray-900 text-theme-text text-sm p-4 max-w-full overflow-x-auto">
        <code className={className || "text-gray-100"} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
}

/**
 * Message bubble
 */
// function MessageItem({ msg, style, showTime }) {
//   const isLoading = msg.status === "streaming" && !msg.text;
//   const displayText = msg.text || "";
//   const isAssistant = msg.role === "assistant";

//   return (
//     <div
//       style={style}
//       className={`flex ${
//         msg.role === "user" ? "justify-end" : "justify-start"
//       } mb-1 px-2 md:px-4 min-w-0`}
//     >
//       <div className="flex flex-col max-w-[85%] sm:max-w-[75%] md:max-w-[70%] min-w-0">
//         {showTime && (
//           <div
//             className={`text-xs opacity-50 mb-1 px-2 ${
//               msg.role === "user" ? "text-right" : "text-left"
//             }`}
//           >
//             {new Date(msg.createdAt || msg.timestamp).toLocaleTimeString([], {
//               hour: "2-digit",
//               minute: "2-digit",
//             })}
//           </div>
//         )}

//         <div
//           className={`rounded-lg p-4 min-w-0 overflow-hidden ${
//             msg.role === "user"
//               ? "bg-theme-secondary text-theme-light"
//               : "bg-theme-accent text-theme-dark"
//           }`}
//         >
//           {isLoading ? (
//             <div className="flex items-center gap-1 h-6">
//               <span className="animate-bounce">.</span>
//               <span className="animate-bounce [animation-delay:0.2s]">.</span>
//               <span className="animate-bounce [animation-delay:0.4s]">.</span>
//             </div>
//           ) : isAssistant ? (
//             <div
//               className="
//                 prose prose-table:table prose-table:border-collapse
//                 prose-th:border prose-th:px-2 prose-th:py-1
//                 prose-td:border prose-td:px-2 prose-td:py-1
//                 max-w-none text-sm
//                 overflow-x-hidden min-w-0
//               "
//             >
//               <ReactMarkdown
//                 remarkPlugins={[remarkGfm, remarkBreaks]}
//                 rehypePlugins={[rehypeHighlight]}
//                 components={{ code: CodeBlock }}
//               >
//                 {displayText}
//               </ReactMarkdown>
//             </div>
//           ) : (
//             <div className="whitespace-pre-wrap break-words min-w-0">
//               {displayText}
//             </div>
//           )}
//         </div>
//       </div>
//     </div>
//   );
// }

function MessageItem({ msg, style, showTime }) {
  const isLoading = msg.status === "streaming" && !msg.text;
  const displayText = msg.text || "";
  const isAssistant = msg.role === "assistant";

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
              : "bg-theme-accent text-theme-textaccent"
          }`}
        >
          {isLoading ? (
            <div className="flex gap-1 h-6">
              <span className="animate-bounce">.</span>
              <span className="animate-bounce [animation-delay:0.15s]">.</span>
              <span className="animate-bounce [animation-delay:0.3s]">.</span>
            </div>
          ) : isAssistant ? (
            <div className="prose max-w-none text-sm min-w-0 overflow-x-hidden">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkBreaks]}
                rehypePlugins={[rehypeHighlight]}
                components={{ code: CodeBlock }}
              >
                {displayText}
              </ReactMarkdown>
            </div>
          ) : (
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
