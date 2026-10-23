import { getBook, type Reference } from "@holyword/core";
import type { ContentStore, LocalSearchResult, VerseRange } from "../types";

export function referenceToVerseRange(reference: Reference, limit: number): VerseRange {
  switch (reference.type) {
    case "book": {
      const book = getBook(reference.book);
      return {
        book: reference.book,
        startChapter: 1,
        endChapter: book?.chapterCount ?? 1,
        limit,
      };
    }
    case "chapter":
      return {
        book: reference.book,
        startChapter: reference.chapter,
        endChapter: reference.chapter,
        limit,
      };
    case "chapter-range":
      return {
        book: reference.book,
        startChapter: reference.startChapter,
        endChapter: reference.endChapter,
        limit,
      };
    case "verse":
      return {
        book: reference.book,
        startChapter: reference.chapter,
        startVerse: reference.verse,
        endChapter: reference.chapter,
        endVerse: reference.verse,
        limit,
      };
    case "verse-range":
      return {
        book: reference.book,
        startChapter: reference.start.chapter,
        startVerse: reference.start.verse,
        endChapter: reference.end.chapter,
        endVerse: reference.end.verse,
        limit,
      };
  }
}

export async function searchReference(
  store: Pick<ContentStore, "queryVerses">,
  versionId: string,
  reference: Reference,
  limit: number,
): Promise<LocalSearchResult[]> {
  const verses = await store.queryVerses(versionId, referenceToVerseRange(reference, limit));
  return verses.map((verse, index) => ({
    verseId: verse.id,
    versionId: verse.version_id,
    book: verse.book,
    chapter: verse.chapter,
    verse: verse.verse,
    text: verse.text,
    score: 1 - index / Math.max(verses.length, 1) / 1000,
  }));
}
