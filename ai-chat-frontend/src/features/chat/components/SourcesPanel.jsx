import React, { useState } from "react";
import { FiExternalLink } from "react-icons/fi";

/**
 * Renders a visually distinct Sources section below the assistant response body.
 * Each source is a clickable card with favicon, title, domain, and external link icon.
 */
function SourceChip({ source }) {
  const [faviconError, setFaviconError] = useState(false);
  const faviconUrl =
    source.domain && !faviconError
      ? `https://www.google.com/s2/favicons?domain=${source.domain}&sz=16`
      : null;

  const inner = (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-theme-secondary/40 hover:bg-theme-secondary transition-colors border border-theme-secondary cursor-pointer group/chip max-w-[280px]">
      {/* Favicon */}
      <div className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
        {faviconUrl ? (
          <img
            src={faviconUrl}
            alt=""
            width={16}
            height={16}
            className="rounded-sm"
            onError={() => setFaviconError(true)}
          />
        ) : (
          <div className="w-3.5 h-3.5 rounded-sm bg-theme-muted/30" />
        )}
      </div>

      {/* Title */}
      <span className="text-sm text-theme-text truncate flex-1 min-w-0">
        {source.title}
      </span>

      {/* Domain + external icon */}
      <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
        {source.domain && (
          <span className="text-xs text-theme-muted hidden">
            {source.domain}
          </span>
        )}
        {source.url && (
          <FiExternalLink
            size={12}
            className="text-theme-muted group-hover/chip:text-theme-text transition-colors"
          />
        )}
      </div>
    </div>
  );

  if (source.url) {
    return (
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block no-underline"
      >
        {inner}
      </a>
    );
  }
  return inner;
}

export function SourcesPanel({ sources }) {
  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-4 pt-3 border-t border-theme-secondary">
      <p className="text-[11px] font-medium text-theme-muted uppercase tracking-wider mb-2 px-0.5">
        Sources
      </p>
      <div className="flex flex-row flex-wrap gap-2">
        {sources.map((source, i) => (
          <SourceChip key={i} source={source} />
        ))}
      </div>
    </div>
  );
}

export default SourcesPanel;
