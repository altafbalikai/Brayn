/**
 * Parses the **Sources** section out of a model response string.
 * Returns the body text (without the sources section) and a structured
 * array of source objects for rendering as a dedicated UI component.
 *
 * @param {string} text - Full response text from the assistant
 * @returns {{ body: string, sources: Array<{ title: string, url: string|null, domain: string|null }> }}
 */
export function parseSources(text) {
  if (!text) return { body: text || '', sources: [] };

  // Match "**Sources**" section at any point in the text
  const sourcesIndex = text.search(/\*\*Sources\*\*/i);
  if (sourcesIndex === -1) return { body: text, sources: [] };

  const body = text.slice(0, sourcesIndex).trim();
  const sourcesBlock = text.slice(sourcesIndex);

  const sources = [];
  // Match markdown links: - [title](url) or * [title](url)
  const linkPattern = /[-*]\s*\[([^\]]+)\]\(([^)]+)\)/g;
  let match;

  while ((match = linkPattern.exec(sourcesBlock)) !== null) {
    const title = match[1].trim();
    const url = match[2].trim();
    let domain = null;
    try {
      domain = new URL(url).hostname.replace('www.', '');
    } catch {
      domain = null;
    }
    sources.push({ title, url, domain });
  }

  // Fallback: plain text list items with no markdown link
  if (sources.length === 0) {
    const plainPattern = /[-*]\s*(?!\[)(.+)/g;
    while ((match = plainPattern.exec(sourcesBlock)) !== null) {
      const raw = match[1].trim();
      if (raw.toLowerCase() === 'sources') continue;
      sources.push({ title: raw, url: null, domain: null });
    }
  }

  return { body, sources };
}
