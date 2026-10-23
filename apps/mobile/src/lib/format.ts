import { BOOKS, getBook, tryParseReference, type BookCode } from "@holyword/core";

export interface ChapterTarget {
  readonly book: BookCode;
  readonly chapter: number;
  readonly verse?: number;
}

export function bookName(code: BookCode): string {
  return getBook(code)?.name ?? code;
}

export function referenceLabel(book: BookCode, chapter: number, verse?: number | null): string {
  return `${bookName(book)} ${chapter}${verse ? `:${verse}` : ""}`;
}

export function verseReference(verseId: string): string {
  const [book, chapter, verse] = verseId.split(".");
  const code = book as BookCode;
  return referenceLabel(
    code,
    Number(chapter ?? 1),
    verse === undefined ? undefined : Number(verse),
  );
}

export function adjacentChapter(
  book: BookCode,
  chapter: number,
  direction: 1 | -1,
): { book: BookCode; chapter: number } | null {
  const index = BOOKS.findIndex((entry) => entry.code === book);
  if (index < 0) return null;
  const current = BOOKS[index]!;
  const nextChapter = chapter + direction;
  if (nextChapter >= 1 && nextChapter <= current.chapterCount) {
    return { book, chapter: nextChapter };
  }
  const adjacent = BOOKS[index + direction];
  if (!adjacent) return null;
  return {
    book: adjacent.code,
    chapter: direction === 1 ? 1 : adjacent.chapterCount,
  };
}

export function referenceTarget(reference: string): ChapterTarget | null {
  const parsed = tryParseReference(reference);
  if (!parsed) return null;
  switch (parsed.type) {
    case "book":
      return { book: parsed.book, chapter: 1 };
    case "chapter":
      return { book: parsed.book, chapter: parsed.chapter };
    case "chapter-range":
      return { book: parsed.book, chapter: parsed.startChapter };
    case "verse":
      return { book: parsed.book, chapter: parsed.chapter, verse: parsed.verse };
    case "verse-range":
      return {
        book: parsed.book,
        chapter: parsed.start.chapter,
        verse: parsed.start.verse,
      };
  }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return "Not yet";
  const date = new Date(iso);
  const timestamp = date.getTime();
  if (!Number.isFinite(timestamp)) return "Unknown";
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 15) return "Just now";
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString();
}

export interface HighlightSegment {
  readonly text: string;
  readonly match: boolean;
}

export function highlightSegments(text: string, query: string): HighlightSegment[] {
  const phrase = query.trim().replace(/^"|"$/g, "").trim();
  if (!phrase) return [{ text, match: false }];
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const segments: HighlightSegment[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(regex)) {
    if (match.index === undefined) continue;
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), match: false });
    }
    segments.push({ text: match[0], match: true });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) segments.push({ text: text.slice(lastIndex), match: false });
  return segments.length > 0 ? segments : [{ text, match: false }];
}
