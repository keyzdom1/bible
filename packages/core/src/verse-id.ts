import { BOOKS, getBook, type Book, type BookCode } from "./books";

/** Stable, version-independent verse coordinate, e.g. `JHN.3.16`. */
export interface VerseCoordinate {
  readonly chapter: number;
  readonly verse: number;
}

export interface ParsedVerseId extends VerseCoordinate {
  readonly id: string;
  readonly book: BookCode;
}

const VERSE_ID_PATTERN = /^([A-Z1-3]{3})\.(\d{1,3})\.(\d{1,3})$/i;

export function chapterId(book: BookCode, chapter: number): string {
  return `${book}.${chapter}`;
}

export function verseId(book: BookCode, chapter: number, verse: number): string {
  if (!Number.isInteger(chapter) || chapter < 1) {
    throw new RangeError(`Invalid chapter: ${chapter}`);
  }
  if (!Number.isInteger(verse) || verse < 1) {
    throw new RangeError(`Invalid verse: ${verse}`);
  }
  return `${book}.${chapter}.${verse}`;
}

export function parseVerseId(id: string): ParsedVerseId {
  const match = VERSE_ID_PATTERN.exec(id.trim());
  if (!match) {
    throw new Error(`Invalid verse id: "${id}" (expected BOOK.CHAPTER.VERSE, e.g. JHN.3.16)`);
  }
  const [, rawBook, rawChapter, rawVerse] = match;
  const book = getBook(rawBook!);
  if (!book) throw new Error(`Unknown book code in verse id: "${rawBook}"`);
  const chapter = Number(rawChapter);
  const verse = Number(rawVerse);
  if (!Number.isInteger(chapter) || chapter < 1 || chapter > book.chapterCount) {
    throw new Error(`Chapter ${chapter} is out of range for ${book.name} (1-${book.chapterCount})`);
  }
  if (!Number.isInteger(verse) || verse < 1) {
    throw new Error(`Verse ${verse} is invalid for ${book.code}.${chapter}`);
  }
  return { id: verseId(book.code, chapter, verse), book: book.code, chapter, verse };
}

export function tryParseVerseId(id: string): ParsedVerseId | undefined {
  try {
    return parseVerseId(id);
  } catch {
    return undefined;
  }
}

export function isVerseId(value: string): boolean {
  return tryParseVerseId(value) !== undefined;
}

export function parseChapterId(id: string): { book: Book; chapter: number } {
  const match = /^([A-Z1-3]{3})\.(\d{1,3})$/i.exec(id.trim());
  if (!match) throw new Error(`Invalid chapter id: "${id}"`);
  const book = getBook(match[1]!);
  if (!book) throw new Error(`Unknown book code in chapter id: "${match[1]}"`);
  const chapter = Number(match[2]);
  if (!Number.isInteger(chapter) || chapter < 1 || chapter > book.chapterCount) {
    throw new Error(`Chapter ${chapter} is out of range for ${book.name}`);
  }
  return { book, chapter };
}

const bookOrder = new Map<string, number>(BOOKS.map((book) => [book.code, book.order]));

/** Orders verse ids canonically (book order, chapter, verse). */
export function compareVerseIds(a: string, b: string): number {
  const left = parseVerseId(a);
  const right = parseVerseId(b);
  return (
    (bookOrder.get(left.book) ?? 0) - (bookOrder.get(right.book) ?? 0) ||
    left.chapter - right.chapter ||
    left.verse - right.verse
  );
}

export function sortVerseIds(ids: readonly string[]): string[] {
  return [...ids].sort(compareVerseIds);
}

/** Stable identifier for a contiguous range; used as a sync entity id. */
export function verseRangeId(from: string, to: string): string {
  return `${from}..${to}`;
}

export function parseVerseRangeId(rangeId: string): { from: ParsedVerseId; to: ParsedVerseId } {
  const [fromRaw, toRaw, extra] = rangeId.split("..");
  if (!fromRaw || !toRaw || extra !== undefined) {
    throw new Error(`Invalid verse range id: "${rangeId}"`);
  }
  return { from: parseVerseId(fromRaw), to: parseVerseId(toRaw) };
}
