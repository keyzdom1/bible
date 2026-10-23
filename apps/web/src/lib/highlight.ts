export interface TextSegment {
  readonly text: string;
  readonly match: boolean;
}

/** Splits text into React-safe segments without injecting HTML. */
export function highlightSegments(text: string, query: string): TextSegment[] {
  const needle = query.trim().replace(/^["']+|["']+$/g, "");
  if (!needle) return [{ text, match: false }];
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(pattern);
  return parts
    .filter((part) => part.length > 0)
    .map((part) => ({ text: part, match: part.toLowerCase() === needle.toLowerCase() }));
}
