import { Injectable } from "@nestjs/common";
import { and, desc, eq, gte, isNull, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { createClock, formatHlc } from "@holyword/core";
import {
  bookmarks,
  folders,
  highlights,
  notes,
  planProgress,
  preferences,
  readingPlans,
  readingProgress,
  type Folder,
  type Note,
} from "@holyword/db";
import { ApiError, ConflictError } from "../common/api-error";
import { DatabaseService } from "../database/database.service";
import {
  applyChange,
  ChangeRejectedError,
  PREFERENCES_ENTITY_ID,
  type ChangeInput,
  type ChangeOutcome,
} from "./apply-change";
import { appendChangeLog, newOpId, normalizeDeviceId, serverHlc } from "./change-log";
import {
  toBookmarkDto,
  toFolderDto,
  toHighlightDto,
  toNoteDto,
  toPlanDto,
  toPlanProgressDto,
  toPreferenceDto,
  toReadingProgressDto,
  type BookmarkDto,
  type FolderDto,
  type HighlightDto,
  type NoteDto,
  type PlanDto,
  type PlanProgressDto,
  type PreferenceDto,
  type ReadingProgressDto,
} from "./serialize";

type BookmarkInput = {
  id: string;
  verseId: string;
  versionId: string;
  label: string | null;
  hlc: string;
};

type HighlightInput = {
  id: string;
  verseId: string;
  versionId: string;
  color: "gold" | "cyan" | "emerald" | "royal-red" | "purple";
  startOffset: number | null;
  endOffset: number | null;
  hlc: string;
};

type NoteInput = {
  id: string;
  verseId: string | null;
  reference: string | null;
  title: string | null;
  body: string;
  folderId: string | null;
  hlc: string;
  baseVersion?: number;
};

type FolderInput = { id: string; name: string; parentId: string | null; hlc: string };

type PlanProgressInput = {
  id: string;
  dayNumber: number;
  completedAt: string | null;
  hlc: string;
};

type ReadingProgressInput = {
  versionId: string;
  book: string;
  chapter: number;
  verse: number | null;
  hlc: string;
};

type PreferenceInput = {
  theme?: "system" | "light" | "dark";
  readingTheme?: "light" | "sepia" | "dark";
  fontScale?: number;
  activeVersionId?: string | null;
  lastLocation?: {
    versionId: string;
    book: string;
    chapter: number;
    verse?: number;
  } | null;
  hlc: string;
};

const DEFAULT_PREFERENCE_HLC = formatHlc(createClock("server", 0));

@Injectable()
export class StudyService {
  constructor(private readonly database: DatabaseService) {}

  async listBookmarks(userId: string, since?: Date): Promise<BookmarkDto[]> {
    const rows = await this.database.db
      .select()
      .from(bookmarks)
      .where(
        and(
          eq(bookmarks.userId, userId),
          isNull(bookmarks.deletedAt),
          sinceFilter(bookmarks.updatedAt, since),
        ),
      )
      .orderBy(desc(bookmarks.updatedAt));
    return rows.map(toBookmarkDto);
  }

  async createBookmark(
    userId: string,
    input: BookmarkInput,
    deviceId?: string,
  ): Promise<BookmarkDto> {
    await this.mutate(
      userId,
      {
        entity: "bookmark",
        entityId: input.id,
        op: "upsert",
        payload: { verseId: input.verseId, versionId: input.versionId, label: input.label },
        hlc: input.hlc,
      },
      deviceId,
    );
    const row = await this.findBookmark(userId, input.id);
    if (!row) throw ApiError.notFound("Bookmark was not found");
    return toBookmarkDto(row);
  }

  async updateBookmark(
    userId: string,
    id: string,
    input: BookmarkInput,
    deviceId?: string,
  ): Promise<BookmarkDto> {
    if (input.id !== id) throw ApiError.badRequest("id-mismatch", "Body id must match the path id");
    await this.requireBookmark(userId, id);
    await this.mutate(
      userId,
      {
        entity: "bookmark",
        entityId: id,
        op: "upsert",
        payload: { verseId: input.verseId, versionId: input.versionId, label: input.label },
        hlc: input.hlc,
      },
      deviceId,
    );
    const row = await this.findBookmark(userId, id);
    if (!row) throw ApiError.notFound("Bookmark was not found");
    return toBookmarkDto(row);
  }

  async deleteBookmark(userId: string, id: string, deviceId?: string): Promise<void> {
    await this.mutate(
      userId,
      { entity: "bookmark", entityId: id, op: "delete", payload: null, hlc: serverHlc() },
      deviceId,
    );
  }

  async listHighlights(userId: string, since?: Date): Promise<HighlightDto[]> {
    const rows = await this.database.db
      .select()
      .from(highlights)
      .where(
        and(
          eq(highlights.userId, userId),
          isNull(highlights.deletedAt),
          sinceFilter(highlights.updatedAt, since),
        ),
      )
      .orderBy(desc(highlights.updatedAt));
    return rows.map(toHighlightDto);
  }

  async createHighlight(
    userId: string,
    input: HighlightInput,
    deviceId?: string,
  ): Promise<HighlightDto> {
    await this.mutate(
      userId,
      {
        entity: "highlight",
        entityId: input.id,
        op: "upsert",
        payload: {
          verseId: input.verseId,
          versionId: input.versionId,
          color: input.color,
          startOffset: input.startOffset,
          endOffset: input.endOffset,
        },
        hlc: input.hlc,
      },
      deviceId,
    );
    const row = await this.findHighlight(userId, input.id);
    if (!row) throw ApiError.notFound("Highlight was not found");
    return toHighlightDto(row);
  }

  async updateHighlight(
    userId: string,
    id: string,
    input: HighlightInput,
    deviceId?: string,
  ): Promise<HighlightDto> {
    if (input.id !== id) throw ApiError.badRequest("id-mismatch", "Body id must match the path id");
    await this.requireHighlight(userId, id);
    await this.mutate(
      userId,
      {
        entity: "highlight",
        entityId: id,
        op: "upsert",
        payload: {
          verseId: input.verseId,
          versionId: input.versionId,
          color: input.color,
          startOffset: input.startOffset,
          endOffset: input.endOffset,
        },
        hlc: input.hlc,
      },
      deviceId,
    );
    const row = await this.findHighlight(userId, id);
    if (!row) throw ApiError.notFound("Highlight was not found");
    return toHighlightDto(row);
  }

  async deleteHighlight(userId: string, id: string, deviceId?: string): Promise<void> {
    await this.mutate(
      userId,
      { entity: "highlight", entityId: id, op: "delete", payload: null, hlc: serverHlc() },
      deviceId,
    );
  }

  async listNotes(userId: string, since?: Date): Promise<NoteDto[]> {
    const rows = await this.database.db
      .select()
      .from(notes)
      .where(
        and(eq(notes.userId, userId), isNull(notes.deletedAt), sinceFilter(notes.updatedAt, since)),
      )
      .orderBy(desc(notes.updatedAt));
    return rows.map(toNoteDto);
  }

  async createNote(userId: string, input: NoteInput, deviceId?: string): Promise<NoteDto> {
    const outcome = await this.mutate(
      userId,
      {
        entity: "note",
        entityId: input.id,
        op: "upsert",
        payload: notePayloadOf(input),
        hlc: input.hlc,
        baseVersion: input.baseVersion,
      },
      deviceId,
    );
    if (outcome.conflictId) {
      throw new ConflictError(
        "note-conflict",
        "This note changed on another device; both versions were preserved",
        outcome.conflictId,
      );
    }
    const row = await this.findNote(userId, input.id);
    if (!row) throw ApiError.notFound("Note was not found");
    return toNoteDto(row);
  }

  async updateNote(
    userId: string,
    id: string,
    input: NoteInput,
    deviceId?: string,
  ): Promise<NoteDto> {
    if (input.id !== id) throw ApiError.badRequest("id-mismatch", "Body id must match the path id");
    await this.requireNote(userId, id);
    const outcome = await this.mutate(
      userId,
      {
        entity: "note",
        entityId: id,
        op: "upsert",
        payload: notePayloadOf(input),
        hlc: input.hlc,
        baseVersion: input.baseVersion,
      },
      deviceId,
    );
    if (outcome.conflictId) {
      throw new ConflictError(
        "note-conflict",
        "This note changed on another device; both versions were preserved",
        outcome.conflictId,
      );
    }
    const row = await this.findNote(userId, id);
    if (!row) throw ApiError.notFound("Note was not found");
    return toNoteDto(row);
  }

  async deleteNote(userId: string, id: string, deviceId?: string): Promise<void> {
    await this.mutate(
      userId,
      { entity: "note", entityId: id, op: "delete", payload: null, hlc: serverHlc() },
      deviceId,
    );
  }

  async listFolders(userId: string, since?: Date): Promise<FolderDto[]> {
    const rows = await this.database.db
      .select()
      .from(folders)
      .where(
        and(
          eq(folders.userId, userId),
          isNull(folders.deletedAt),
          sinceFilter(folders.updatedAt, since),
        ),
      )
      .orderBy(desc(folders.updatedAt));
    return rows.map(toFolderDto);
  }

  async createFolder(userId: string, input: FolderInput, deviceId?: string): Promise<FolderDto> {
    await this.mutate(
      userId,
      {
        entity: "folder",
        entityId: input.id,
        op: "upsert",
        payload: { name: input.name, parentId: input.parentId },
        hlc: input.hlc,
      },
      deviceId,
    );
    const row = await this.findFolder(userId, input.id);
    if (!row) throw ApiError.notFound("Folder was not found");
    return toFolderDto(row);
  }

  async updateFolder(
    userId: string,
    id: string,
    input: FolderInput,
    deviceId?: string,
  ): Promise<FolderDto> {
    if (input.id !== id) throw ApiError.badRequest("id-mismatch", "Body id must match the path id");
    await this.requireFolder(userId, id);
    await this.mutate(
      userId,
      {
        entity: "folder",
        entityId: id,
        op: "upsert",
        payload: { name: input.name, parentId: input.parentId },
        hlc: input.hlc,
      },
      deviceId,
    );
    const row = await this.findFolder(userId, id);
    if (!row) throw ApiError.notFound("Folder was not found");
    return toFolderDto(row);
  }

  async deleteFolder(userId: string, id: string, deviceId?: string): Promise<void> {
    await this.mutate(
      userId,
      { entity: "folder", entityId: id, op: "delete", payload: null, hlc: serverHlc() },
      deviceId,
    );
  }

  async listPlans(): Promise<PlanDto[]> {
    const rows = await this.database.db
      .select()
      .from(readingPlans)
      .where(eq(readingPlans.isPublished, true))
      .orderBy(readingPlans.title);
    return rows.map(toPlanDto);
  }

  async getPlan(planId: string): Promise<PlanDto> {
    const [row] = await this.database.db
      .select()
      .from(readingPlans)
      .where(and(eq(readingPlans.id, planId), eq(readingPlans.isPublished, true)))
      .limit(1);
    if (!row) throw ApiError.notFound("Reading plan was not found");
    return toPlanDto(row);
  }

  async listPlanProgress(userId: string, planId: string): Promise<PlanProgressDto[]> {
    const rows = await this.database.db
      .select()
      .from(planProgress)
      .where(
        and(
          eq(planProgress.userId, userId),
          eq(planProgress.planId, planId),
          isNull(planProgress.deletedAt),
        ),
      )
      .orderBy(planProgress.dayNumber);
    return rows.map(toPlanProgressDto);
  }

  async updatePlanProgress(
    userId: string,
    planId: string,
    input: PlanProgressInput,
    deviceId?: string,
  ): Promise<PlanProgressDto> {
    await this.mutate(
      userId,
      {
        entity: "reading-plan-progress",
        entityId: input.id,
        op: "upsert",
        payload: {
          planId,
          dayNumber: input.dayNumber,
          completedAt: input.completedAt,
        },
        hlc: input.hlc,
      },
      deviceId,
    );
    const [row] = await this.database.db
      .select()
      .from(planProgress)
      .where(and(eq(planProgress.id, input.id), eq(planProgress.userId, userId)))
      .limit(1);
    if (!row) throw ApiError.notFound("Plan progress was not found");
    return toPlanProgressDto(row);
  }

  async listReadingProgress(userId: string): Promise<ReadingProgressDto[]> {
    const rows = await this.database.db
      .select()
      .from(readingProgress)
      .where(and(eq(readingProgress.userId, userId), isNull(readingProgress.deletedAt)))
      .orderBy(desc(readingProgress.updatedAt));
    return rows.map(toReadingProgressDto);
  }

  async updateReadingProgress(
    userId: string,
    input: ReadingProgressInput,
    deviceId?: string,
  ): Promise<ReadingProgressDto> {
    await this.mutate(
      userId,
      {
        entity: "reading-progress",
        entityId: input.versionId,
        op: "upsert",
        payload: { book: input.book, chapter: input.chapter, verse: input.verse },
        hlc: input.hlc,
      },
      deviceId,
    );
    const [row] = await this.database.db
      .select()
      .from(readingProgress)
      .where(
        and(eq(readingProgress.userId, userId), eq(readingProgress.versionId, input.versionId)),
      )
      .limit(1);
    if (!row) throw ApiError.notFound("Reading progress was not found");
    return toReadingProgressDto(row);
  }

  async getPreferences(userId: string): Promise<PreferenceDto> {
    const [row] = await this.database.db
      .select()
      .from(preferences)
      .where(and(eq(preferences.userId, userId), isNull(preferences.deletedAt)))
      .limit(1);
    if (!row) {
      return {
        theme: "system",
        readingTheme: "light",
        fontScale: 100,
        activeVersionId: null,
        lastLocation: null,
        hlc: DEFAULT_PREFERENCE_HLC,
        updatedAt: new Date(0),
        serverVersion: 0,
      };
    }
    return toPreferenceDto(row);
  }

  async updatePreferences(
    userId: string,
    input: PreferenceInput,
    deviceId?: string,
  ): Promise<PreferenceDto> {
    const { hlc, ...payload } = input;
    await this.mutate(
      userId,
      {
        entity: "preference",
        entityId: PREFERENCES_ENTITY_ID,
        op: "upsert",
        payload,
        hlc,
      },
      deviceId,
    );
    return this.getPreferences(userId);
  }

  private async mutate(
    userId: string,
    change: ChangeInput,
    deviceId: string | undefined,
  ): Promise<ChangeOutcome> {
    try {
      return await this.database.db.transaction(async (tx) => {
        const outcome = await applyChange(tx, userId, change);
        await appendChangeLog(tx, {
          userId,
          opId: newOpId(),
          deviceId: normalizeDeviceId(deviceId),
          change,
          serverVersion: outcome.serverVersion,
          conflictId: outcome.conflictId,
        });
        return outcome;
      });
    } catch (error) {
      if (error instanceof ChangeRejectedError) {
        throw ApiError.badRequest(error.code, error.message);
      }
      throw error;
    }
  }

  private async findBookmark(userId: string, id: string) {
    const [row] = await this.database.db
      .select()
      .from(bookmarks)
      .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, userId)))
      .limit(1);
    return row;
  }

  private async requireBookmark(userId: string, id: string): Promise<void> {
    const row = await this.findBookmark(userId, id);
    if (!row || row.deletedAt) throw ApiError.notFound("Bookmark was not found");
  }

  private async findHighlight(userId: string, id: string) {
    const [row] = await this.database.db
      .select()
      .from(highlights)
      .where(and(eq(highlights.id, id), eq(highlights.userId, userId)))
      .limit(1);
    return row;
  }

  private async requireHighlight(userId: string, id: string): Promise<void> {
    const row = await this.findHighlight(userId, id);
    if (!row || row.deletedAt) throw ApiError.notFound("Highlight was not found");
  }

  private async findNote(userId: string, id: string): Promise<Note | undefined> {
    const [row] = await this.database.db
      .select()
      .from(notes)
      .where(and(eq(notes.id, id), eq(notes.userId, userId)))
      .limit(1);
    return row;
  }

  private async requireNote(userId: string, id: string): Promise<void> {
    const row = await this.findNote(userId, id);
    if (!row || row.deletedAt) throw ApiError.notFound("Note was not found");
  }

  private async findFolder(userId: string, id: string): Promise<Folder | undefined> {
    const [row] = await this.database.db
      .select()
      .from(folders)
      .where(and(eq(folders.id, id), eq(folders.userId, userId)))
      .limit(1);
    return row;
  }

  private async requireFolder(userId: string, id: string): Promise<void> {
    const row = await this.findFolder(userId, id);
    if (!row || row.deletedAt) throw ApiError.notFound("Folder was not found");
  }
}

function sinceFilter(column: AnyPgColumn, since: Date | undefined): SQL | undefined {
  return since ? gte(column, since) : undefined;
}

function notePayloadOf(input: NoteInput): Record<string, unknown> {
  return {
    verseId: input.verseId,
    reference: input.reference,
    title: input.title,
    body: input.body,
    folderId: input.folderId,
  };
}
