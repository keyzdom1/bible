import type {
  BookCode,
  LicencePolicy,
  PackageManifest,
  PackageVerse,
  PullResponse,
  PushRequest,
  PushResponse,
  SyncEntity,
  VersificationMap,
} from "@holyword/core";

/** Bump when the logical local schema changes. Dexie and SQLite use the same number. */
export const LOCAL_SCHEMA_VERSION = 1;

export const LOCAL_TABLE_NAMES = [
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
] as const;

export type LocalTableName = (typeof LOCAL_TABLE_NAMES)[number];

export interface LocalTableDefinition {
  readonly name: LocalTableName;
  readonly primaryKey: string | readonly string[];
  readonly indexes: readonly string[];
}

/**
 * The one logical schema implemented by Dexie (web) and SQLite (mobile).
 * Adapters may use different physical types, but table and column names stay aligned.
 */
export const LOCAL_SCHEMA: readonly LocalTableDefinition[] = [
  { name: "versions", primaryKey: "version_id", indexes: [] },
  { name: "books", primaryKey: ["version_id", "code"], indexes: ["version_id"] },
  {
    name: "chapters",
    primaryKey: ["version_id", "book", "chapter"],
    indexes: ["version_id", "[version_id+book]"],
  },
  {
    name: "verses",
    primaryKey: ["version_id", "id"],
    indexes: ["version_id", "id", "[version_id+book]", "[version_id+book+chapter]"],
  },
  { name: "bookmarks", primaryKey: "id", indexes: ["verse_id", "updated_at"] },
  { name: "highlights", primaryKey: "id", indexes: ["verse_id", "updated_at"] },
  { name: "notes", primaryKey: "id", indexes: ["verse_id", "folder_id", "updated_at"] },
  { name: "folders", primaryKey: "id", indexes: ["parent_id"] },
  { name: "reading_plans", primaryKey: "id", indexes: ["slug"] },
  {
    name: "plan_progress",
    primaryKey: "id",
    indexes: ["plan_id", "updated_at"],
  },
  { name: "reading_progress", primaryKey: "version_id", indexes: [] },
  { name: "preferences", primaryKey: "id", indexes: [] },
  {
    name: "sync_queue",
    primaryKey: "op_id",
    indexes: ["status", "created_at", "[status+created_at]", "[entity+entity_id]"],
  },
  { name: "sync_state", primaryKey: "key", indexes: [] },
  { name: "note_conflicts", primaryKey: "id", indexes: ["note_id", "created_at"] },
  { name: "search_indexes", primaryKey: "version_id", indexes: [] },
  { name: "downloads", primaryKey: "version_id", indexes: ["status"] },
  { name: "download_chunks", primaryKey: ["version_id", "offset"], indexes: ["version_id"] },
];

export interface LocalVersion {
  readonly version_id: string;
  readonly version_code: number;
  readonly name: string;
  readonly abbreviation: string;
  readonly language: string;
  readonly language_name: string;
  readonly direction: "ltr" | "rtl";
  readonly licence: LicencePolicy;
  readonly copyright: string;
  readonly attribution: string;
  readonly manifest: PackageManifest;
  readonly manifest_sha256: string;
  readonly package_bytes: number;
  readonly storage_bytes: number;
  readonly verse_count: number;
  readonly installed_at: string;
  readonly search_ready: boolean;
}

export interface LocalBook {
  readonly version_id: string;
  readonly code: BookCode;
  readonly name: string;
  readonly order_index: number;
  readonly chapter_count: number;
  readonly verse_count: number;
}

export interface LocalChapter {
  readonly version_id: string;
  readonly book: BookCode;
  readonly chapter: number;
  readonly verse_count: number;
  readonly first_verse: string;
  readonly last_verse: string;
}

export interface LocalVerse {
  readonly version_id: string;
  readonly id: string;
  readonly book: BookCode;
  readonly chapter: number;
  readonly verse: number;
  readonly text: string;
}

export interface InstallableContent {
  readonly manifest: PackageManifest;
  readonly manifest_sha256: string;
  readonly versification: VersificationMap;
  readonly verses: readonly PackageVerse[];
  readonly archive_bytes: number;
  readonly installed_at: string;
}

export interface VerseRange {
  readonly book: BookCode;
  readonly startChapter: number;
  readonly startVerse?: number;
  readonly endChapter: number;
  readonly endVerse?: number;
  readonly limit: number;
}

export interface LocalSyncFields {
  readonly hlc: string;
  readonly server_version: number;
  readonly deleted_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface LocalBookmark extends LocalSyncFields {
  readonly id: string;
  readonly verse_id: string;
  readonly version_id: string;
  readonly label: string | null;
}

export type HighlightColor = "gold" | "cyan" | "emerald" | "royal-red" | "purple";

export interface LocalHighlight extends LocalSyncFields {
  readonly id: string;
  readonly verse_id: string;
  readonly version_id: string;
  readonly color: HighlightColor;
  readonly start_offset: number | null;
  readonly end_offset: number | null;
}

export interface LocalNote extends LocalSyncFields {
  readonly id: string;
  readonly verse_id: string | null;
  readonly reference: string | null;
  readonly title: string | null;
  readonly body: string;
  readonly folder_id: string | null;
}

export interface LocalFolder extends LocalSyncFields {
  readonly id: string;
  readonly name: string;
  readonly parent_id: string | null;
}

export interface LocalReadingPlan {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly day_count: number;
  readonly schedule: readonly { day: number; title: string; references: readonly string[] }[];
  readonly is_published: boolean;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface LocalPlanProgress extends LocalSyncFields {
  readonly id: string;
  readonly plan_id: string;
  readonly day_number: number;
  readonly completed_at: string | null;
}

export interface LocalReadingProgress extends LocalSyncFields {
  readonly version_id: string;
  readonly book: BookCode;
  readonly chapter: number;
  readonly verse: number | null;
}

export interface ReadingLocation {
  readonly versionId: string;
  readonly book: BookCode;
  readonly chapter: number;
  readonly verse?: number;
}

export interface LocalPreferences extends LocalSyncFields {
  readonly id: "preferences";
  readonly theme: "system" | "light" | "dark";
  readonly reading_theme: "light" | "sepia" | "dark";
  readonly font_scale: number;
  readonly active_version_id: string | null;
  readonly last_location: ReadingLocation | null;
}

export interface LocalEntityTypes {
  bookmark: LocalBookmark;
  highlight: LocalHighlight;
  note: LocalNote;
  folder: LocalFolder;
  "reading-plan-progress": LocalPlanProgress;
  "reading-progress": LocalReadingProgress;
  preference: LocalPreferences;
}

export type LocalEntityRecord = LocalEntityTypes[SyncEntity];
export type LocalEntityOf<E extends SyncEntity> = LocalEntityTypes[E];

export interface BookmarkPayload {
  readonly verseId: string;
  readonly versionId: string;
  readonly label: string | null;
}

export interface HighlightPayload {
  readonly verseId: string;
  readonly versionId: string;
  readonly color: HighlightColor;
  readonly startOffset: number | null;
  readonly endOffset: number | null;
}

export interface NotePayload {
  readonly verseId: string | null;
  readonly reference: string | null;
  readonly title: string | null;
  readonly body: string;
  readonly folderId: string | null;
}

export interface FolderPayload {
  readonly name: string;
  readonly parentId: string | null;
}

export interface PlanProgressPayload {
  readonly planId: string;
  readonly dayNumber: number;
  readonly completedAt: string | null;
}

export interface ReadingProgressPayload {
  readonly book: BookCode;
  readonly chapter: number;
  readonly verse: number | null;
}

export interface PreferencePayload {
  readonly theme?: "system" | "light" | "dark";
  readonly readingTheme?: "light" | "sepia" | "dark";
  readonly fontScale?: number;
  readonly activeVersionId?: string | null;
  readonly lastLocation?: ReadingLocation | null;
}

export interface SyncPayloadTypes {
  bookmark: BookmarkPayload;
  highlight: HighlightPayload;
  note: NotePayload;
  folder: FolderPayload;
  "reading-plan-progress": PlanProgressPayload;
  "reading-progress": ReadingProgressPayload;
  preference: PreferencePayload;
}

export type SyncPayload = SyncPayloadTypes[SyncEntity];

export type QueueStatus = "pending" | "failed";

export interface SyncQueueRecord {
  readonly op_id: string;
  readonly entity: SyncEntity;
  readonly entity_id: string;
  readonly op: "upsert" | "delete";
  readonly payload: Record<string, unknown> | null;
  readonly hlc: string;
  readonly base_version: number;
  readonly status: QueueStatus;
  readonly attempts: number;
  readonly last_error: string | null;
  readonly revision: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface LocalNoteConflict {
  readonly id: string;
  readonly note_id: string;
  readonly local_payload: Record<string, unknown>;
  readonly remote_payload: Record<string, unknown>;
  readonly local_hlc: string;
  readonly remote_hlc: string;
  readonly server_conflict_id: string | null;
  readonly resolution: "kept-local" | "kept-remote" | "merged" | null;
  readonly resolved_at: string | null;
  readonly created_at: string;
}

export interface SearchIndexRecord {
  readonly version_id: string;
  readonly json: string;
  readonly verse_count: number;
  readonly built_at: string;
}

export interface LocalSearchResult {
  readonly verseId: string;
  readonly versionId: string;
  readonly book: BookCode;
  readonly chapter: number;
  readonly verse: number;
  readonly text: string;
  readonly score: number;
}

export type DownloadStatus = "downloading" | "paused" | "verifying" | "complete" | "error";

export interface DownloadCheckpoint {
  readonly version_id: string;
  readonly version_code: number;
  readonly checksum: string;
  readonly status: DownloadStatus;
  readonly received_bytes: number;
  readonly total_bytes: number | null;
  readonly etag: string | null;
  readonly last_modified: string | null;
  readonly error_code: string | null;
  readonly error_message: string | null;
  readonly updated_at: string;
}

export interface DownloadChunk {
  readonly version_id: string;
  readonly offset: number;
  readonly bytes: Uint8Array;
}

export interface DownloadProgress {
  readonly versionId: string;
  readonly status: DownloadStatus;
  readonly receivedBytes: number;
  readonly totalBytes: number | null;
  readonly fraction: number | null;
  readonly error: string | null;
}

export interface DownloadTicket {
  readonly url: string;
  readonly manifestUrl: string;
  readonly expiresAt: string;
  readonly packageVersion: number;
  readonly checksum: string;
}

export interface DownloadedPackage {
  readonly versionId: string;
  readonly versionCode: number;
  readonly checksum: string;
  readonly archive: Uint8Array;
  readonly downloadedBytes: number;
}

export interface DownloadStore {
  getDownload(versionId: string): Promise<DownloadCheckpoint | undefined>;
  putDownload(checkpoint: DownloadCheckpoint): Promise<void>;
  deleteDownload(versionId: string): Promise<void>;
  listChunks(versionId: string): Promise<DownloadChunk[]>;
  putChunk(chunk: DownloadChunk): Promise<void>;
  deleteChunks(versionId: string): Promise<void>;
}

export interface ContentStore {
  installContent(content: InstallableContent): Promise<void>;
  deleteVersion(versionId: string): Promise<void>;
  listVersions(): Promise<LocalVersion[]>;
  getVersion(versionId: string): Promise<LocalVersion | undefined>;
  listBooks(versionId: string): Promise<LocalBook[]>;
  listChapters(versionId: string, book?: BookCode): Promise<LocalChapter[]>;
  getChapter(versionId: string, book: BookCode, chapter: number): Promise<LocalVerse[]>;
  getVerse(versionId: string, verseId: string): Promise<LocalVerse | undefined>;
  listVerses(versionId: string): Promise<LocalVerse[]>;
  queryVerses(versionId: string, range: VerseRange): Promise<LocalVerse[]>;
  countVerses(versionId: string): Promise<number>;
  markSearchReady(versionId: string, ready: boolean): Promise<void>;
}

export interface StudyStore {
  getLocalRecord(entity: SyncEntity, entityId: string): Promise<LocalEntityRecord | undefined>;
  listLocalRecords(entity: SyncEntity): Promise<LocalEntityRecord[]>;
  commitLocalChange(
    entity: SyncEntity,
    record: LocalEntityRecord,
    queue: SyncQueueRecord,
  ): Promise<void>;
  putRemoteRecord(entity: SyncEntity, record: LocalEntityRecord): Promise<void>;
  updateRecordServerVersion(
    entity: SyncEntity,
    entityId: string,
    serverVersion: number,
  ): Promise<void>;
  listQueue(limit: number): Promise<SyncQueueRecord[]>;
  getQueueForEntity(entity: SyncEntity, entityId: string): Promise<SyncQueueRecord | undefined>;
  putQueue(queue: SyncQueueRecord): Promise<void>;
  deleteQueue(opId: string): Promise<void>;
  failQueue(opId: string, reason: string): Promise<void>;
  retryFailedQueue(): Promise<void>;
  countQueue(): Promise<number>;
  getState(key: string): Promise<string | undefined>;
  setState(key: string, value: string): Promise<void>;
  putNoteConflict(conflict: LocalNoteConflict): Promise<void>;
  listNoteConflicts(): Promise<LocalNoteConflict[]>;
  deleteNoteConflict(id: string): Promise<void>;
}

export interface SearchIndexStore {
  getSearchIndex(versionId: string): Promise<SearchIndexRecord | undefined>;
  putSearchIndex(index: SearchIndexRecord): Promise<void>;
  deleteSearchIndex(versionId: string): Promise<void>;
}

export interface ReadingPlanStore {
  putReadingPlan(plan: LocalReadingPlan): Promise<void>;
  listReadingPlans(): Promise<LocalReadingPlan[]>;
  deleteReadingPlan(id: string): Promise<void>;
}

export interface OfflineStore extends ContentStore, StudyStore, SearchIndexStore, ReadingPlanStore {
  /** Removes all cached content, study data and sync state for this device. */
  clearLocalData(): Promise<void>;
}

export interface LocalSearchEngine {
  indexVersion(versionId: string): Promise<void>;
  search(versionId: string, query: string, limit?: number): Promise<LocalSearchResult[]>;
  deleteVersion(versionId: string): Promise<void>;
}

export interface SyncTransport {
  push(request: PushRequest): Promise<PushResponse>;
  pull(cursor: number, limit: number): Promise<PullResponse>;
}
