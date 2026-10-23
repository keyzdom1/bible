import { getBook, tryParseReference } from "@holyword/core";
import MiniSearch, { type Options } from "minisearch";
import { searchReference } from "./reference";
import { normalizeSearchText } from "./text";
import type {
  ContentStore,
  LocalSearchEngine,
  LocalSearchResult,
  SearchIndexStore,
} from "../types";

interface SearchDocument {
  readonly id: string;
  readonly text: string;
  readonly book: string;
  readonly bookName: string;
  readonly chapter: number;
  readonly verse: number;
}

const INDEX_OPTIONS: Options<SearchDocument> = {
  idField: "id",
  fields: ["text", "bookName"],
  storeFields: ["text", "book", "chapter", "verse"],
};

function unquote(query: string): string {
  return query
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .trim();
}

type SearchStore = Pick<ContentStore, "listVerses" | "queryVerses"> & SearchIndexStore;

/**
 * Web/offline search: MiniSearch is built and serialised when a version is
 * installed. Reference lookups read the verse table directly.
 */
export class MiniSearchEngine implements LocalSearchEngine {
  private readonly indexes = new Map<string, MiniSearch<SearchDocument>>();

  constructor(private readonly store: SearchStore) {}

  async indexVersion(versionId: string): Promise<void> {
    const verses = await this.store.listVerses(versionId);
    const index = new MiniSearch<SearchDocument>(INDEX_OPTIONS);
    index.addAll(
      verses.map((verse) => ({
        id: verse.id,
        text: verse.text,
        book: verse.book,
        bookName: getBook(verse.book)?.name ?? verse.book,
        chapter: verse.chapter,
        verse: verse.verse,
      })),
    );
    this.indexes.set(versionId, index);
    await this.store.putSearchIndex({
      version_id: versionId,
      json: JSON.stringify(index.toJSON()),
      verse_count: verses.length,
      built_at: new Date().toISOString(),
    });
  }

  async search(versionId: string, query: string, limit = 25): Promise<LocalSearchResult[]> {
    const trimmed = unquote(query);
    if (!trimmed) return [];
    const reference = tryParseReference(trimmed);
    if (reference) return searchReference(this.store, versionId, reference, limit);

    const index = await this.loadIndex(versionId);
    if (!index) return [];
    const words = normalizeSearchText(trimmed).split(" ").filter(Boolean);
    if (words.length === 0) return [];
    const phrase = words.length > 1;
    const results = index.search(trimmed, {
      combineWith: "AND",
      prefix: true,
      fuzzy: phrase ? false : 0.2,
    });
    const needle = words.join(" ");
    const filtered = results.filter((result) => {
      if (!phrase) return true;
      const text = normalizeSearchText(String(result.text ?? ""));
      return text.includes(needle);
    });
    return filtered.slice(0, limit).map((result) => ({
      verseId: String(result.id),
      versionId,
      book: String(result.book) as LocalSearchResult["book"],
      chapter: Number(result.chapter),
      verse: Number(result.verse),
      text: String(result.text),
      score: result.score,
    }));
  }

  async deleteVersion(versionId: string): Promise<void> {
    this.indexes.delete(versionId);
    await this.store.deleteSearchIndex(versionId);
  }

  private async loadIndex(versionId: string): Promise<MiniSearch<SearchDocument> | undefined> {
    const cached = this.indexes.get(versionId);
    if (cached) return cached;
    const stored = await this.store.getSearchIndex(versionId);
    if (!stored) return undefined;
    try {
      const index = MiniSearch.loadJSON<SearchDocument>(stored.json, INDEX_OPTIONS);
      this.indexes.set(versionId, index);
      return index;
    } catch {
      // A corrupt index is rebuildable from the immutable local verses.
      await this.indexVersion(versionId);
      return this.indexes.get(versionId);
    }
  }
}
