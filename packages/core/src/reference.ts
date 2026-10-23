import { getBook, matchBookAtStart, type Book, type BookCode } from "./books";
import type { VerseCoordinate } from "./verse-id";

export type Reference =
  | { readonly type: "book"; readonly book: BookCode; readonly raw: string }
  | {
      readonly type: "chapter";
      readonly book: BookCode;
      readonly chapter: number;
      readonly raw: string;
    }
  | {
      readonly type: "chapter-range";
      readonly book: BookCode;
      readonly startChapter: number;
      readonly endChapter: number;
      readonly raw: string;
    }
  | {
      readonly type: "verse";
      readonly book: BookCode;
      readonly chapter: number;
      readonly verse: number;
      readonly raw: string;
    }
  | {
      readonly type: "verse-range";
      readonly book: BookCode;
      readonly start: VerseCoordinate;
      readonly end: VerseCoordinate;
      readonly raw: string;
    };

export type ReferenceParseErrorCode =
  | "empty"
  | "unknown-book"
  | "invalid-chapter"
  | "invalid-verse"
  | "invalid-range"
  | "not-single-reference";

export class ReferenceParseError extends Error {
  readonly code: ReferenceParseErrorCode;
  readonly input: string;

  constructor(code: ReferenceParseErrorCode, input: string, message: string) {
    super(message);
    this.name = "ReferenceParseError";
    this.code = code;
    this.input = input;
  }
}

const ORDINAL_WORDS: Record<string, string> = {
  first: "1",
  second: "2",
  third: "3",
  "1st": "1",
  "2nd": "2",
  "3rd": "3",
  i: "1",
  ii: "2",
  iii: "3",
};

function normalizeInput(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(first|second|third|1st|2nd|3rd|i{1,3})\.?\s+(?=[a-z])/i, (match) => {
      const key = match.trim().replace(/\.$/, "").toLowerCase();
      const digit = ORDINAL_WORDS[key];
      return digit ? `${digit} ` : match;
    });
}

function requireChapter(book: Book, chapter: number, input: string): void {
  if (!Number.isInteger(chapter) || chapter < 1 || chapter > book.chapterCount) {
    throw new ReferenceParseError(
      "invalid-chapter",
      input,
      `${book.name} has no chapter ${chapter} (valid range 1-${book.chapterCount})`,
    );
  }
}

function requireVerse(verse: number, input: string): void {
  if (!Number.isInteger(verse) || verse < 1) {
    throw new ReferenceParseError("invalid-verse", input, `Invalid verse number: ${verse}`);
  }
}

function stripRest(rest: string): string {
  return rest
    .trim()
    .replace(/^[\s.,:;]+/, "")
    .replace(/(?<=\d)[a-z]+$/i, "")
    .replace(/[\s;,]+$/, "");
}

function parseNumericReference(book: Book, rest: string, raw: string): Reference {
  // Single-chapter books: "Jude 3" and "Jude 3-4" address verses, not chapters.
  if (book.chapterCount === 1) {
    const singleVerse = /^(\d{1,3})$/.exec(rest);
    if (singleVerse) {
      const verseNumber = Number(singleVerse[1]);
      requireVerse(verseNumber, raw);
      return { type: "verse", book: book.code, chapter: 1, verse: verseNumber, raw };
    }
    const singleVerseRange = /^(\d{1,3})\s*-\s*(\d{1,3})$/.exec(rest);
    if (singleVerseRange) {
      const startVerse = Number(singleVerseRange[1]);
      const endVerse = Number(singleVerseRange[2]);
      requireVerse(startVerse, raw);
      requireVerse(endVerse, raw);
      if (endVerse < startVerse) {
        throw new ReferenceParseError("invalid-range", raw, `Invalid verse range: ${rest}`);
      }
      return {
        type: "verse-range",
        book: book.code,
        start: { chapter: 1, verse: startVerse },
        end: { chapter: 1, verse: endVerse },
        raw,
      };
    }
  }

  const crossChapter = /^(\d{1,3})\s*[:.]\s*(\d{1,3})\s*-\s*(\d{1,3})\s*[:.]\s*(\d{1,3})$/.exec(
    rest,
  );
  if (crossChapter) {
    const startChapter = Number(crossChapter[1]);
    const startVerse = Number(crossChapter[2]);
    const endChapter = Number(crossChapter[3]);
    const endVerse = Number(crossChapter[4]);
    requireChapter(book, startChapter, raw);
    requireChapter(book, endChapter, raw);
    requireVerse(startVerse, raw);
    requireVerse(endVerse, raw);
    if (endChapter < startChapter || (endChapter === startChapter && endVerse < startVerse)) {
      throw new ReferenceParseError("invalid-range", raw, `Invalid reference range: ${rest}`);
    }
    return {
      type: "verse-range",
      book: book.code,
      start: { chapter: startChapter, verse: startVerse },
      end: { chapter: endChapter, verse: endVerse },
      raw,
    };
  }

  const verseRange = /^(\d{1,3})\s*[:.]\s*(\d{1,3})\s*-\s*(\d{1,3})$/.exec(rest);
  if (verseRange) {
    const chapter = Number(verseRange[1]);
    const startVerse = Number(verseRange[2]);
    const endVerse = Number(verseRange[3]);
    requireChapter(book, chapter, raw);
    requireVerse(startVerse, raw);
    requireVerse(endVerse, raw);
    if (endVerse < startVerse) {
      throw new ReferenceParseError("invalid-range", raw, `Invalid verse range: ${rest}`);
    }
    return {
      type: "verse-range",
      book: book.code,
      start: { chapter, verse: startVerse },
      end: { chapter, verse: endVerse },
      raw,
    };
  }

  const chapterRange = /^(\d{1,3})\s*-\s*(\d{1,3})$/.exec(rest);
  if (chapterRange) {
    const startChapter = Number(chapterRange[1]);
    const endChapter = Number(chapterRange[2]);
    requireChapter(book, startChapter, raw);
    requireChapter(book, endChapter, raw);
    if (endChapter < startChapter) {
      throw new ReferenceParseError("invalid-range", raw, `Invalid chapter range: ${rest}`);
    }
    return {
      type: "chapter-range",
      book: book.code,
      startChapter,
      endChapter,
      raw,
    };
  }

  const verse = /^(\d{1,3})\s*[:.]\s*(\d{1,3})$/.exec(rest);
  if (verse) {
    const chapter = Number(verse[1]);
    const verseNumber = Number(verse[2]);
    requireChapter(book, chapter, raw);
    requireVerse(verseNumber, raw);
    return { type: "verse", book: book.code, chapter, verse: verseNumber, raw };
  }

  const chapter = /^(\d{1,3})$/.exec(rest);
  if (chapter) {
    const chapterNumber = Number(chapter[1]);
    requireChapter(book, chapterNumber, raw);
    return { type: "chapter", book: book.code, chapter: chapterNumber, raw };
  }

  throw new ReferenceParseError(
    "not-single-reference",
    raw,
    `Could not read a chapter or verse from "${rest}" for ${book.name}`,
  );
}

/**
 * Parses a single scripture reference.
 * Supported forms: `John`, `John 3`, `John 3:16`, `Jn 3:16-18`,
 * `John 3-4`, `Genesis 1:1-2:3`, `JHN.3.16`, `I John 2:3`, `1 Cor 13`.
 */
export function parseReference(input: string): Reference {
  const raw = input.trim();
  if (!raw) {
    throw new ReferenceParseError("empty", input, "Reference is empty");
  }
  if (raw.includes(",") || raw.includes(";")) {
    throw new ReferenceParseError(
      "not-single-reference",
      input,
      `"${raw}" contains multiple references; use parseReferenceList()`,
    );
  }

  const cleaned = normalizeInput(raw);
  const matched = matchBookAtStart(cleaned);
  if (!matched) {
    throw new ReferenceParseError("unknown-book", input, `Unknown book name in "${raw}"`);
  }
  const rest = stripRest(matched.rest);
  if (!rest) {
    return { type: "book", book: matched.book.code, raw };
  }
  return parseNumericReference(matched.book, rest, raw);
}

export function tryParseReference(input: string): Reference | undefined {
  try {
    return parseReference(input);
  } catch {
    return undefined;
  }
}

interface ListContext {
  readonly book: BookCode;
  readonly chapter?: number;
  readonly kind: "chapter" | "verse";
}

function parseContinuation(token: string, context: ListContext, raw: string): Reference {
  const book = getBook(context.book);
  if (!book) throw new ReferenceParseError("unknown-book", raw, `Unknown book: ${context.book}`);

  const verseToken = /^(\d{1,3})(?:\s*[:.]\s*(\d{1,3}))?$/.exec(token);
  if (!verseToken) {
    throw new ReferenceParseError("not-single-reference", raw, `Cannot read "${token}"`);
  }
  const first = Number(verseToken[1]);
  const second = verseToken[2] === undefined ? undefined : Number(verseToken[2]);

  if (second !== undefined) {
    requireChapter(book, first, raw);
    requireVerse(second, raw);
    return { type: "verse", book: book.code, chapter: first, verse: second, raw };
  }

  if (context.kind === "verse" && context.chapter !== undefined) {
    requireVerse(first, raw);
    return { type: "verse", book: book.code, chapter: context.chapter, verse: first, raw };
  }

  requireChapter(book, first, raw);
  return { type: "chapter", book: book.code, chapter: first, raw };
}

function contextOf(reference: Reference): ListContext | undefined {
  switch (reference.type) {
    case "book":
      return { book: reference.book, kind: "chapter" };
    case "chapter":
      return { book: reference.book, chapter: reference.chapter, kind: "chapter" };
    case "chapter-range":
      return { book: reference.book, chapter: reference.endChapter, kind: "chapter" };
    case "verse":
      return { book: reference.book, chapter: reference.chapter, kind: "verse" };
    case "verse-range":
      return { book: reference.book, chapter: reference.end.chapter, kind: "verse" };
  }
}

/**
 * Parses references with lists, e.g. `John 3:16,18` or `Ps 23; John 3:16`.
 * Continuations inherit the book (and chapter for bare verse numbers).
 */
export function parseReferenceList(input: string): Reference[] {
  const raw = input.trim();
  if (!raw) throw new ReferenceParseError("empty", input, "Reference list is empty");

  const segments = raw.split(";");
  const results: Reference[] = [];
  let context: ListContext | undefined;

  for (const segment of segments) {
    const parts = segment.split(",");
    for (const [index, part] of parts.entries()) {
      const token = part.trim();
      if (!token) {
        throw new ReferenceParseError("empty", input, `Empty reference in "${raw}"`);
      }
      let reference: Reference;
      if (index === 0) {
        reference = parseReference(token);
      } else if (context) {
        reference = parseContinuation(token, context, token);
      } else {
        throw new ReferenceParseError(
          "not-single-reference",
          input,
          `Continuation "${token}" has no preceding book`,
        );
      }
      results.push(reference);
      context = contextOf(reference);
    }
  }

  return results;
}

export function formatReference(reference: Reference, options: { short?: boolean } = {}): string {
  const book = getBook(reference.book);
  const label = book ? (options.short ? book.shortName : book.name) : reference.book;
  switch (reference.type) {
    case "book":
      return label;
    case "chapter":
      return `${label} ${reference.chapter}`;
    case "chapter-range":
      return `${label} ${reference.startChapter}-${reference.endChapter}`;
    case "verse":
      return `${label} ${reference.chapter}:${reference.verse}`;
    case "verse-range": {
      const { start, end } = reference;
      if (start.chapter === end.chapter) {
        return `${label} ${start.chapter}:${start.verse}-${end.verse}`;
      }
      return `${label} ${start.chapter}:${start.verse}-${end.chapter}:${end.verse}`;
    }
  }
}

export function formatReferenceList(
  references: readonly Reference[],
  options: { short?: boolean } = {},
): string {
  return references.map((reference) => formatReference(reference, options)).join("; ");
}
