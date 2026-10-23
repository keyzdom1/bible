import { BOOKS, getBook, type BookCode, type SyncEntity } from "@holyword/core";
import Dexie, { type Table } from "dexie";
import { ENTITY_TABLE } from "./records";
import {
  LOCAL_SCHEMA_VERSION,
  type DownloadCheckpoint,
  type DownloadChunk,
  type DownloadStore,
  type InstallableContent,
  type LocalBook,
  type LocalChapter,
  type LocalEntityRecord,
  type LocalNoteConflict,
  type LocalPlanProgress,
  type LocalPreferences,
  type LocalReadingPlan,
  type LocalReadingProgress,
  type LocalSearchResult,
  type LocalVersion,
  type LocalVerse,
  type OfflineStore,
  type SearchIndexRecord,
  type SyncQueueRecord,
  type VerseRange,
} from "./types";

const BOOK_ORDER = new Map(BOOKS.map((book) => [book.code, book.order]));

function chapterRows(versionId: string, verses: InstallableContent["verses"]): LocalChapter[] {
  const groups = new Map<string, LocalVerse[]>();
  for (const verse of verses) {
    const key = `${verse.book}:${verse.chapter}`;
    const group = groups.get(key) ?? [];
    group.push({
      version_id: versionId,
      id: verse.id,
      book: verse.book,
      chapter: verse.chapter,
      verse: verse.verse,
      text: verse.text,
    });
    groups.set(key, group);
  }
  const chapters: LocalChapter[] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => a.verse - b.verse);
    const first = group[0];
    const last = group.at(-1);
    if (!first || !last) continue;
    chapters.push({
      version_id: versionId,
      book: first.book,
      chapter: first.chapter,
      verse_count: group.length,
      first_verse: first.id,
      last_verse: last.id,
    });
  }
  return chapters.sort(
    (a, b) =>
      (BOOK_ORDER.get(a.book) ?? 0) - (BOOK_ORDER.get(b.book) ?? 0) || a.chapter - b.chapter,
  );
}

/**
 * IndexedDB implementation for the web PWA. It is a real Dexie database, not an
 * in-memory stand-in, and can be opened in tests with fake-indexeddb.
 */
export class HolyWordDexie extends Dexie implements OfflineStore, DownloadStore {
  versions!: Table<LocalVersion, string>;
  books!: Table<LocalBook, [string, string]>;
  chapters!: Table<LocalChapter, [string, string, number]>;
  verses!: Table<LocalVerse, [string, string]>;
  bookmarks!: Table<LocalEntityRecord, string>;
  highlights!: Table<LocalEntityRecord, string>;
  notes!: Table<LocalEntityRecord, string>;
  folders!: Table<LocalEntityRecord, string>;
  reading_plans!: Table<LocalReadingPlan, string>;
  plan_progress!: Table<LocalPlanProgress, string>;
  reading_progress!: Table<LocalReadingProgress, string>;
  preferences!: Table<LocalPreferences, string>;
  sync_queue!: Table<SyncQueueRecord, string>;
  sync_state!: Table<{ key: string; value: string }, string>;
  note_conflicts!: Table<LocalNoteConflict, string>;
  search_indexes!: Table<SearchIndexRecord, string>;
  downloads!: Table<DownloadCheckpoint, string>;
  download_chunks!: Table<DownloadChunk, [string, number]>;

  constructor(name = "holyword") {
    super(name);
    this.version(LOCAL_SCHEMA_VERSION).stores({
      versions: "version_id",
      books: "[version_id+code], version_id",
      chapters: "[version_id+book+chapter], version_id, [version_id+book]",
      verses: "[version_id+id], version_id, id, [version_id+book], [version_id+book+chapter]",
      bookmarks: "id, verse_id, updated_at",
      highlights: "id, verse_id, updated_at",
      notes: "id, verse_id, folder_id, updated_at",
      folders: "id, parent_id",
      reading_plans: "id, slug",
      plan_progress: "id, plan_id, updated_at",
      reading_progress: "version_id",
      preferences: "id",
      sync_queue: "op_id, status, created_at, [status+created_at], [entity+entity_id]",
      sync_state: "key",
      note_conflicts: "id, note_id, created_at",
      search_indexes: "version_id",
      downloads: "version_id, status",
      download_chunks: "[version_id+offset], version_id",
    });
  }

  async installContent(content: InstallableContent): Promise<void> {
    const manifest = content.manifest;
    const version: LocalVersion = {
      version_id: manifest.versionId,
      version_code: manifest.versionCode,
      name: manifest.name,
      abbreviation: manifest.abbreviation,
      language: manifest.language,
      language_name: manifest.languageName,
      direction: manifest.direction,
      licence: manifest.licence,
      copyright: manifest.licence.copyright,
      attribution: manifest.licence.attribution,
      manifest,
      manifest_sha256: content.manifest_sha256,
      package_bytes: content.archive_bytes,
      storage_bytes: content.archive_bytes,
      verse_count: content.verses.length,
      installed_at: content.installed_at,
      search_ready: false,
    };
    const books: LocalBook[] = manifest.books.map((book) => ({
      version_id: manifest.versionId,
      code: book.code,
      name: book.name,
      order_index: BOOK_ORDER.get(book.code) ?? 0,
      chapter_count: book.chapters,
      verse_count: book.verses,
    }));
    const verses: LocalVerse[] = content.verses.map((verse) => ({
      version_id: manifest.versionId,
      id: verse.id,
      book: verse.book,
      chapter: verse.chapter,
      verse: verse.verse,
      text: verse.text,
    }));
    const chapters = chapterRows(manifest.versionId, content.verses);

    await this.transaction(
      "rw",
      [this.versions, this.books, this.chapters, this.verses, this.search_indexes],
      async () => {
        await this.versions.put(version);
        await this.books.where("version_id").equals(manifest.versionId).delete();
        await this.chapters.where("version_id").equals(manifest.versionId).delete();
        await this.verses.where("version_id").equals(manifest.versionId).delete();
        await this.search_indexes.delete(manifest.versionId);
        await this.books.bulkPut(books);
        await this.chapters.bulkPut(chapters);
        for (let start = 0; start < verses.length; start += 5000) {
          await this.verses.bulkPut(verses.slice(start, start + 5000));
        }
      },
    );
  }

  async deleteVersion(versionId: string): Promise<void> {
    await this.transaction(
      "rw",
      [this.versions, this.books, this.chapters, this.verses, this.search_indexes],
      async () => {
        await this.versions.delete(versionId);
        await this.books.where("version_id").equals(versionId).delete();
        await this.chapters.where("version_id").equals(versionId).delete();
        await this.verses.where("version_id").equals(versionId).delete();
        await this.search_indexes.delete(versionId);
      },
    );
  }

  async listVersions(): Promise<LocalVersion[]> {
    return this.versions.toArray();
  }

  async getVersion(versionId: string): Promise<LocalVersion | undefined> {
    return this.versions.get(versionId);
  }

  async listBooks(versionId: string): Promise<LocalBook[]> {
    const books = await this.books.where("version_id").equals(versionId).toArray();
    return books.sort((a, b) => a.order_index - b.order_index);
  }

  async listChapters(versionId: string, book?: BookCode): Promise<LocalChapter[]> {
    const rows = book
      ? await this.chapters.where("[version_id+book]").equals([versionId, book]).toArray()
      : await this.chapters.where("version_id").equals(versionId).toArray();
    return rows.sort(
      (a, b) =>
        (BOOK_ORDER.get(a.book) ?? 0) - (BOOK_ORDER.get(b.book) ?? 0) || a.chapter - b.chapter,
    );
  }

  async getChapter(versionId: string, book: BookCode, chapter: number): Promise<LocalVerse[]> {
    const rows = await this.verses
      .where("[version_id+book+chapter]")
      .equals([versionId, book, chapter])
      .toArray();
    return rows.sort((a, b) => a.verse - b.verse);
  }

  async getVerse(versionId: string, verseId: string): Promise<LocalVerse | undefined> {
    return this.verses.get([versionId, verseId]);
  }

  async listVerses(versionId: string): Promise<LocalVerse[]> {
    const rows = await this.verses.where("version_id").equals(versionId).toArray();
    return rows.sort(
      (a, b) =>
        (BOOK_ORDER.get(a.book) ?? 0) - (BOOK_ORDER.get(b.book) ?? 0) ||
        a.chapter - b.chapter ||
        a.verse - b.verse,
    );
  }

  async queryVerses(versionId: string, range: VerseRange): Promise<LocalVerse[]> {
    const rows = await this.verses
      .where("[version_id+book]")
      .equals([versionId, range.book])
      .toArray();
    return rows
      .filter((verse) => {
        if (verse.chapter < range.startChapter || verse.chapter > range.endChapter) return false;
        if (
          range.startVerse !== undefined &&
          verse.chapter === range.startChapter &&
          verse.verse < range.startVerse
        ) {
          return false;
        }
        if (
          range.endVerse !== undefined &&
          verse.chapter === range.endChapter &&
          verse.verse > range.endVerse
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.chapter - b.chapter || a.verse - b.verse)
      .slice(0, range.limit);
  }

  async countVerses(versionId: string): Promise<number> {
    return this.verses.where("version_id").equals(versionId).count();
  }

  async markSearchReady(versionId: string, ready: boolean): Promise<void> {
    await this.versions.update(versionId, { search_ready: ready });
  }

  async getLocalRecord(
    entity: SyncEntity,
    entityId: string,
  ): Promise<LocalEntityRecord | undefined> {
    return this.entityTable(entity).get(entityId) as Promise<LocalEntityRecord | undefined>;
  }

  async listLocalRecords(entity: SyncEntity): Promise<LocalEntityRecord[]> {
    return this.entityTable(entity).toArray() as Promise<LocalEntityRecord[]>;
  }

  async commitLocalChange(
    entity: SyncEntity,
    record: LocalEntityRecord,
    queue: SyncQueueRecord,
  ): Promise<void> {
    const table = this.entityTable(entity) as Table<LocalEntityRecord, string>;
    await this.transaction("rw", [table, this.sync_queue], async () => {
      await table.put(record);
      await this.sync_queue.put(queue);
    });
  }

  async putRemoteRecord(entity: SyncEntity, record: LocalEntityRecord): Promise<void> {
    await this.entityTable(entity).put(record);
  }

  async updateRecordServerVersion(
    entity: SyncEntity,
    entityId: string,
    serverVersion: number,
  ): Promise<void> {
    const table = this.entityTable(entity) as Table<LocalEntityRecord, string>;
    const current = await table.get(entityId);
    if (current)
      await table.update(entityId, { server_version: serverVersion } as Partial<LocalEntityRecord>);
  }

  async listQueue(limit: number): Promise<SyncQueueRecord[]> {
    const rows = await this.sync_queue.where("status").equals("pending").toArray();
    return rows.sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(0, limit);
  }

  async getQueueForEntity(
    entity: SyncEntity,
    entityId: string,
  ): Promise<SyncQueueRecord | undefined> {
    return this.sync_queue
      .where("[entity+entity_id]")
      .equals([entity, entityId])
      .and((row) => row.status === "pending")
      .first();
  }

  async putQueue(queue: SyncQueueRecord): Promise<void> {
    await this.sync_queue.put(queue);
  }

  async deleteQueue(opId: string): Promise<void> {
    await this.sync_queue.delete(opId);
  }

  async failQueue(opId: string, reason: string): Promise<void> {
    const row = await this.sync_queue.get(opId);
    if (!row) return;
    await this.sync_queue.put({
      ...row,
      status: "failed",
      attempts: row.attempts + 1,
      last_error: reason,
      updated_at: new Date().toISOString(),
    });
  }

  async retryFailedQueue(): Promise<void> {
    const rows = await this.sync_queue.where("status").equals("failed").toArray();
    await this.sync_queue.bulkPut(
      rows.map((row) => ({
        ...row,
        status: "pending",
        last_error: null,
        updated_at: new Date().toISOString(),
      })),
    );
  }

  async countQueue(): Promise<number> {
    return this.sync_queue.where("status").anyOf(["pending", "failed"]).count();
  }

  async getState(key: string): Promise<string | undefined> {
    return (await this.sync_state.get(key))?.value;
  }

  async setState(key: string, value: string): Promise<void> {
    await this.sync_state.put({ key, value });
  }

  async putNoteConflict(conflict: LocalNoteConflict): Promise<void> {
    await this.note_conflicts.put(conflict);
  }

  async listNoteConflicts(): Promise<LocalNoteConflict[]> {
    const rows = await this.note_conflicts.toArray();
    return rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async deleteNoteConflict(id: string): Promise<void> {
    await this.note_conflicts.delete(id);
  }

  async getSearchIndex(versionId: string): Promise<SearchIndexRecord | undefined> {
    return this.search_indexes.get(versionId);
  }

  async putSearchIndex(index: SearchIndexRecord): Promise<void> {
    await this.search_indexes.put(index);
  }

  async deleteSearchIndex(versionId: string): Promise<void> {
    await this.search_indexes.delete(versionId);
  }

  async putReadingPlan(plan: LocalReadingPlan): Promise<void> {
    await this.reading_plans.put(plan);
  }

  async listReadingPlans(): Promise<LocalReadingPlan[]> {
    const rows = await this.reading_plans.toArray();
    return rows.sort((a, b) => a.title.localeCompare(b.title));
  }

  async deleteReadingPlan(id: string): Promise<void> {
    await this.reading_plans.delete(id);
  }

  async clearLocalData(): Promise<void> {
    await this.transaction("rw", this.tables, async () => {
      await Promise.all(this.tables.map((table) => table.clear()));
    });
  }

  async getDownload(versionId: string): Promise<DownloadCheckpoint | undefined> {
    return this.downloads.get(versionId);
  }

  async putDownload(checkpoint: DownloadCheckpoint): Promise<void> {
    await this.downloads.put(checkpoint);
  }

  async deleteDownload(versionId: string): Promise<void> {
    await this.downloads.delete(versionId);
  }

  async listChunks(versionId: string): Promise<DownloadChunk[]> {
    const chunks = await this.download_chunks.where("version_id").equals(versionId).toArray();
    return chunks.sort((a, b) => a.offset - b.offset);
  }

  async putChunk(chunk: DownloadChunk): Promise<void> {
    await this.download_chunks.put(chunk);
  }

  async deleteChunks(versionId: string): Promise<void> {
    await this.download_chunks.where("version_id").equals(versionId).delete();
  }

  private entityTable(entity: SyncEntity): Table<LocalEntityRecord, string> {
    return this.table(ENTITY_TABLE[entity]) as Table<LocalEntityRecord, string>;
  }
}

export function createDexieStore(name = "holyword"): HolyWordDexie {
  return new HolyWordDexie(name);
}

/** Gets a chapter with its book/version metadata for the reading screen. */
export async function readLocalChapter(
  store: HolyWordDexie,
  versionId: string,
  book: BookCode,
  chapter: number,
): Promise<
  | {
      version: LocalVersion;
      bookName: string;
      chapter: number;
      verses: LocalVerse[];
    }
  | undefined
> {
  const version = await store.getVersion(versionId);
  if (!version) return undefined;
  const verses = await store.getChapter(versionId, book, chapter);
  if (verses.length === 0) return undefined;
  return {
    version,
    bookName: getBook(book)?.name ?? book,
    chapter,
    verses,
  };
}

export type { LocalSearchResult };
