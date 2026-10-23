import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import {
  BOOKS,
  CHAPTER_COUNTS,
  isBookCode,
  tryParseVerseId,
  type BookCode,
  type VersificationMap,
} from "@holyword/core";
import { parseJson } from "./parsers/json";
import { parseOsis } from "./parsers/osis";
import { parseUsfm } from "./parsers/usfm";
import { ContentToolError, type SourceFormat, type SourceVerse } from "./types";

export interface ReadSourceOptions {
  readonly path: string;
  readonly format?: SourceFormat;
}

interface SourceFile {
  readonly path: string;
  readonly relativePath: string;
}

async function listFiles(root: string): Promise<SourceFile[]> {
  const files: SourceFile[] = [];
  const walk = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.isFile()) {
        files.push({ path, relativePath: path.slice(root.length + 1) });
      }
    }
  };
  await walk(root);
  return files;
}

function detectFormat(path: string): SourceFormat {
  const extension = extname(path).toLowerCase();
  if (extension === ".usfm" || extension === ".sfm") return "usfm";
  if (extension === ".osis" || extension === ".xml") return "osis";
  if (extension === ".json") return "json";
  throw new ContentToolError(
    "unsupported-format",
    `Cannot infer a source format from "${path}"; pass --format usfm|osis|json`,
  );
}

function mergeSources(parts: readonly (readonly SourceVerse[])[]): SourceVerse[] {
  const verses: SourceVerse[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    for (const verse of part) {
      const key = `${verse.book}.${verse.chapter}.${verse.verse}`;
      if (seen.has(key)) {
        throw new ContentToolError("duplicate-verse", `Duplicate verse ${key} in source`);
      }
      seen.add(key);
      verses.push(verse);
    }
  }
  return verses;
}

/** Reads a source file or directory and normalizes it to canonical verse records. */
export async function readSource(options: ReadSourceOptions): Promise<SourceVerse[]> {
  const sourcePath = resolve(options.path);
  const sourceStat = await stat(sourcePath);
  if (sourceStat.isFile()) {
    const format = options.format ?? detectFormat(sourcePath);
    return readOneFile(sourcePath, sourcePath, format);
  }
  if (!sourceStat.isDirectory()) {
    throw new ContentToolError(
      "invalid-source",
      `Source "${sourcePath}" is not a file or directory`,
    );
  }

  const files = await listFiles(sourcePath);
  const format = options.format;
  const selected = files.filter((file) => {
    try {
      return format === undefined || detectFormat(file.path) === format;
    } catch {
      return false;
    }
  });

  if (selected.length === 0) {
    throw new ContentToolError(
      "empty-source",
      `No ${options.format ?? "USFM/OSIS/JSON"} files found under "${sourcePath}"`,
    );
  }

  const parts: SourceVerse[][] = [];
  for (const file of selected) {
    parts.push(await readOneFile(file.path, file.relativePath, format ?? detectFormat(file.path)));
  }
  return mergeSources(parts);
}

async function readOneFile(
  path: string,
  label: string,
  format: SourceFormat,
): Promise<SourceVerse[]> {
  const text = await readFile(path, "utf8");
  if (format === "usfm") {
    return [...(parseUsfm(text, label)?.verses ?? [])];
  }
  if (format === "osis") {
    return [...parseOsis(text, label).verses];
  }
  return [...parseJson(text, label).verses];
}

export interface ValidationOptions {
  readonly metadata: {
    readonly versionId: string;
    readonly requireAllBooks: boolean;
    readonly expected?: {
      readonly totalVerses?: number;
      readonly books?: Partial<Record<BookCode, number>>;
    };
  };
}

export interface ValidatedContent {
  readonly verses: readonly SourceVerse[];
  readonly books: readonly BookCode[];
  readonly totals: { readonly books: number; readonly chapters: number; readonly verses: number };
  readonly chapterCounts: ReadonlyMap<BookCode, readonly number[]>;
}

/**
 * Validates canonical coverage, chapter continuity, verse continuity, duplicates,
 * and operator-supplied expected counts before anything is written to disk.
 */
export function validateContent(
  verses: readonly SourceVerse[],
  options: ValidationOptions,
): ValidatedContent {
  if (verses.length === 0) {
    throw new ContentToolError("empty-source", "The source contains no verses");
  }

  const grouped = new Map<BookCode, Map<number, Map<number, SourceVerse>>>();
  const seen = new Set<string>();
  for (const verse of verses) {
    if (!isBookCode(verse.book)) {
      throw new ContentToolError("invalid-book", `Unknown book code "${verse.book}"`);
    }
    if (!Number.isSafeInteger(verse.chapter) || verse.chapter < 1) {
      throw new ContentToolError(
        "invalid-reference",
        `${verse.book}: invalid chapter ${String(verse.chapter)}`,
      );
    }
    if (!Number.isSafeInteger(verse.verse) || verse.verse < 1) {
      throw new ContentToolError(
        "invalid-reference",
        `${verse.book}.${verse.chapter}: invalid verse ${String(verse.verse)}`,
      );
    }
    if (verse.text.trim() === "") {
      throw new ContentToolError(
        "empty-verse",
        `${verse.book}.${verse.chapter}.${verse.verse}: verse text is empty`,
      );
    }
    const key = `${verse.book}.${verse.chapter}.${verse.verse}`;
    if (seen.has(key)) {
      throw new ContentToolError("duplicate-verse", `Duplicate verse ${key}`);
    }
    seen.add(key);

    const chapters = grouped.get(verse.book) ?? new Map<number, Map<number, SourceVerse>>();
    grouped.set(verse.book, chapters);
    const chapter = chapters.get(verse.chapter) ?? new Map<number, SourceVerse>();
    chapters.set(verse.chapter, chapter);
    if (chapter.has(verse.verse)) {
      throw new ContentToolError("duplicate-verse", `Duplicate verse ${key}`);
    }
    chapter.set(verse.verse, verse);
  }

  const canonicalOrder = new Map<BookCode, number>(BOOKS.map((book) => [book.code, book.order]));
  const books = [...grouped.keys()].sort(
    (a, b) => (canonicalOrder.get(a) ?? 999) - (canonicalOrder.get(b) ?? 999),
  );

  if (options.metadata.requireAllBooks && books.length !== BOOKS.length) {
    const missing = BOOKS.filter((book) => !grouped.has(book.code)).map((book) => book.code);
    throw new ContentToolError(
      "incomplete-canon",
      `The source must contain 66 books; missing ${missing.join(", ")}`,
    );
  }

  let chapterTotal = 0;
  const chapterCounts = new Map<BookCode, readonly number[]>();
  for (const book of books) {
    const chapters = grouped.get(book);
    if (!chapters) continue;
    const expectedChapters = CHAPTER_COUNTS[book];
    const chapterNumbers = [...chapters.keys()].sort((a, b) => a - b);
    if (options.metadata.requireAllBooks && chapterNumbers.length !== expectedChapters) {
      throw new ContentToolError(
        "invalid-chapter-count",
        `${book}: expected ${expectedChapters} chapters, found ${chapterNumbers.length}`,
      );
    }
    const counts: number[] = [];
    for (const chapter of chapterNumbers) {
      if (chapter !== counts.length + 1) {
        throw new ContentToolError(
          "invalid-chapter-sequence",
          `${book}: chapters must be continuous from 1; found ${chapterNumbers.join(", ")}`,
        );
      }
      const chapterVerses = chapters.get(chapter);
      if (!chapterVerses) continue;
      const verseNumbers = [...chapterVerses.keys()].sort((a, b) => a - b);
      for (let index = 0; index < verseNumbers.length; index += 1) {
        if (verseNumbers[index] !== index + 1) {
          throw new ContentToolError(
            "invalid-verse-sequence",
            `${book} ${chapter}: verses must be continuous from 1; found ${verseNumbers.join(", ")}`,
          );
        }
      }
      counts.push(verseNumbers.length);
      chapterTotal += 1;
    }
    chapterCounts.set(book, counts);
  }

  const expected = options.metadata.expected;
  if (expected?.totalVerses !== undefined && verses.length !== expected.totalVerses) {
    throw new ContentToolError(
      "verse-count-mismatch",
      `Expected ${expected.totalVerses} verses, found ${verses.length}`,
    );
  }
  if (expected?.books) {
    for (const [book, count] of Object.entries(expected.books)) {
      if (!isBookCode(book)) {
        throw new ContentToolError(
          "invalid-book",
          `Expected counts contain unknown book "${book}"`,
        );
      }
      const actual = countsForBook(grouped, book);
      if (actual !== count) {
        throw new ContentToolError(
          "verse-count-mismatch",
          `${book}: expected ${count} verses, found ${actual}`,
        );
      }
    }
  }

  return {
    verses,
    books,
    totals: { books: books.length, chapters: chapterTotal, verses: verses.length },
    chapterCounts,
  };
}

function countsForBook(
  grouped: ReadonlyMap<BookCode, ReadonlyMap<number, ReadonlyMap<number, SourceVerse>>>,
  book: BookCode,
): number {
  let total = 0;
  for (const chapter of grouped.get(book)?.values() ?? []) total += chapter.size;
  return total;
}

/** Builds the versification artifact, validating any publisher-supplied counts. */
export function buildVersification(
  content: ValidatedContent,
  input: {
    readonly id: string;
    readonly baseVersionId: string;
    readonly description: string;
    readonly supplied?: VersificationMap;
  },
): VersificationMap {
  const books: Record<string, number[]> = {};
  for (const book of content.books) {
    const counts = content.chapterCounts.get(book) ?? [];
    books[book] = [...counts];
  }

  const supplied = input.supplied;
  if (supplied) {
    if (supplied.id !== input.id) {
      throw new ContentToolError(
        "versification-mismatch",
        `Versification id "${supplied.id}" does not match metadata id "${input.id}"`,
      );
    }
    for (const [book, counts] of Object.entries(supplied.books)) {
      if (!isBookCode(book)) {
        throw new ContentToolError("invalid-book", `Versification contains unknown book "${book}"`);
      }
      const actual = books[book];
      if (!actual) continue;
      for (let chapter = 0; chapter < actual.length; chapter += 1) {
        const suppliedCount = counts[chapter];
        if (suppliedCount !== undefined && suppliedCount !== actual[chapter]) {
          throw new ContentToolError(
            "versification-mismatch",
            `${book} ${chapter + 1}: versification says ${suppliedCount} verses, source has ${actual[chapter]}`,
          );
        }
      }
    }
  }

  const crossVersion = [...(supplied?.crossVersion ?? [])];
  const sourceIds = new Set(
    content.verses.map((verse) => `${verse.book}.${verse.chapter}.${verse.verse}`),
  );
  for (const mapping of crossVersion) {
    for (const [canonical, targets] of Object.entries(mapping.canonicalToTarget)) {
      if (!tryParseVerseId(canonical)) {
        throw new ContentToolError(
          "invalid-versification",
          `${mapping.targetVersionId}: invalid canonical verse id "${canonical}"`,
        );
      }
      for (const target of targets) {
        if (!tryParseVerseId(target)) {
          throw new ContentToolError(
            "invalid-versification",
            `${mapping.targetVersionId}: invalid target verse id "${target}"`,
          );
        }
        // The target must exist in this package; the canonical side may come from
        // another version and is validated by that package.
        if (!sourceIds.has(target)) {
          throw new ContentToolError(
            "invalid-versification",
            `${mapping.targetVersionId}: target verse "${target}" is not in this package`,
          );
        }
      }
    }
  }

  return {
    schemaVersion: 1,
    id: input.id,
    baseVersionId: input.baseVersionId,
    description: input.description,
    books,
    crossVersion,
  };
}
