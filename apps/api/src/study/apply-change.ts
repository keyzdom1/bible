import { and, eq, isNull, ne } from "drizzle-orm";
import { compareHlc, parseHlc, type SyncEntity } from "@holyword/core";
import type { DbTransaction } from "@holyword/db";
import {
  bookmarks,
  folders,
  highlights,
  noteConflicts,
  notes,
  planProgress,
  preferences,
  readingPlans,
  readingProgress,
} from "@holyword/db";
import {
  bookmarkPayloadSchema,
  folderPayloadSchema,
  highlightPayloadSchema,
  notePayloadSchema,
  planProgressPayloadSchema,
  preferencePayloadSchema,
  readingProgressPayloadSchema,
  type BookmarkPayload,
  type FolderPayload,
  type HighlightPayload,
  type NotePayload,
  type PlanProgressPayload,
  type PreferencePayload,
  type ReadingProgressPayload,
} from "./schemas";

export interface ChangeInput {
  readonly entity: SyncEntity;
  readonly entityId: string;
  readonly op: "upsert" | "delete";
  readonly payload: Record<string, unknown> | null;
  readonly hlc: string;
  readonly baseVersion?: number;
}

export interface ChangeOutcome {
  readonly serverVersion: number;
  readonly applied: boolean;
  readonly conflictId?: string;
}

export class ChangeRejectedError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ChangeRejectedError";
  }
}

export const PREFERENCES_ENTITY_ID = "preferences";

function requirePayload(change: ChangeInput): Record<string, unknown> {
  if (!change.payload) {
    throw new ChangeRejectedError("missing-payload", "An upsert requires a payload");
  }
  return change.payload;
}

export function validatePayload(
  entity: SyncEntity,
  payload: unknown,
  op: "upsert" | "delete",
): Record<string, unknown> | null {
  if (op === "delete") return null;
  switch (entity) {
    case "bookmark":
      return bookmarkPayloadSchema.parse(payload);
    case "highlight":
      return highlightPayloadSchema.parse(payload);
    case "note":
      return notePayloadSchema.parse(payload);
    case "folder":
      return folderPayloadSchema.parse(payload);
    case "reading-plan-progress":
      return planProgressPayloadSchema.parse(payload);
    case "reading-progress":
      return readingProgressPayloadSchema.parse(payload);
    case "preference":
      return preferencePayloadSchema.parse(payload);
  }
}

function accepts(incoming: string, current: string): boolean {
  return compareHlc(parseHlc(incoming), parseHlc(current)) >= 0;
}

async function lockBookmark(tx: DbTransaction, userId: string, id: string) {
  const [row] = await tx
    .select()
    .from(bookmarks)
    .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, userId)))
    .limit(1)
    .for("update");
  return row;
}

async function applyBookmark(
  tx: DbTransaction,
  userId: string,
  change: ChangeInput,
): Promise<ChangeOutcome> {
  const current = await lockBookmark(tx, userId, change.entityId);
  if (change.op === "delete") {
    if (!current) return { serverVersion: 0, applied: false };
    if (!accepts(change.hlc, current.hlc)) {
      return { serverVersion: current.serverVersion, applied: false };
    }
    const serverVersion = current.serverVersion + 1;
    await tx
      .update(bookmarks)
      .set({ deletedAt: new Date(), hlc: change.hlc, serverVersion, updatedAt: new Date() })
      .where(and(eq(bookmarks.id, change.entityId), eq(bookmarks.userId, userId)));
    return { serverVersion, applied: true };
  }

  const payload: BookmarkPayload = bookmarkPayloadSchema.parse(requirePayload(change));
  if (current && !accepts(change.hlc, current.hlc)) {
    return { serverVersion: current.serverVersion, applied: false };
  }
  if (current) {
    const serverVersion = current.serverVersion + 1;
    await tx
      .update(bookmarks)
      .set({
        verseId: payload.verseId,
        versionId: payload.versionId,
        label: payload.label,
        hlc: change.hlc,
        serverVersion,
        deletedAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(bookmarks.id, change.entityId), eq(bookmarks.userId, userId)));
    return { serverVersion, applied: true };
  }
  await tx.insert(bookmarks).values({
    id: change.entityId,
    userId,
    verseId: payload.verseId,
    versionId: payload.versionId,
    label: payload.label,
    hlc: change.hlc,
    serverVersion: 1,
  });
  return { serverVersion: 1, applied: true };
}

async function applyHighlight(
  tx: DbTransaction,
  userId: string,
  change: ChangeInput,
): Promise<ChangeOutcome> {
  const [current] = await tx
    .select()
    .from(highlights)
    .where(and(eq(highlights.id, change.entityId), eq(highlights.userId, userId)))
    .limit(1)
    .for("update");
  if (change.op === "delete") {
    if (!current) return { serverVersion: 0, applied: false };
    if (!accepts(change.hlc, current.hlc)) {
      return { serverVersion: current.serverVersion, applied: false };
    }
    const serverVersion = current.serverVersion + 1;
    await tx
      .update(highlights)
      .set({ deletedAt: new Date(), hlc: change.hlc, serverVersion, updatedAt: new Date() })
      .where(and(eq(highlights.id, change.entityId), eq(highlights.userId, userId)));
    return { serverVersion, applied: true };
  }

  const payload: HighlightPayload = highlightPayloadSchema.parse(requirePayload(change));
  if (current && !accepts(change.hlc, current.hlc)) {
    return { serverVersion: current.serverVersion, applied: false };
  }
  if (current) {
    const serverVersion = current.serverVersion + 1;
    await tx
      .update(highlights)
      .set({
        verseId: payload.verseId,
        versionId: payload.versionId,
        color: payload.color,
        startOffset: payload.startOffset,
        endOffset: payload.endOffset,
        hlc: change.hlc,
        serverVersion,
        deletedAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(highlights.id, change.entityId), eq(highlights.userId, userId)));
    return { serverVersion, applied: true };
  }
  await tx.insert(highlights).values({
    id: change.entityId,
    userId,
    verseId: payload.verseId,
    versionId: payload.versionId,
    color: payload.color,
    startOffset: payload.startOffset,
    endOffset: payload.endOffset,
    hlc: change.hlc,
    serverVersion: 1,
  });
  return { serverVersion: 1, applied: true };
}

async function assertFolderOwned(
  tx: DbTransaction,
  userId: string,
  folderId: string,
): Promise<void> {
  const [folder] = await tx
    .select({ id: folders.id })
    .from(folders)
    .where(and(eq(folders.id, folderId), eq(folders.userId, userId), isNull(folders.deletedAt)))
    .limit(1);
  if (!folder) {
    throw new ChangeRejectedError("invalid-folder", "The folder does not exist for this user");
  }
}

function noteFields(payload: NotePayload): Record<string, unknown> {
  return {
    verseId: payload.verseId,
    reference: payload.reference,
    title: payload.title,
    body: payload.body,
    folderId: payload.folderId,
  };
}

function currentNoteFields(row: typeof notes.$inferSelect): Record<string, unknown> {
  return {
    verseId: row.verseId,
    reference: row.reference,
    title: row.title,
    body: row.body,
    folderId: row.folderId,
  };
}

async function applyNote(
  tx: DbTransaction,
  userId: string,
  change: ChangeInput,
): Promise<ChangeOutcome> {
  const [current] = await tx
    .select()
    .from(notes)
    .where(and(eq(notes.id, change.entityId), eq(notes.userId, userId)))
    .limit(1)
    .for("update");

  if (change.op === "delete") {
    if (!current) return { serverVersion: 0, applied: false };
    if (!accepts(change.hlc, current.hlc)) {
      return { serverVersion: current.serverVersion, applied: false };
    }
    const serverVersion = current.serverVersion + 1;
    await tx
      .update(notes)
      .set({ deletedAt: new Date(), hlc: change.hlc, serverVersion, updatedAt: new Date() })
      .where(and(eq(notes.id, change.entityId), eq(notes.userId, userId)));
    return { serverVersion, applied: true };
  }

  const payload: NotePayload = notePayloadSchema.parse(requirePayload(change));
  if (payload.folderId) await assertFolderOwned(tx, userId, payload.folderId);

  let conflictId: string | undefined;
  if (
    current &&
    change.baseVersion !== undefined &&
    change.baseVersion < current.serverVersion &&
    JSON.stringify(noteFields(payload)) !== JSON.stringify(currentNoteFields(current))
  ) {
    const [conflict] = await tx
      .insert(noteConflicts)
      .values({
        noteId: current.id,
        userId,
        localPayload: noteFields(payload),
        remotePayload: currentNoteFields(current),
        localHlc: change.hlc,
        remoteHlc: current.hlc,
      })
      .returning({ id: noteConflicts.id });
    conflictId = conflict?.id;
  }

  if (current && !accepts(change.hlc, current.hlc)) {
    return { serverVersion: current.serverVersion, applied: false, conflictId };
  }

  if (current) {
    const serverVersion = current.serverVersion + 1;
    await tx
      .update(notes)
      .set({
        verseId: payload.verseId,
        reference: payload.reference,
        title: payload.title,
        body: payload.body,
        folderId: payload.folderId,
        hlc: change.hlc,
        serverVersion,
        deletedAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(notes.id, change.entityId), eq(notes.userId, userId)));
    return { serverVersion, applied: true, conflictId };
  }

  await tx.insert(notes).values({
    id: change.entityId,
    userId,
    verseId: payload.verseId,
    reference: payload.reference,
    title: payload.title,
    body: payload.body,
    folderId: payload.folderId,
    hlc: change.hlc,
    serverVersion: 1,
  });
  return { serverVersion: 1, applied: true, conflictId };
}

async function applyFolder(
  tx: DbTransaction,
  userId: string,
  change: ChangeInput,
): Promise<ChangeOutcome> {
  const [current] = await tx
    .select()
    .from(folders)
    .where(and(eq(folders.id, change.entityId), eq(folders.userId, userId)))
    .limit(1)
    .for("update");

  if (change.op === "delete") {
    if (!current) return { serverVersion: 0, applied: false };
    if (!accepts(change.hlc, current.hlc)) {
      return { serverVersion: current.serverVersion, applied: false };
    }
    const serverVersion = current.serverVersion + 1;
    await tx
      .update(folders)
      .set({ deletedAt: new Date(), hlc: change.hlc, serverVersion, updatedAt: new Date() })
      .where(and(eq(folders.id, change.entityId), eq(folders.userId, userId)));
    return { serverVersion, applied: true };
  }

  const payload: FolderPayload = folderPayloadSchema.parse(requirePayload(change));
  if (payload.parentId) {
    if (payload.parentId === change.entityId) {
      throw new ChangeRejectedError("invalid-folder", "A folder cannot be its own parent");
    }
    await assertFolderOwned(tx, userId, payload.parentId);
  }
  if (current && !accepts(change.hlc, current.hlc)) {
    return { serverVersion: current.serverVersion, applied: false };
  }
  if (current) {
    const serverVersion = current.serverVersion + 1;
    await tx
      .update(folders)
      .set({
        name: payload.name,
        parentId: payload.parentId,
        hlc: change.hlc,
        serverVersion,
        deletedAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(folders.id, change.entityId), eq(folders.userId, userId)));
    return { serverVersion, applied: true };
  }
  await tx.insert(folders).values({
    id: change.entityId,
    userId,
    name: payload.name,
    parentId: payload.parentId,
    hlc: change.hlc,
    serverVersion: 1,
  });
  return { serverVersion: 1, applied: true };
}

async function applyPlanProgress(
  tx: DbTransaction,
  userId: string,
  change: ChangeInput,
): Promise<ChangeOutcome> {
  const [current] = await tx
    .select()
    .from(planProgress)
    .where(and(eq(planProgress.id, change.entityId), eq(planProgress.userId, userId)))
    .limit(1)
    .for("update");

  if (change.op === "delete") {
    if (!current) return { serverVersion: 0, applied: false };
    if (!accepts(change.hlc, current.hlc)) {
      return { serverVersion: current.serverVersion, applied: false };
    }
    const serverVersion = current.serverVersion + 1;
    await tx
      .update(planProgress)
      .set({ deletedAt: new Date(), hlc: change.hlc, serverVersion, updatedAt: new Date() })
      .where(and(eq(planProgress.id, change.entityId), eq(planProgress.userId, userId)));
    return { serverVersion, applied: true };
  }

  const payload: PlanProgressPayload = planProgressPayloadSchema.parse(requirePayload(change));
  const [plan] = await tx
    .select({ id: readingPlans.id })
    .from(readingPlans)
    .where(and(eq(readingPlans.id, payload.planId), eq(readingPlans.isPublished, true)))
    .limit(1);
  if (!plan) {
    throw new ChangeRejectedError("invalid-plan", "The reading plan does not exist");
  }

  if (!current || current.planId !== payload.planId || current.dayNumber !== payload.dayNumber) {
    const [sameDay] = await tx
      .select({ id: planProgress.id })
      .from(planProgress)
      .where(
        and(
          eq(planProgress.userId, userId),
          eq(planProgress.planId, payload.planId),
          eq(planProgress.dayNumber, payload.dayNumber),
          ne(planProgress.id, change.entityId),
        ),
      )
      .limit(1);
    if (sameDay) {
      throw new ChangeRejectedError(
        "plan-day-exists",
        "Progress for this plan day already exists under a different id",
      );
    }
  }

  if (current && !accepts(change.hlc, current.hlc)) {
    return { serverVersion: current.serverVersion, applied: false };
  }
  const completedAt = payload.completedAt ? new Date(payload.completedAt) : null;
  if (current) {
    const serverVersion = current.serverVersion + 1;
    await tx
      .update(planProgress)
      .set({
        planId: payload.planId,
        dayNumber: payload.dayNumber,
        completedAt,
        hlc: change.hlc,
        serverVersion,
        deletedAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(planProgress.id, change.entityId), eq(planProgress.userId, userId)));
    return { serverVersion, applied: true };
  }
  await tx.insert(planProgress).values({
    id: change.entityId,
    userId,
    planId: payload.planId,
    dayNumber: payload.dayNumber,
    completedAt,
    hlc: change.hlc,
    serverVersion: 1,
  });
  return { serverVersion: 1, applied: true };
}

async function applyReadingProgress(
  tx: DbTransaction,
  userId: string,
  change: ChangeInput,
): Promise<ChangeOutcome> {
  const versionId = change.entityId;
  const [current] = await tx
    .select()
    .from(readingProgress)
    .where(and(eq(readingProgress.userId, userId), eq(readingProgress.versionId, versionId)))
    .limit(1)
    .for("update");

  if (change.op === "delete") {
    if (!current) return { serverVersion: 0, applied: false };
    if (!accepts(change.hlc, current.hlc)) {
      return { serverVersion: current.serverVersion, applied: false };
    }
    const serverVersion = current.serverVersion + 1;
    await tx
      .update(readingProgress)
      .set({ deletedAt: new Date(), hlc: change.hlc, serverVersion, updatedAt: new Date() })
      .where(and(eq(readingProgress.userId, userId), eq(readingProgress.versionId, versionId)));
    return { serverVersion, applied: true };
  }

  const payload: ReadingProgressPayload = readingProgressPayloadSchema.parse(
    requirePayload(change),
  );
  if (current && !accepts(change.hlc, current.hlc)) {
    return { serverVersion: current.serverVersion, applied: false };
  }
  if (current) {
    const serverVersion = current.serverVersion + 1;
    await tx
      .update(readingProgress)
      .set({
        book: payload.book,
        chapter: payload.chapter,
        verse: payload.verse,
        hlc: change.hlc,
        serverVersion,
        deletedAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(readingProgress.userId, userId), eq(readingProgress.versionId, versionId)));
    return { serverVersion, applied: true };
  }
  await tx.insert(readingProgress).values({
    userId,
    versionId,
    book: payload.book,
    chapter: payload.chapter,
    verse: payload.verse,
    hlc: change.hlc,
    serverVersion: 1,
  });
  return { serverVersion: 1, applied: true };
}

async function applyPreference(
  tx: DbTransaction,
  userId: string,
  change: ChangeInput,
): Promise<ChangeOutcome> {
  if (change.entityId !== PREFERENCES_ENTITY_ID) {
    throw new ChangeRejectedError(
      "invalid-entity-id",
      `Preference changes must use entityId "${PREFERENCES_ENTITY_ID}"`,
    );
  }
  const [current] = await tx
    .select()
    .from(preferences)
    .where(eq(preferences.userId, userId))
    .limit(1)
    .for("update");

  if (change.op === "delete") {
    if (!current) return { serverVersion: 0, applied: false };
    if (!accepts(change.hlc, current.hlc)) {
      return { serverVersion: current.serverVersion, applied: false };
    }
    const serverVersion = current.serverVersion + 1;
    await tx
      .update(preferences)
      .set({ deletedAt: new Date(), hlc: change.hlc, serverVersion, updatedAt: new Date() })
      .where(eq(preferences.userId, userId));
    return { serverVersion, applied: true };
  }

  const payload: PreferencePayload = preferencePayloadSchema.parse(requirePayload(change));
  if (current && !accepts(change.hlc, current.hlc)) {
    return { serverVersion: current.serverVersion, applied: false };
  }

  if (current) {
    const serverVersion = current.serverVersion + 1;
    const update: typeof preferences.$inferInsert = {
      userId,
      hlc: change.hlc,
      serverVersion,
      updatedAt: new Date(),
      deletedAt: null,
      theme: payload.theme ?? current.theme,
      readingTheme: payload.readingTheme ?? current.readingTheme,
      fontScale: payload.fontScale ?? current.fontScale,
      activeVersionId:
        payload.activeVersionId === undefined ? current.activeVersionId : payload.activeVersionId,
      lastLocation:
        payload.lastLocation === undefined ? current.lastLocation : payload.lastLocation,
    };
    await tx.update(preferences).set(update).where(eq(preferences.userId, userId));
    return { serverVersion, applied: true };
  }

  await tx.insert(preferences).values({
    userId,
    theme: payload.theme ?? "system",
    readingTheme: payload.readingTheme ?? "light",
    fontScale: payload.fontScale ?? 100,
    activeVersionId: payload.activeVersionId ?? null,
    lastLocation: payload.lastLocation ?? null,
    hlc: change.hlc,
    serverVersion: 1,
  });
  return { serverVersion: 1, applied: true };
}

/** Applies one validated sync change to the user's rows inside an open transaction. */
export async function applyChange(
  tx: DbTransaction,
  userId: string,
  change: ChangeInput,
): Promise<ChangeOutcome> {
  switch (change.entity) {
    case "bookmark":
      return applyBookmark(tx, userId, change);
    case "highlight":
      return applyHighlight(tx, userId, change);
    case "note":
      return applyNote(tx, userId, change);
    case "folder":
      return applyFolder(tx, userId, change);
    case "reading-plan-progress":
      return applyPlanProgress(tx, userId, change);
    case "reading-progress":
      return applyReadingProgress(tx, userId, change);
    case "preference":
      return applyPreference(tx, userId, change);
  }
}
