import { getBook, getBookByOsisId, isBookCode, type BookCode } from "@holyword/core";
import { cleanText } from "../text";
import { ContentToolError, type ParsedSource, type SourceVerse } from "../types";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveBook(value: unknown, file: string): BookCode {
  if (typeof value !== "string") {
    throw new ContentToolError("invalid-book", `${file}: verse is missing a book code`);
  }
  const direct = getBook(value);
  if (direct) return direct.code;
  const osis = getBookByOsisId(value);
  if (osis) return osis.code;
  throw new ContentToolError("invalid-book", `${file}: unknown book "${value}"`);
}

function positiveInteger(value: unknown, label: string, file: string): number {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isSafeInteger(number) || number < 1) {
    throw new ContentToolError(
      "invalid-reference",
      `${file}: ${label} must be a positive integer, received ${JSON.stringify(value)}`,
    );
  }
  return number;
}

function verseFromParts(
  bookValue: unknown,
  chapterValue: unknown,
  verseValue: unknown,
  textValue: unknown,
  file: string,
): SourceVerse {
  if (typeof textValue !== "string" || cleanText(textValue) === "") {
    throw new ContentToolError("empty-verse", `${file}: verse text must be a non-empty string`);
  }
  return {
    book: resolveBook(bookValue, file),
    chapter: positiveInteger(chapterValue, "chapter", file),
    verse: positiveInteger(verseValue, "verse", file),
    text: cleanText(textValue),
  };
}

function fromVerseArray(value: readonly unknown[], file: string): SourceVerse[] {
  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new ContentToolError("invalid-json", `${file}: verse ${index} must be an object`);
    }
    return verseFromParts(
      item.book ?? item.bookCode ?? item.osisId,
      item.chapter,
      item.verse,
      item.text,
      file,
    );
  });
}

function fromBooksArray(value: readonly unknown[], file: string): SourceVerse[] {
  const verses: SourceVerse[] = [];
  for (const [bookIndex, bookValue] of value.entries()) {
    if (!isRecord(bookValue)) {
      throw new ContentToolError("invalid-json", `${file}: book ${bookIndex} must be an object`);
    }
    const book = resolveBook(bookValue.code ?? bookValue.osisId ?? bookValue.id, file);
    const chapters = bookValue.chapters;
    if (!Array.isArray(chapters)) {
      throw new ContentToolError("invalid-json", `${file}: ${book} chapters must be an array`);
    }
    for (const [chapterIndex, chapterValue] of chapters.entries()) {
      if (!isRecord(chapterValue)) {
        throw new ContentToolError(
          "invalid-json",
          `${file}: ${book} chapter ${chapterIndex} must be an object`,
        );
      }
      const chapter = positiveInteger(chapterValue.number ?? chapterValue.chapter, "chapter", file);
      const chapterVerses = chapterValue.verses;
      if (!Array.isArray(chapterVerses)) {
        throw new ContentToolError(
          "invalid-json",
          `${file}: ${book} ${chapter} verses must be an array`,
        );
      }
      for (const item of chapterVerses) {
        if (!isRecord(item)) {
          throw new ContentToolError(
            "invalid-json",
            `${file}: ${book} ${chapter} verse must be an object`,
          );
        }
        verses.push(
          verseFromParts(book, chapter, item.number ?? item.verse, item.text ?? item.value, file),
        );
      }
    }
  }
  return verses;
}

function fromBookKeyedRecord(value: UnknownRecord, file: string): SourceVerse[] {
  const verses: SourceVerse[] = [];
  for (const [bookKey, chaptersValue] of Object.entries(value)) {
    if (!isBookCode(bookKey) && !getBookByOsisId(bookKey)) continue;
    const book = resolveBook(bookKey, file);
    if (!isRecord(chaptersValue)) {
      throw new ContentToolError("invalid-json", `${file}: ${book} must be an object`);
    }
    for (const [chapterKey, versesValue] of Object.entries(chaptersValue)) {
      const chapter = positiveInteger(chapterKey, "chapter", file);
      if (Array.isArray(versesValue)) {
        for (const [index, item] of versesValue.entries()) {
          if (isRecord(item)) {
            verses.push(
              verseFromParts(
                book,
                chapter,
                item.verse ?? item.number ?? index + 1,
                item.text ?? item.value,
                file,
              ),
            );
          } else {
            verses.push(verseFromParts(book, chapter, index + 1, item, file));
          }
        }
        continue;
      }
      if (!isRecord(versesValue)) {
        throw new ContentToolError("invalid-json", `${file}: ${book} ${chapter} must be an object`);
      }
      for (const [verseKey, textValue] of Object.entries(versesValue)) {
        verses.push(verseFromParts(book, chapter, verseKey, textValue, file));
      }
    }
  }
  return verses;
}

/**
 * Canonical JSON ingestion supports three common shapes:
 *  - `[{ book, chapter, verse, text }]`
 *  - `{ verses: [...] }`
 *  - `{ books: [{ code, chapters: [{ number, verses: [{ number, text }] }] }] }`
 *  - a book-keyed object such as `{ GEN: { "1": { "1": "..." } } }`
 */
export function parseJson(text: string, file = "source.json"): ParsedSource {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new ContentToolError("invalid-json", `${file}: invalid JSON`, { cause: error });
  }

  let verses: SourceVerse[];
  if (Array.isArray(parsed)) {
    verses = fromVerseArray(parsed, file);
  } else if (isRecord(parsed) && Array.isArray(parsed.verses)) {
    verses = fromVerseArray(parsed.verses, file);
  } else if (isRecord(parsed) && Array.isArray(parsed.books)) {
    verses = fromBooksArray(parsed.books, file);
  } else if (isRecord(parsed)) {
    verses = fromBookKeyedRecord(parsed, file);
  } else {
    throw new ContentToolError("invalid-json", `${file}: unsupported JSON shape`);
  }

  if (verses.length === 0) {
    throw new ContentToolError("empty-source", `${file}: no verses found`);
  }
  return { verses };
}
