import type { BookCode, SyncEntity } from "@holyword/core";
import { randomUuid, type IdGenerator, type PersistentHybridClock } from "./clock";
import {
  PREFERENCES_ID,
  readingLocation,
  recordEntityId,
  recordServerVersion,
  mergePreferencePayloads,
  toSyncPayload,
  defaultPreferences,
  mergePreferences,
  type RecordMeta,
} from "./records";
import type {
  BookmarkPayload,
  FolderPayload,
  HighlightColor,
  HighlightPayload,
  LocalBookmark,
  LocalEntityRecord,
  LocalFolder,
  LocalHighlight,
  LocalNote,
  LocalPlanProgress,
  LocalPreferences,
  LocalReadingProgress,
  NotePayload,
  PlanProgressPayload,
  PreferencePayload,
  ReadingProgressPayload,
  StudyStore,
  SyncQueueRecord,
} from "./types";

export interface LocalStudyOptions {
  readonly store: StudyStore;
  readonly clock: PersistentHybridClock;
  readonly newId?: IdGenerator;
  readonly now?: () => Date;
}

export interface SaveBookmarkInput {
  readonly id?: string;
  readonly verseId: string;
  readonly versionId: string;
  readonly label?: string | null;
}

export interface SaveHighlightInput {
  readonly id?: string;
  readonly verseId: string;
  readonly versionId: string;
  readonly color: HighlightColor;
  readonly startOffset?: number | null;
  readonly endOffset?: number | null;
}

export interface SaveNoteInput {
  readonly id?: string;
  readonly verseId?: string | null;
  readonly reference?: string | null;
  readonly title?: string | null;
  readonly body: string;
  readonly folderId?: string | null;
}

export interface SaveFolderInput {
  readonly id?: string;
  readonly name: string;
  readonly parentId?: string | null;
}

export interface SavePlanProgressInput {
  readonly id?: string;
  readonly planId: string;
  readonly dayNumber: number;
  readonly completedAt?: string | null;
}

export interface SaveReadingProgressInput {
  readonly versionId: string;
  readonly book: BookCode;
  readonly chapter: number;
  readonly verse?: number | null;
}

/**
 * Every mutation writes the local row and a sync_queue operation in one transaction.
 * Repeated edits to an entity coalesce into its existing pending operation so a
 * single offline edit session cannot push a chain of stale baseVersion values.
 */
export class LocalStudy {
  private readonly store: StudyStore;
  private readonly clock: PersistentHybridClock;
  private readonly newId: IdGenerator;
  private readonly now: () => Date;

  constructor(options: LocalStudyOptions) {
    this.store = options.store;
    this.clock = options.clock;
    this.newId = options.newId ?? randomUuid;
    this.now = options.now ?? (() => new Date());
  }

  async saveBookmark(input: SaveBookmarkInput): Promise<LocalBookmark> {
    const id = input.id ?? this.newId();
    const existing = (await this.store.getLocalRecord("bookmark", id)) as LocalBookmark | undefined;
    const meta = await this.meta(existing);
    const record: LocalBookmark = {
      id,
      verse_id: input.verseId,
      version_id: input.versionId,
      label: input.label === undefined ? (existing?.label ?? null) : input.label,
      ...meta,
      created_at: existing?.created_at ?? meta.created_at,
    };
    await this.commit("bookmark", record, toSyncPayload("bookmark", record));
    return record;
  }

  async deleteBookmark(id: string): Promise<void> {
    await this.deleteEntity("bookmark", id);
  }

  async saveHighlight(input: SaveHighlightInput): Promise<LocalHighlight> {
    const id = input.id ?? this.newId();
    const existing = (await this.store.getLocalRecord("highlight", id)) as
      LocalHighlight | undefined;
    const start =
      input.startOffset === undefined ? (existing?.start_offset ?? null) : input.startOffset;
    const end = input.endOffset === undefined ? (existing?.end_offset ?? null) : input.endOffset;
    if (start !== null && end !== null && start > end) {
      throw new RangeError("The highlight start offset must not exceed its end offset");
    }
    const meta = await this.meta(existing);
    const record: LocalHighlight = {
      id,
      verse_id: input.verseId,
      version_id: input.versionId,
      color: input.color,
      start_offset: start,
      end_offset: end,
      ...meta,
      created_at: existing?.created_at ?? meta.created_at,
    };
    await this.commit("highlight", record, toSyncPayload("highlight", record));
    return record;
  }

  async deleteHighlight(id: string): Promise<void> {
    await this.deleteEntity("highlight", id);
  }

  async saveNote(input: SaveNoteInput): Promise<LocalNote> {
    if (!input.body.trim()) throw new Error("A note body is required");
    const id = input.id ?? this.newId();
    const existing = (await this.store.getLocalRecord("note", id)) as LocalNote | undefined;
    const meta = await this.meta(existing);
    const record: LocalNote = {
      id,
      verse_id: input.verseId === undefined ? (existing?.verse_id ?? null) : input.verseId,
      reference: input.reference === undefined ? (existing?.reference ?? null) : input.reference,
      title: input.title === undefined ? (existing?.title ?? null) : input.title,
      body: input.body,
      folder_id: input.folderId === undefined ? (existing?.folder_id ?? null) : input.folderId,
      ...meta,
      created_at: existing?.created_at ?? meta.created_at,
    };
    await this.commit("note", record, toSyncPayload("note", record));
    return record;
  }

  async deleteNote(id: string): Promise<void> {
    await this.deleteEntity("note", id);
  }

  async saveFolder(input: SaveFolderInput): Promise<LocalFolder> {
    const name = input.name.trim();
    if (!name) throw new Error("A folder name is required");
    const id = input.id ?? this.newId();
    const existing = (await this.store.getLocalRecord("folder", id)) as LocalFolder | undefined;
    const meta = await this.meta(existing);
    const record: LocalFolder = {
      id,
      name,
      parent_id: input.parentId === undefined ? (existing?.parent_id ?? null) : input.parentId,
      ...meta,
      created_at: existing?.created_at ?? meta.created_at,
    };
    await this.commit("folder", record, toSyncPayload("folder", record));
    return record;
  }

  async deleteFolder(id: string): Promise<void> {
    await this.deleteEntity("folder", id);
  }

  async savePlanProgress(input: SavePlanProgressInput): Promise<LocalPlanProgress> {
    const id = input.id ?? this.newId();
    const existing = (await this.store.getLocalRecord("reading-plan-progress", id)) as
      LocalPlanProgress | undefined;
    const meta = await this.meta(existing);
    const record: LocalPlanProgress = {
      id,
      plan_id: input.planId,
      day_number: input.dayNumber,
      completed_at:
        input.completedAt === undefined ? (existing?.completed_at ?? null) : input.completedAt,
      ...meta,
      created_at: existing?.created_at ?? meta.created_at,
    };
    await this.commit(
      "reading-plan-progress",
      record,
      toSyncPayload("reading-plan-progress", record),
    );
    return record;
  }

  async deletePlanProgress(id: string): Promise<void> {
    await this.deleteEntity("reading-plan-progress", id);
  }

  async saveReadingProgress(input: SaveReadingProgressInput): Promise<LocalReadingProgress> {
    const existing = (await this.store.getLocalRecord("reading-progress", input.versionId)) as
      LocalReadingProgress | undefined;
    const meta = await this.meta(existing);
    const record: LocalReadingProgress = {
      version_id: input.versionId,
      book: input.book,
      chapter: input.chapter,
      verse: input.verse === undefined ? (existing?.verse ?? null) : input.verse,
      ...meta,
      created_at: existing?.created_at ?? meta.created_at,
    };
    await this.commit("reading-progress", record, toSyncPayload("reading-progress", record));
    return record;
  }

  async savePreferences(patch: PreferencePayload): Promise<LocalPreferences> {
    const existing = (await this.store.getLocalRecord("preference", PREFERENCES_ID)) as
      LocalPreferences | undefined;
    const meta = await this.meta(existing);
    const record = mergePreferences(existing, patch, meta);
    const pending = await this.store.getQueueForEntity("preference", PREFERENCES_ID);
    const mergedPatch =
      pending?.op === "upsert" && pending.payload
        ? mergePreferencePayloads(pending.payload as PreferencePayload, patch)
        : patch;
    await this.commit("preference", record, mergedPatch);
    return record;
  }

  async listBookmarks(includeDeleted = false): Promise<LocalBookmark[]> {
    return this.list("bookmark", includeDeleted) as Promise<LocalBookmark[]>;
  }

  async listHighlights(includeDeleted = false): Promise<LocalHighlight[]> {
    return this.list("highlight", includeDeleted) as Promise<LocalHighlight[]>;
  }

  async listNotes(includeDeleted = false): Promise<LocalNote[]> {
    return this.list("note", includeDeleted) as Promise<LocalNote[]>;
  }

  async listFolders(includeDeleted = false): Promise<LocalFolder[]> {
    return this.list("folder", includeDeleted) as Promise<LocalFolder[]>;
  }

  async listPlanProgress(includeDeleted = false): Promise<LocalPlanProgress[]> {
    return this.list("reading-plan-progress", includeDeleted) as Promise<LocalPlanProgress[]>;
  }

  async getReadingProgress(versionId: string): Promise<LocalReadingProgress | undefined> {
    const record = (await this.store.getLocalRecord("reading-progress", versionId)) as
      LocalReadingProgress | undefined;
    return record?.deleted_at ? undefined : record;
  }

  async getPreferences(): Promise<LocalPreferences | undefined> {
    const record = (await this.store.getLocalRecord("preference", PREFERENCES_ID)) as
      LocalPreferences | undefined;
    return record?.deleted_at ? undefined : record;
  }

  private async list(entity: SyncEntity, includeDeleted: boolean): Promise<LocalEntityRecord[]> {
    const rows = await this.store.listLocalRecords(entity);
    return includeDeleted ? rows : rows.filter((row) => row.deleted_at === null);
  }

  private async deleteEntity(entity: SyncEntity, entityId: string): Promise<void> {
    const existing = await this.store.getLocalRecord(entity, entityId);
    if (!existing) throw new Error(`${entity} "${entityId}" does not exist locally`);
    const meta = await this.meta(existing);
    const tombstone = {
      ...existing,
      ...meta,
      deleted_at: meta.updated_at,
    } as LocalEntityRecord;
    await this.commit(entity, tombstone, null, "delete");
  }

  private async meta(existing?: LocalEntityRecord): Promise<RecordMeta> {
    return {
      hlc: await this.clock.next(),
      server_version: existing ? recordServerVersion(existing) : 0,
      deleted_at: null,
      created_at: existing?.created_at ?? this.now().toISOString(),
      updated_at: this.now().toISOString(),
    };
  }

  private async commit(
    entity: SyncEntity,
    record: LocalEntityRecord,
    payload:
      | BookmarkPayload
      | HighlightPayload
      | NotePayload
      | FolderPayload
      | PlanProgressPayload
      | ReadingProgressPayload
      | PreferencePayload
      | null,
    op: "upsert" | "delete" = "upsert",
  ): Promise<void> {
    const entityId = recordEntityId(entity, record);
    const pending = await this.store.getQueueForEntity(entity, entityId);
    const now = this.now().toISOString();
    const queue: SyncQueueRecord = {
      op_id: pending?.op_id ?? this.newId(),
      entity,
      entity_id: entityId,
      op,
      payload: op === "delete" ? null : (payload as Record<string, unknown> | null),
      hlc: record.hlc,
      base_version: pending?.base_version ?? record.server_version,
      status: "pending",
      attempts: 0,
      last_error: null,
      revision: (pending?.revision ?? 0) + 1,
      created_at: pending?.created_at ?? now,
      updated_at: now,
    };
    await this.store.commitLocalChange(entity, record, queue);
  }
}

export { readingLocation, defaultPreferences };
