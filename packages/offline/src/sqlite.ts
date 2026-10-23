import { BOOKS, type BookCode, type SyncEntity } from "@holyword/core";
import { ENTITY_TABLE, PREFERENCES_ID } from "./records";
import {
  LOCAL_SCHEMA_VERSION,
  type DownloadCheckpoint,
  type DownloadChunk,
  type DownloadStore,
  type InstallableContent,
  type LocalBook,
  type LocalBookmark,
  type LocalChapter,
  type LocalEntityRecord,
  type LocalFolder,
  type LocalHighlight,
  type LocalNote,
  type LocalNoteConflict,
  type LocalPlanProgress,
  type LocalPreferences,
  type LocalReadingPlan,
  type LocalReadingProgress,
  type LocalSearchEngine,
  type LocalSearchResult,
  type LocalVersion,
  type LocalVerse,
  type OfflineStore,
  type SearchIndexRecord,
  type SyncQueueRecord,
  type VerseRange,
} from "./types";
import { normalizeSearchText } from "./search/text";
import { searchReference } from "./search/reference";
import { tryParseReference } from "@holyword/core";

export type SqliteValue = null | number | bigint | string | Uint8Array;

/** Minimal async SQLite surface implemented by expo-sqlite and the test driver. */
export interface SqliteDriver {
  exec(sql: string): Promise<void>;
  all<T>(sql: string, params?: readonly SqliteValue[]): Promise<T[]>;
  get<T>(sql: string, params?: readonly SqliteValue[]): Promise<T | undefined>;
  run(sql: string, params?: readonly SqliteValue[]): Promise<void>;
  transaction<T>(task: () => Promise<T>): Promise<T>;
}

/**
 * DDL for Expo SQLite. `verses_fts` is an external-content FTS5 index maintained
 * by triggers, so downloaded text is searchable without a second copy.
 */
export const SQLITE_SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS versions (
  version_id TEXT PRIMARY KEY,
  version_code INTEGER NOT NULL,
  name TEXT NOT NULL,
  abbreviation TEXT NOT NULL,
  language TEXT NOT NULL,
  language_name TEXT NOT NULL,
  direction TEXT NOT NULL,
  licence_json TEXT NOT NULL,
  copyright TEXT NOT NULL,
  attribution TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  manifest_sha256 TEXT NOT NULL,
  package_bytes INTEGER NOT NULL,
  storage_bytes INTEGER NOT NULL,
  verse_count INTEGER NOT NULL,
  installed_at TEXT NOT NULL,
  search_ready INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS books (
  version_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  chapter_count INTEGER NOT NULL,
  verse_count INTEGER NOT NULL,
  PRIMARY KEY (version_id, code)
);
CREATE INDEX IF NOT EXISTS books_version_idx ON books(version_id);

CREATE TABLE IF NOT EXISTS chapters (
  version_id TEXT NOT NULL,
  book TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verse_count INTEGER NOT NULL,
  first_verse TEXT NOT NULL,
  last_verse TEXT NOT NULL,
  PRIMARY KEY (version_id, book, chapter)
);
CREATE INDEX IF NOT EXISTS chapters_version_idx ON chapters(version_id);
CREATE INDEX IF NOT EXISTS chapters_book_idx ON chapters(version_id, book);

CREATE TABLE IF NOT EXISTS verses (
  version_id TEXT NOT NULL,
  id TEXT NOT NULL,
  book TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (version_id, id)
);
CREATE INDEX IF NOT EXISTS verses_version_idx ON verses(version_id);
CREATE INDEX IF NOT EXISTS verses_id_idx ON verses(id);
CREATE INDEX IF NOT EXISTS verses_book_idx ON verses(version_id, book);
CREATE INDEX IF NOT EXISTS verses_chapter_idx ON verses(version_id, book, chapter);

CREATE VIRTUAL TABLE IF NOT EXISTS verses_fts USING fts5(
  text,
  content='verses',
  content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS verses_ai AFTER INSERT ON verses BEGIN
  INSERT INTO verses_fts(rowid, text) VALUES (new.rowid, new.text);
END;
CREATE TRIGGER IF NOT EXISTS verses_ad AFTER DELETE ON verses BEGIN
  INSERT INTO verses_fts(verses_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
END;
CREATE TRIGGER IF NOT EXISTS verses_au AFTER UPDATE ON verses BEGIN
  INSERT INTO verses_fts(verses_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
  INSERT INTO verses_fts(rowid, text) VALUES (new.rowid, new.text);
END;

CREATE TABLE IF NOT EXISTS bookmarks (
  id TEXT PRIMARY KEY,
  verse_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  label TEXT,
  hlc TEXT NOT NULL,
  server_version INTEGER NOT NULL,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS bookmarks_verse_idx ON bookmarks(verse_id);

CREATE TABLE IF NOT EXISTS highlights (
  id TEXT PRIMARY KEY,
  verse_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  color TEXT NOT NULL,
  start_offset INTEGER,
  end_offset INTEGER,
  hlc TEXT NOT NULL,
  server_version INTEGER NOT NULL,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS highlights_verse_idx ON highlights(verse_id);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  verse_id TEXT,
  reference TEXT,
  title TEXT,
  body TEXT NOT NULL,
  folder_id TEXT,
  hlc TEXT NOT NULL,
  server_version INTEGER NOT NULL,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS notes_verse_idx ON notes(verse_id);
CREATE INDEX IF NOT EXISTS notes_folder_idx ON notes(folder_id);

CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT,
  hlc TEXT NOT NULL,
  server_version INTEGER NOT NULL,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reading_plans (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  day_count INTEGER NOT NULL,
  schedule_json TEXT NOT NULL,
  is_published INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plan_progress (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  day_number INTEGER NOT NULL,
  completed_at TEXT,
  hlc TEXT NOT NULL,
  server_version INTEGER NOT NULL,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS plan_progress_plan_idx ON plan_progress(plan_id);

CREATE TABLE IF NOT EXISTS reading_progress (
  version_id TEXT PRIMARY KEY,
  book TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER,
  hlc TEXT NOT NULL,
  server_version INTEGER NOT NULL,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS preferences (
  id TEXT PRIMARY KEY,
  theme TEXT NOT NULL,
  reading_theme TEXT NOT NULL,
  font_scale INTEGER NOT NULL,
  active_version_id TEXT,
  last_location_json TEXT,
  hlc TEXT NOT NULL,
  server_version INTEGER NOT NULL,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_queue (
  op_id TEXT PRIMARY KEY,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  op TEXT NOT NULL,
  payload_json TEXT,
  hlc TEXT NOT NULL,
  base_version INTEGER NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  last_error TEXT,
  revision INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sync_queue_status_idx ON sync_queue(status, created_at);
CREATE INDEX IF NOT EXISTS sync_queue_entity_idx ON sync_queue(entity, entity_id);

CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS note_conflicts (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  local_payload_json TEXT NOT NULL,
  remote_payload_json TEXT NOT NULL,
  local_hlc TEXT NOT NULL,
  remote_hlc TEXT NOT NULL,
  server_conflict_id TEXT,
  resolution TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS note_conflicts_note_idx ON note_conflicts(note_id);

CREATE TABLE IF NOT EXISTS search_indexes (
  version_id TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  verse_count INTEGER NOT NULL,
  built_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS downloads (
  version_id TEXT PRIMARY KEY,
  version_code INTEGER NOT NULL,
  checksum TEXT NOT NULL,
  status TEXT NOT NULL,
  received_bytes INTEGER NOT NULL,
  total_bytes INTEGER,
  etag TEXT,
  last_modified TEXT,
  error_code TEXT,
  error_message TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS downloads_status_idx ON downloads(status);

CREATE TABLE IF NOT EXISTS download_chunks (
  version_id TEXT NOT NULL,
  offset INTEGER NOT NULL,
  bytes BLOB NOT NULL,
  PRIMARY KEY (version_id, offset)
);
`;

const BOOK_ORDER = new Map(BOOKS.map((book) => [book.code, book.order]));

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function bytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new Error("Expected a BLOB value from SQLite");
}

interface VersionRow {
  version_id: string;
  version_code: number;
  name: string;
  abbreviation: string;
  language: string;
  language_name: string;
  direction: string;
  licence_json: string;
  copyright: string;
  attribution: string;
  manifest_json: string;
  manifest_sha256: string;
  package_bytes: number;
  storage_bytes: number;
  verse_count: number;
  installed_at: string;
  search_ready: number;
}

interface EntityRow {
  [key: string]: unknown;
}

function versionFromRow(row: VersionRow): LocalVersion {
  return {
    version_id: row.version_id,
    version_code: row.version_code,
    name: row.name,
    abbreviation: row.abbreviation,
    language: row.language,
    language_name: row.language_name,
    direction: row.direction === "rtl" ? "rtl" : "ltr",
    licence: parseJson(row.licence_json),
    copyright: row.copyright,
    attribution: row.attribution,
    manifest: parseJson(row.manifest_json),
    manifest_sha256: row.manifest_sha256,
    package_bytes: row.package_bytes,
    storage_bytes: row.storage_bytes,
    verse_count: row.verse_count,
    installed_at: row.installed_at,
    search_ready: row.search_ready === 1,
  };
}

/** SQLite implementation used by Expo; node:sqlite is used in tests through the same interface. */
export class SqliteOfflineDatabase implements OfflineStore, DownloadStore {
  constructor(private readonly driver: SqliteDriver) {}

  async initialize(): Promise<void> {
    const row = await this.driver.get<{ user_version: number }>("PRAGMA user_version");
    const version = Number(row?.user_version ?? 0);
    if (version > LOCAL_SCHEMA_VERSION) {
      throw new Error(
        `Local database schema ${version} is newer than this app supports (${LOCAL_SCHEMA_VERSION})`,
      );
    }
    if (version === 0) {
      await this.driver.exec(SQLITE_SCHEMA_SQL);
      await this.driver.exec(`PRAGMA user_version = ${LOCAL_SCHEMA_VERSION}`);
    }
  }

  async clearLocalData(): Promise<void> {
    const tables = [
      "versions",
      "books",
      "chapters",
      "verses",
      "bookmarks",
      "highlights",
      "notes",
      "folders",
      "reading_plans",
      "plan_progress",
      "reading_progress",
      "preferences",
      "sync_queue",
      "sync_state",
      "note_conflicts",
      "search_indexes",
      "downloads",
      "download_chunks",
    ];
    await this.driver.transaction(async () => {
      for (const table of tables) await this.driver.run(`DELETE FROM ${table}`);
    });
  }

  async installContent(content: InstallableContent): Promise<void> {
    const manifest = content.manifest;
    const chapters = this.chapterRows(manifest.versionId, content.verses);
    await this.driver.transaction(async () => {
      await this.deleteVersionRows(manifest.versionId);
      await this.driver.run(
        `INSERT INTO versions (
          version_id, version_code, name, abbreviation, language, language_name, direction,
          licence_json, copyright, attribution, manifest_json, manifest_sha256,
          package_bytes, storage_bytes, verse_count, installed_at, search_ready
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          manifest.versionId,
          manifest.versionCode,
          manifest.name,
          manifest.abbreviation,
          manifest.language,
          manifest.languageName,
          manifest.direction,
          JSON.stringify(manifest.licence),
          manifest.licence.copyright,
          manifest.licence.attribution,
          JSON.stringify(manifest),
          content.manifest_sha256,
          content.archive_bytes,
          content.archive_bytes,
          content.verses.length,
          content.installed_at,
        ],
      );
      for (const book of manifest.books) {
        await this.driver.run(
          `INSERT INTO books (version_id, code, name, order_index, chapter_count, verse_count)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            manifest.versionId,
            book.code,
            book.name,
            BOOK_ORDER.get(book.code) ?? 0,
            book.chapters,
            book.verses,
          ],
        );
      }
      for (const chapter of chapters) {
        await this.driver.run(
          `INSERT INTO chapters (version_id, book, chapter, verse_count, first_verse, last_verse)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            chapter.version_id,
            chapter.book,
            chapter.chapter,
            chapter.verse_count,
            chapter.first_verse,
            chapter.last_verse,
          ],
        );
      }
      for (const verse of content.verses) {
        await this.driver.run(
          `INSERT INTO verses (version_id, id, book, chapter, verse, text) VALUES (?, ?, ?, ?, ?, ?)`,
          [manifest.versionId, verse.id, verse.book, verse.chapter, verse.verse, verse.text],
        );
      }
    });
  }

  async deleteVersion(versionId: string): Promise<void> {
    await this.driver.transaction(async () => {
      await this.deleteVersionRows(versionId);
    });
  }

  async listVersions(): Promise<LocalVersion[]> {
    const rows = await this.driver.all<VersionRow>("SELECT * FROM versions");
    return rows.map(versionFromRow);
  }

  async getVersion(versionId: string): Promise<LocalVersion | undefined> {
    const row = await this.driver.get<VersionRow>("SELECT * FROM versions WHERE version_id = ?", [
      versionId,
    ]);
    return row ? versionFromRow(row) : undefined;
  }

  async listBooks(versionId: string): Promise<LocalBook[]> {
    const rows = await this.driver.all<{
      version_id: string;
      code: string;
      name: string;
      order_index: number;
      chapter_count: number;
      verse_count: number;
    }>("SELECT * FROM books WHERE version_id = ? ORDER BY order_index", [versionId]);
    return rows.map((row) => ({ ...row, code: row.code as BookCode }));
  }

  async listChapters(versionId: string, book?: BookCode): Promise<LocalChapter[]> {
    const rows = book
      ? await this.driver.all<LocalChapter>(
          "SELECT * FROM chapters WHERE version_id = ? AND book = ?",
          [versionId, book],
        )
      : await this.driver.all<LocalChapter>("SELECT * FROM chapters WHERE version_id = ?", [
          versionId,
        ]);
    return rows.sort(
      (a, b) =>
        (BOOK_ORDER.get(a.book) ?? 0) - (BOOK_ORDER.get(b.book) ?? 0) || a.chapter - b.chapter,
    );
  }

  async getChapter(versionId: string, book: BookCode, chapter: number): Promise<LocalVerse[]> {
    const rows = await this.driver.all<LocalVerse>(
      "SELECT * FROM verses WHERE version_id = ? AND book = ? AND chapter = ? ORDER BY verse",
      [versionId, book, chapter],
    );
    return rows;
  }

  async getVerse(versionId: string, verseId: string): Promise<LocalVerse | undefined> {
    return this.driver.get<LocalVerse>("SELECT * FROM verses WHERE version_id = ? AND id = ?", [
      versionId,
      verseId,
    ]);
  }

  async listVerses(versionId: string): Promise<LocalVerse[]> {
    const rows = await this.driver.all<LocalVerse>("SELECT * FROM verses WHERE version_id = ?", [
      versionId,
    ]);
    return rows.sort(
      (a, b) =>
        (BOOK_ORDER.get(a.book) ?? 0) - (BOOK_ORDER.get(b.book) ?? 0) ||
        a.chapter - b.chapter ||
        a.verse - b.verse,
    );
  }

  async queryVerses(versionId: string, range: VerseRange): Promise<LocalVerse[]> {
    const rows = await this.driver.all<LocalVerse>(
      "SELECT * FROM verses WHERE version_id = ? AND book = ? AND chapter >= ? AND chapter <= ?",
      [versionId, range.book, range.startChapter, range.endChapter],
    );
    return rows
      .filter((verse) => {
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
    const row = await this.driver.get<{ count: number }>(
      "SELECT COUNT(*) AS count FROM verses WHERE version_id = ?",
      [versionId],
    );
    return Number(row?.count ?? 0);
  }

  async markSearchReady(versionId: string, ready: boolean): Promise<void> {
    await this.driver.run("UPDATE versions SET search_ready = ? WHERE version_id = ?", [
      ready ? 1 : 0,
      versionId,
    ]);
  }

  async putReadingPlan(plan: LocalReadingPlan): Promise<void> {
    await this.driver.run(
      `INSERT INTO reading_plans (
        id, slug, title, description, day_count, schedule_json, is_published, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        slug = excluded.slug,
        title = excluded.title,
        description = excluded.description,
        day_count = excluded.day_count,
        schedule_json = excluded.schedule_json,
        is_published = excluded.is_published,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at`,
      [
        plan.id,
        plan.slug,
        plan.title,
        plan.description,
        plan.day_count,
        JSON.stringify(plan.schedule),
        plan.is_published ? 1 : 0,
        plan.created_at,
        plan.updated_at,
      ],
    );
  }

  async listReadingPlans(): Promise<LocalReadingPlan[]> {
    const rows = await this.driver.all<{
      id: string;
      slug: string;
      title: string;
      description: string;
      day_count: number;
      schedule_json: string;
      is_published: number;
      created_at: string;
      updated_at: string;
    }>("SELECT * FROM reading_plans ORDER BY title");
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      day_count: Number(row.day_count),
      schedule: JSON.parse(row.schedule_json) as LocalReadingPlan["schedule"],
      is_published: row.is_published === 1,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  }

  async deleteReadingPlan(id: string): Promise<void> {
    await this.driver.run("DELETE FROM reading_plans WHERE id = ?", [id]);
  }

  async getLocalRecord(
    entity: SyncEntity,
    entityId: string,
  ): Promise<LocalEntityRecord | undefined> {
    const table = ENTITY_TABLE[entity];
    const pk = this.primaryKey(entity);
    const row = await this.driver.get<EntityRow>(`SELECT * FROM ${table} WHERE ${pk} = ?`, [
      entityId,
    ]);
    return row ? this.rowToRecord(entity, row) : undefined;
  }

  async listLocalRecords(entity: SyncEntity): Promise<LocalEntityRecord[]> {
    const rows = await this.driver.all<EntityRow>(`SELECT * FROM ${ENTITY_TABLE[entity]}`);
    return rows.map((row) => this.rowToRecord(entity, row));
  }

  async commitLocalChange(
    entity: SyncEntity,
    record: LocalEntityRecord,
    queue: SyncQueueRecord,
  ): Promise<void> {
    await this.driver.transaction(async () => {
      await this.putRecord(entity, record);
      await this.putQueue(queue);
    });
  }

  async putRemoteRecord(entity: SyncEntity, record: LocalEntityRecord): Promise<void> {
    await this.putRecord(entity, record);
  }

  async updateRecordServerVersion(
    entity: SyncEntity,
    entityId: string,
    serverVersion: number,
  ): Promise<void> {
    await this.driver.run(
      `UPDATE ${ENTITY_TABLE[entity]} SET server_version = ? WHERE ${this.primaryKey(entity)} = ?`,
      [serverVersion, entityId],
    );
  }

  async listQueue(limit: number): Promise<SyncQueueRecord[]> {
    const rows = await this.driver.all<EntityRow>(
      "SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY created_at, op_id LIMIT ?",
      [limit],
    );
    return rows.map((row) => this.rowToQueue(row));
  }

  async getQueueForEntity(
    entity: SyncEntity,
    entityId: string,
  ): Promise<SyncQueueRecord | undefined> {
    const row = await this.driver.get<EntityRow>(
      "SELECT * FROM sync_queue WHERE entity = ? AND entity_id = ? AND status = 'pending' ORDER BY created_at LIMIT 1",
      [entity, entityId],
    );
    return row ? this.rowToQueue(row) : undefined;
  }

  async putQueue(queue: SyncQueueRecord): Promise<void> {
    await this.putQueueRow(queue);
  }

  async deleteQueue(opId: string): Promise<void> {
    await this.driver.run("DELETE FROM sync_queue WHERE op_id = ?", [opId]);
  }

  async failQueue(opId: string, reason: string): Promise<void> {
    await this.driver.run(
      "UPDATE sync_queue SET status = 'failed', attempts = attempts + 1, last_error = ?, updated_at = ? WHERE op_id = ?",
      [reason, new Date().toISOString(), opId],
    );
  }

  async retryFailedQueue(): Promise<void> {
    await this.driver.run(
      "UPDATE sync_queue SET status = 'pending', last_error = NULL, updated_at = ? WHERE status = 'failed'",
      [new Date().toISOString()],
    );
  }

  async countQueue(): Promise<number> {
    const row = await this.driver.get<{ count: number }>(
      "SELECT COUNT(*) AS count FROM sync_queue WHERE status IN ('pending', 'failed')",
    );
    return Number(row?.count ?? 0);
  }

  async getState(key: string): Promise<string | undefined> {
    const row = await this.driver.get<{ value: string }>(
      "SELECT value FROM sync_state WHERE key = ?",
      [key],
    );
    return row?.value;
  }

  async setState(key: string, value: string): Promise<void> {
    await this.driver.run(
      "INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [key, value],
    );
  }

  async putNoteConflict(conflict: LocalNoteConflict): Promise<void> {
    await this.driver.run(
      `INSERT INTO note_conflicts (
        id, note_id, local_payload_json, remote_payload_json, local_hlc, remote_hlc,
        server_conflict_id, resolution, resolved_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        local_payload_json = excluded.local_payload_json,
        remote_payload_json = excluded.remote_payload_json,
        resolution = excluded.resolution,
        resolved_at = excluded.resolved_at`,
      [
        conflict.id,
        conflict.note_id,
        JSON.stringify(conflict.local_payload),
        JSON.stringify(conflict.remote_payload),
        conflict.local_hlc,
        conflict.remote_hlc,
        conflict.server_conflict_id,
        conflict.resolution,
        conflict.resolved_at,
        conflict.created_at,
      ],
    );
  }

  async listNoteConflicts(): Promise<LocalNoteConflict[]> {
    const rows = await this.driver.all<EntityRow>(
      "SELECT * FROM note_conflicts ORDER BY created_at",
    );
    return rows.map((row) => ({
      id: String(row.id),
      note_id: String(row.note_id),
      local_payload: parseJson(String(row.local_payload_json)),
      remote_payload: parseJson(String(row.remote_payload_json)),
      local_hlc: String(row.local_hlc),
      remote_hlc: String(row.remote_hlc),
      server_conflict_id: row.server_conflict_id === null ? null : String(row.server_conflict_id),
      resolution: (row.resolution as LocalNoteConflict["resolution"]) ?? null,
      resolved_at: row.resolved_at === null ? null : String(row.resolved_at),
      created_at: String(row.created_at),
    }));
  }

  async deleteNoteConflict(id: string): Promise<void> {
    await this.driver.run("DELETE FROM note_conflicts WHERE id = ?", [id]);
  }

  async getSearchIndex(versionId: string): Promise<SearchIndexRecord | undefined> {
    return this.driver.get<SearchIndexRecord>("SELECT * FROM search_indexes WHERE version_id = ?", [
      versionId,
    ]);
  }

  async putSearchIndex(index: SearchIndexRecord): Promise<void> {
    await this.driver.run(
      `INSERT INTO search_indexes (version_id, json, verse_count, built_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(version_id) DO UPDATE SET json = excluded.json, verse_count = excluded.verse_count, built_at = excluded.built_at`,
      [index.version_id, index.json, index.verse_count, index.built_at],
    );
  }

  async deleteSearchIndex(versionId: string): Promise<void> {
    await this.driver.run("DELETE FROM search_indexes WHERE version_id = ?", [versionId]);
  }

  async getDownload(versionId: string): Promise<DownloadCheckpoint | undefined> {
    const row = await this.driver.get<EntityRow>("SELECT * FROM downloads WHERE version_id = ?", [
      versionId,
    ]);
    return row ? this.rowToDownload(row) : undefined;
  }

  async putDownload(checkpoint: DownloadCheckpoint): Promise<void> {
    await this.driver.run(
      `INSERT INTO downloads (
        version_id, version_code, checksum, status, received_bytes, total_bytes, etag,
        last_modified, error_code, error_message, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(version_id) DO UPDATE SET
        version_code = excluded.version_code,
        checksum = excluded.checksum,
        status = excluded.status,
        received_bytes = excluded.received_bytes,
        total_bytes = excluded.total_bytes,
        etag = excluded.etag,
        last_modified = excluded.last_modified,
        error_code = excluded.error_code,
        error_message = excluded.error_message,
        updated_at = excluded.updated_at`,
      [
        checkpoint.version_id,
        checkpoint.version_code,
        checkpoint.checksum,
        checkpoint.status,
        checkpoint.received_bytes,
        checkpoint.total_bytes,
        checkpoint.etag,
        checkpoint.last_modified,
        checkpoint.error_code,
        checkpoint.error_message,
        checkpoint.updated_at,
      ],
    );
  }

  async deleteDownload(versionId: string): Promise<void> {
    await this.driver.run("DELETE FROM downloads WHERE version_id = ?", [versionId]);
  }

  async listChunks(versionId: string): Promise<DownloadChunk[]> {
    const rows = await this.driver.all<{ version_id: string; offset: number; bytes: unknown }>(
      "SELECT version_id, offset, bytes FROM download_chunks WHERE version_id = ? ORDER BY offset",
      [versionId],
    );
    return rows.map((row) => ({
      version_id: row.version_id,
      offset: row.offset,
      bytes: bytes(row.bytes),
    }));
  }

  async putChunk(chunk: DownloadChunk): Promise<void> {
    await this.driver.run(
      "INSERT INTO download_chunks (version_id, offset, bytes) VALUES (?, ?, ?) ON CONFLICT(version_id, offset) DO UPDATE SET bytes = excluded.bytes",
      [chunk.version_id, chunk.offset, chunk.bytes],
    );
  }

  async deleteChunks(versionId: string): Promise<void> {
    await this.driver.run("DELETE FROM download_chunks WHERE version_id = ?", [versionId]);
  }

  private async deleteVersionRows(versionId: string): Promise<void> {
    await this.driver.run("DELETE FROM verses WHERE version_id = ?", [versionId]);
    await this.driver.run("DELETE FROM chapters WHERE version_id = ?", [versionId]);
    await this.driver.run("DELETE FROM books WHERE version_id = ?", [versionId]);
    await this.driver.run("DELETE FROM search_indexes WHERE version_id = ?", [versionId]);
    await this.driver.run("DELETE FROM versions WHERE version_id = ?", [versionId]);
  }

  private chapterRows(versionId: string, verses: InstallableContent["verses"]): LocalChapter[] {
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

  private primaryKey(entity: SyncEntity): string {
    return entity === "reading-progress" ? "version_id" : entity === "preference" ? "id" : "id";
  }

  private async putRecord(entity: SyncEntity, record: LocalEntityRecord): Promise<void> {
    switch (entity) {
      case "bookmark": {
        const row = record as LocalBookmark;
        await this.upsert(
          "bookmarks",
          ["id"],
          [
            row.id,
            row.verse_id,
            row.version_id,
            row.label,
            row.hlc,
            row.server_version,
            row.deleted_at,
            row.created_at,
            row.updated_at,
          ],
          [
            "id",
            "verse_id",
            "version_id",
            "label",
            "hlc",
            "server_version",
            "deleted_at",
            "created_at",
            "updated_at",
          ],
        );
        return;
      }
      case "highlight": {
        const row = record as LocalHighlight;
        await this.upsert(
          "highlights",
          ["id"],
          [
            row.id,
            row.verse_id,
            row.version_id,
            row.color,
            row.start_offset,
            row.end_offset,
            row.hlc,
            row.server_version,
            row.deleted_at,
            row.created_at,
            row.updated_at,
          ],
          [
            "id",
            "verse_id",
            "version_id",
            "color",
            "start_offset",
            "end_offset",
            "hlc",
            "server_version",
            "deleted_at",
            "created_at",
            "updated_at",
          ],
        );
        return;
      }
      case "note": {
        const row = record as LocalNote;
        await this.upsert(
          "notes",
          ["id"],
          [
            row.id,
            row.verse_id,
            row.reference,
            row.title,
            row.body,
            row.folder_id,
            row.hlc,
            row.server_version,
            row.deleted_at,
            row.created_at,
            row.updated_at,
          ],
          [
            "id",
            "verse_id",
            "reference",
            "title",
            "body",
            "folder_id",
            "hlc",
            "server_version",
            "deleted_at",
            "created_at",
            "updated_at",
          ],
        );
        return;
      }
      case "folder": {
        const row = record as LocalFolder;
        await this.upsert(
          "folders",
          ["id"],
          [
            row.id,
            row.name,
            row.parent_id,
            row.hlc,
            row.server_version,
            row.deleted_at,
            row.created_at,
            row.updated_at,
          ],
          [
            "id",
            "name",
            "parent_id",
            "hlc",
            "server_version",
            "deleted_at",
            "created_at",
            "updated_at",
          ],
        );
        return;
      }
      case "reading-plan-progress": {
        const row = record as LocalPlanProgress;
        await this.upsert(
          "plan_progress",
          ["id"],
          [
            row.id,
            row.plan_id,
            row.day_number,
            row.completed_at,
            row.hlc,
            row.server_version,
            row.deleted_at,
            row.created_at,
            row.updated_at,
          ],
          [
            "id",
            "plan_id",
            "day_number",
            "completed_at",
            "hlc",
            "server_version",
            "deleted_at",
            "created_at",
            "updated_at",
          ],
        );
        return;
      }
      case "reading-progress": {
        const row = record as LocalReadingProgress;
        await this.upsert(
          "reading_progress",
          ["version_id"],
          [
            row.version_id,
            row.book,
            row.chapter,
            row.verse,
            row.hlc,
            row.server_version,
            row.deleted_at,
            row.created_at,
            row.updated_at,
          ],
          [
            "version_id",
            "book",
            "chapter",
            "verse",
            "hlc",
            "server_version",
            "deleted_at",
            "created_at",
            "updated_at",
          ],
        );
        return;
      }
      case "preference": {
        const row = record as LocalPreferences;
        await this.upsert(
          "preferences",
          ["id"],
          [
            row.id,
            row.theme,
            row.reading_theme,
            row.font_scale,
            row.active_version_id,
            row.last_location ? JSON.stringify(row.last_location) : null,
            row.hlc,
            row.server_version,
            row.deleted_at,
            row.created_at,
            row.updated_at,
          ],
          [
            "id",
            "theme",
            "reading_theme",
            "font_scale",
            "active_version_id",
            "last_location_json",
            "hlc",
            "server_version",
            "deleted_at",
            "created_at",
            "updated_at",
          ],
        );
      }
    }
  }

  private async upsert(
    table: string,
    keyColumns: readonly string[],
    values: readonly SqliteValue[],
    columns: readonly string[],
  ): Promise<void> {
    const placeholders = columns.map(() => "?").join(", ");
    const updates = columns
      .filter((column) => !keyColumns.includes(column))
      .map((column) => `${column} = excluded.${column}`)
      .join(", ");
    await this.driver.run(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})
       ON CONFLICT(${keyColumns.join(", ")}) DO UPDATE SET ${updates}`,
      values,
    );
  }

  private async putQueueRow(queue: SyncQueueRecord): Promise<void> {
    await this.driver.run(
      `INSERT INTO sync_queue (
        op_id, entity, entity_id, op, payload_json, hlc, base_version, status,
        attempts, last_error, revision, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(op_id) DO UPDATE SET
        payload_json = excluded.payload_json,
        hlc = excluded.hlc,
        base_version = excluded.base_version,
        status = excluded.status,
        attempts = excluded.attempts,
        last_error = excluded.last_error,
        revision = excluded.revision,
        updated_at = excluded.updated_at`,
      [
        queue.op_id,
        queue.entity,
        queue.entity_id,
        queue.op,
        queue.payload ? JSON.stringify(queue.payload) : null,
        queue.hlc,
        queue.base_version,
        queue.status,
        queue.attempts,
        queue.last_error,
        queue.revision,
        queue.created_at,
        queue.updated_at,
      ],
    );
  }

  private rowToRecord(entity: SyncEntity, row: EntityRow): LocalEntityRecord {
    const base = {
      hlc: String(row.hlc),
      server_version: Number(row.server_version),
      deleted_at: row.deleted_at === null ? null : String(row.deleted_at),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    };
    switch (entity) {
      case "bookmark":
        return {
          ...base,
          id: String(row.id),
          verse_id: String(row.verse_id),
          version_id: String(row.version_id),
          label: row.label === null ? null : String(row.label),
        };
      case "highlight":
        return {
          ...base,
          id: String(row.id),
          verse_id: String(row.verse_id),
          version_id: String(row.version_id),
          color: String(row.color) as LocalHighlight["color"],
          start_offset: row.start_offset === null ? null : Number(row.start_offset),
          end_offset: row.end_offset === null ? null : Number(row.end_offset),
        };
      case "note":
        return {
          ...base,
          id: String(row.id),
          verse_id: row.verse_id === null ? null : String(row.verse_id),
          reference: row.reference === null ? null : String(row.reference),
          title: row.title === null ? null : String(row.title),
          body: String(row.body),
          folder_id: row.folder_id === null ? null : String(row.folder_id),
        };
      case "folder":
        return {
          ...base,
          id: String(row.id),
          name: String(row.name),
          parent_id: row.parent_id === null ? null : String(row.parent_id),
        };
      case "reading-plan-progress":
        return {
          ...base,
          id: String(row.id),
          plan_id: String(row.plan_id),
          day_number: Number(row.day_number),
          completed_at: row.completed_at === null ? null : String(row.completed_at),
        };
      case "reading-progress":
        return {
          ...base,
          version_id: String(row.version_id),
          book: String(row.book) as BookCode,
          chapter: Number(row.chapter),
          verse: row.verse === null ? null : Number(row.verse),
        };
      case "preference":
        return {
          ...base,
          id: PREFERENCES_ID,
          theme: String(row.theme) as LocalPreferences["theme"],
          reading_theme: String(row.reading_theme) as LocalPreferences["reading_theme"],
          font_scale: Number(row.font_scale),
          active_version_id: row.active_version_id === null ? null : String(row.active_version_id),
          last_location:
            row.last_location_json === null ? null : parseJson(String(row.last_location_json)),
        };
    }
  }

  private rowToQueue(row: EntityRow): SyncQueueRecord {
    return {
      op_id: String(row.op_id),
      entity: String(row.entity) as SyncEntity,
      entity_id: String(row.entity_id),
      op: String(row.op) as "upsert" | "delete",
      payload: row.payload_json === null ? null : parseJson(String(row.payload_json)),
      hlc: String(row.hlc),
      base_version: Number(row.base_version),
      status: String(row.status) as SyncQueueRecord["status"],
      attempts: Number(row.attempts),
      last_error: row.last_error === null ? null : String(row.last_error),
      revision: Number(row.revision),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    };
  }

  private rowToDownload(row: EntityRow): DownloadCheckpoint {
    return {
      version_id: String(row.version_id),
      version_code: Number(row.version_code),
      checksum: String(row.checksum),
      status: String(row.status) as DownloadCheckpoint["status"],
      received_bytes: Number(row.received_bytes),
      total_bytes: row.total_bytes === null ? null : Number(row.total_bytes),
      etag: row.etag === null ? null : String(row.etag),
      last_modified: row.last_modified === null ? null : String(row.last_modified),
      error_code: row.error_code === null ? null : String(row.error_code),
      error_message: row.error_message === null ? null : String(row.error_message),
      updated_at: String(row.updated_at),
    };
  }
}

/** FTS5 search for the mobile app. */
export class SqliteSearchEngine implements LocalSearchEngine {
  constructor(
    private readonly database: SqliteOfflineDatabase,
    private readonly driver: SqliteDriver,
  ) {}

  async indexVersion(versionId: string): Promise<void> {
    const row = await this.driver.get<{ count: number }>(
      "SELECT COUNT(*) AS count FROM verses_fts JOIN verses ON verses.rowid = verses_fts.rowid WHERE verses.version_id = ?",
      [versionId],
    );
    const indexed = Number(row?.count ?? 0);
    const total = await this.database.countVerses(versionId);
    if (indexed !== total) {
      await this.driver.exec("INSERT INTO verses_fts(verses_fts) VALUES('rebuild')");
    }
  }

  async search(versionId: string, query: string, limit = 25): Promise<LocalSearchResult[]> {
    const trimmed = query
      .trim()
      .replace(/^["']+|["']+$/g, "")
      .trim();
    if (!trimmed) return [];
    const reference = tryParseReference(trimmed);
    if (reference) return searchReference(this.database, versionId, reference, limit);

    const words = normalizeSearchText(trimmed).split(" ").filter(Boolean);
    if (words.length === 0) return [];
    const match = words.length > 1 ? `"${words.join(" ")}"` : `${words[0]}*`;
    const rows = await this.driver.all<{
      id: string;
      book: string;
      chapter: number;
      verse: number;
      text: string;
      rank: number;
    }>(
      `SELECT verses.id, verses.book, verses.chapter, verses.verse, verses.text,
              bm25(verses_fts) AS rank
       FROM verses_fts
       JOIN verses ON verses.rowid = verses_fts.rowid
       WHERE verses_fts MATCH ? AND verses.version_id = ?
       ORDER BY rank
       LIMIT ?`,
      [match, versionId, limit],
    );
    return rows.map((row) => ({
      verseId: row.id,
      versionId,
      book: row.book as BookCode,
      chapter: row.chapter,
      verse: row.verse,
      text: row.text,
      score: -row.rank,
    }));
  }

  async deleteVersion(versionId: string): Promise<void> {
    await this.database.deleteSearchIndex(versionId);
  }
}

/** Structurally matches the parts of expo-sqlite used by the app. */
export interface ExpoSQLiteLike {
  execAsync(sql: string): Promise<void>;
  getAllAsync<T>(sql: string, ...params: SqliteValue[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, ...params: SqliteValue[]): Promise<T | null>;
  runAsync(sql: string, ...params: SqliteValue[]): Promise<unknown>;
  withExclusiveTransactionAsync(task: (tx: ExpoSQLiteLike) => Promise<void>): Promise<void>;
}

/** Adapts expo-sqlite's async API to the shared driver without importing the native module. */
export class ExpoSqliteDriver implements SqliteDriver {
  private active: ExpoSQLiteLike | undefined;

  constructor(private readonly database: ExpoSQLiteLike) {}

  async exec(sql: string): Promise<void> {
    await (this.active ?? this.database).execAsync(sql);
  }

  async all<T>(sql: string, params: readonly SqliteValue[] = []): Promise<T[]> {
    return (this.active ?? this.database).getAllAsync<T>(sql, ...params);
  }

  async get<T>(sql: string, params: readonly SqliteValue[] = []): Promise<T | undefined> {
    return (await (this.active ?? this.database).getFirstAsync<T>(sql, ...params)) ?? undefined;
  }

  async run(sql: string, params: readonly SqliteValue[] = []): Promise<void> {
    await (this.active ?? this.database).runAsync(sql, ...params);
  }

  async transaction<T>(task: () => Promise<T>): Promise<T> {
    if (this.active) return task();
    let result!: T;
    await this.database.withExclusiveTransactionAsync(async (tx) => {
      this.active = tx;
      try {
        result = await task();
      } finally {
        this.active = undefined;
      }
    });
    return result;
  }
}
