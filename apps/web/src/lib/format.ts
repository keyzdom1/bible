import { BOOKS, CHAPTER_COUNTS, getBook, type BookCode } from "@holyword/core";

export function bookName(code: BookCode): string {
  return getBook(code)?.name ?? code;
}

export function referenceLabel(code: BookCode, chapter: number, verse?: number | null): string {
  return `${bookName(code)} ${chapter}${verse ? `:${verse}` : ""}`;
}

export interface ChapterPosition {
  readonly book: BookCode;
  readonly chapter: number;
}

export function adjacentChapter(
  book: BookCode,
  chapter: number,
  direction: -1 | 1,
): ChapterPosition | null {
  const index = BOOKS.findIndex((entry) => entry.code === book);
  if (index < 0) return null;
  if (direction === 1) {
    if (chapter < CHAPTER_COUNTS[book]) return { book, chapter: chapter + 1 };
    const next = BOOKS[index + 1];
    return next ? { book: next.code, chapter: 1 } : null;
  }
  if (chapter > 1) return { book, chapter: chapter - 1 };
  const previous = BOOKS[index - 1];
  return previous ? { book: previous.code, chapter: CHAPTER_COUNTS[previous.code] } : null;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return "Not yet";
  const millis = Date.parse(iso);
  if (!Number.isFinite(millis)) return "Unknown";
  const seconds = Math.max(0, Math.round((Date.now() - millis) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(millis).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
