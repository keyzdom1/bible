import { getBook, type BookCode } from "@holyword/core";
import { cleanText, normalizeUsfmText } from "../text";
import { ContentToolError, type ParsedSource, type SourceVerse } from "../types";

const TEXT_BEARING_MARKERS = new Set([
  "p",
  "m",
  "mi",
  "nb",
  "pc",
  "q",
  "q1",
  "q2",
  "q3",
  "q4",
  "qr",
  "qc",
  "li",
  "li1",
  "li2",
  "li3",
  "li4",
  "pi",
  "pi1",
  "pi2",
  "pi3",
  "ph",
  "b",
  "cls",
  "pmo",
  "pm",
  "pmc",
  "pmr",
  "pr",
  "lit",
  "tr",
  "tc",
  "th",
]);

const IGNORED_MARKER_PREFIXES = [
  "ide",
  "rem",
  "h",
  "toc",
  "mt",
  "ms",
  "mr",
  "s",
  "r",
  "d",
  "sp",
  "cl",
  "cp",
  "ca",
  "va",
  "vp",
  "vj",
  "vd",
  "vc",
  "vg",
  "vn",
  "qa",
  "qd",
  "qm",
  "qs",
  "is",
  "ip",
  "im",
  "io",
  "ie",
  "ib",
  "ili",
  "iot",
  "ipr",
  "iq",
  "fig",
  "f",
  "x",
  "ef",
  "ex",
];

function shouldIgnoreMarker(marker: string): boolean {
  const base = marker.replace(/^\d+/, "");
  return IGNORED_MARKER_PREFIXES.some(
    (prefix) => base === prefix || base.startsWith(`${prefix}${base.charAt(prefix.length)}`),
  );
}

function parsePositiveInteger(raw: string, label: string, file: string): number {
  if (!/^\d+$/.test(raw)) {
    throw new ContentToolError(
      "invalid-reference",
      `${file}: expected a positive integer ${label}, received "${raw}"`,
    );
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ContentToolError("invalid-reference", `${file}: invalid ${label} "${raw}"`);
  }
  return value;
}

/**
 * Parses one USFM book file. Non-canonical books (front matter, Apocrypha) are
 * ignored so a full eBible archive can be ingested without silently adding them
 * to the 66-book canon.
 */
export function parseUsfm(text: string, file = "source.usfm"): ParsedSource | undefined {
  const withoutApparatus = text
    .replace(/^\ufeff/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\\(f|x|fig|ef|ex)\b[\s\S]*?\\\1\*/g, " ");
  const lines = withoutApparatus.split("\n");
  let book: BookCode | undefined;
  let chapter: number | undefined;
  let currentVerse: SourceVerse | undefined;
  const verses: SourceVerse[] = [];
  const seen = new Set<string>();

  const appendText = (fragment: string): void => {
    if (!currentVerse) return;
    const cleaned = normalizeUsfmText(fragment);
    if (!cleaned) return;
    const merged = currentVerse.text ? `${currentVerse.text} ${cleaned}` : cleaned;
    const key = `${currentVerse.book}.${currentVerse.chapter}.${currentVerse.verse}`;
    const index = verses.lastIndexOf(currentVerse);
    currentVerse = { ...currentVerse, text: cleanText(merged) };
    if (index >= 0) verses[index] = currentVerse;
    if (!seen.has(key)) seen.add(key);
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const markerMatch = /^\\(\+?[a-z0-9]+)\s*(.*)$/i.exec(line);
    if (!markerMatch) {
      // Some USFM generators continue a paragraph on the following line.
      appendText(line);
      continue;
    }

    const marker = (markerMatch[1] ?? "").toLowerCase();
    const rest = markerMatch[2] ?? "";

    if (marker === "id") {
      const code = rest.trim().split(/\s+/, 1)[0] ?? "";
      const definition = getBook(code);
      if (!definition) return undefined;
      if (book && book !== definition.code) {
        throw new ContentToolError("multiple-books", `${file}: contains more than one book`);
      }
      book = definition.code;
      continue;
    }

    if (!book) {
      // Front matter has \id FRT; anything else before a canonical \id is ignored.
      continue;
    }

    if (marker === "c") {
      const value = rest.trim().split(/\s+/, 1)[0] ?? "";
      chapter = parsePositiveInteger(value, "chapter", file);
      currentVerse = undefined;
      continue;
    }

    if (marker === "v") {
      if (chapter === undefined) {
        throw new ContentToolError("invalid-reference", `${file}: verse before a chapter marker`);
      }
      const match = /^(\d+)(?:\s+([\s\S]*))?$/.exec(rest);
      if (!match) {
        throw new ContentToolError(
          "invalid-reference",
          `${file}: verse marker must start with a positive integer, received "${rest.slice(0, 30)}"`,
        );
      }
      const verseNumber = parsePositiveInteger(match[1] ?? "", "verse", file);
      const key = `${book}.${chapter}.${verseNumber}`;
      if (seen.has(key)) {
        throw new ContentToolError("duplicate-verse", `${file}: duplicate verse ${key}`);
      }
      const initialText = normalizeUsfmText(match[2] ?? "");
      currentVerse = { book, chapter, verse: verseNumber, text: initialText };
      verses.push(currentVerse);
      seen.add(key);
      continue;
    }

    if (currentVerse && (TEXT_BEARING_MARKERS.has(marker) || !shouldIgnoreMarker(marker))) {
      appendText(rest);
    }
  }

  if (!book) return undefined;
  if (verses.length === 0) {
    throw new ContentToolError("empty-book", `${file}: no verses found for ${book}`);
  }
  return { verses };
}

export function parseUsfmBatch(files: readonly { readonly file: string; readonly text: string }[]) {
  const books = new Map<BookCode, ParsedSource>();
  const verses: SourceVerse[] = [];
  for (const input of files) {
    const parsed = parseUsfm(input.text, input.file);
    if (!parsed) continue;
    const first = parsed.verses[0];
    if (!first) continue;
    if (books.has(first.book)) {
      throw new ContentToolError("duplicate-book", `Duplicate source file for ${first.book}`);
    }
    books.set(first.book, parsed);
    verses.push(...parsed.verses);
  }
  return { verses, books: [...books.keys()] };
}
