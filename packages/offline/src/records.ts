import type { BookCode, SyncEntity } from "@holyword/core";
import type {
  LocalBookmark,
  LocalEntityOf,
  LocalEntityRecord,
  LocalFolder,
  LocalHighlight,
  LocalNote,
  LocalPlanProgress,
  LocalPreferences,
  LocalReadingProgress,
  PreferencePayload,
  ReadingLocation,
  SyncPayloadTypes,
} from "./types";

export const ENTITY_TABLE: Record<SyncEntity, string> = {
  bookmark: "bookmarks",
  highlight: "highlights",
  note: "notes",
  folder: "folders",
  "reading-plan-progress": "plan_progress",
  "reading-progress": "reading_progress",
  preference: "preferences",
};

export const PREFERENCES_ID = "preferences";

export interface RecordMeta {
  readonly hlc: string;
  readonly server_version: number;
  readonly deleted_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export function recordEntityId(entity: SyncEntity, record: LocalEntityRecord): string {
  switch (entity) {
    case "bookmark":
      return (record as LocalBookmark).id;
    case "highlight":
      return (record as LocalHighlight).id;
    case "note":
      return (record as LocalNote).id;
    case "folder":
      return (record as LocalFolder).id;
    case "reading-plan-progress":
      return (record as LocalPlanProgress).id;
    case "reading-progress":
      return (record as LocalReadingProgress).version_id;
    case "preference":
      return PREFERENCES_ID;
  }
}

export function recordHlc(record: LocalEntityRecord): string {
  return record.hlc;
}

export function recordServerVersion(record: LocalEntityRecord): number {
  return record.server_version;
}

export function defaultPreferences(meta: RecordMeta): LocalPreferences {
  return {
    id: PREFERENCES_ID,
    theme: "system",
    reading_theme: "light",
    font_scale: 100,
    active_version_id: null,
    last_location: null,
    ...meta,
  };
}

export function mergePreferences(
  current: LocalPreferences | undefined,
  patch: PreferencePayload,
  meta: RecordMeta,
): LocalPreferences {
  const base = current ?? defaultPreferences(meta);
  return {
    ...base,
    theme: patch.theme ?? base.theme,
    reading_theme: patch.readingTheme ?? base.reading_theme,
    font_scale: patch.fontScale ?? base.font_scale,
    active_version_id:
      patch.activeVersionId === undefined ? base.active_version_id : patch.activeVersionId,
    last_location: patch.lastLocation === undefined ? base.last_location : patch.lastLocation,
    hlc: meta.hlc,
    server_version: meta.server_version,
    deleted_at: meta.deleted_at,
    created_at: current?.created_at ?? meta.created_at,
    updated_at: meta.updated_at,
  };
}

export function preferencePatch(record: LocalPreferences): PreferencePayload {
  return {
    theme: record.theme,
    readingTheme: record.reading_theme,
    fontScale: record.font_scale,
    activeVersionId: record.active_version_id,
    lastLocation: record.last_location,
  };
}

export function mergePreferencePayloads(
  first: PreferencePayload,
  second: PreferencePayload,
): PreferencePayload {
  return {
    ...first,
    ...second,
    ...(second.activeVersionId === undefined && first.activeVersionId !== undefined
      ? { activeVersionId: first.activeVersionId }
      : {}),
    ...(second.lastLocation === undefined && first.lastLocation !== undefined
      ? { lastLocation: first.lastLocation }
      : {}),
  };
}

export function toSyncPayload<E extends SyncEntity>(
  entity: E,
  record: LocalEntityOf<E>,
): SyncPayloadTypes[E] {
  switch (entity) {
    case "bookmark": {
      const value = record as LocalBookmark;
      return {
        verseId: value.verse_id,
        versionId: value.version_id,
        label: value.label,
      } as SyncPayloadTypes[E];
    }
    case "highlight": {
      const value = record as LocalHighlight;
      return {
        verseId: value.verse_id,
        versionId: value.version_id,
        color: value.color,
        startOffset: value.start_offset,
        endOffset: value.end_offset,
      } as SyncPayloadTypes[E];
    }
    case "note": {
      const value = record as LocalNote;
      return {
        verseId: value.verse_id,
        reference: value.reference,
        title: value.title,
        body: value.body,
        folderId: value.folder_id,
      } as SyncPayloadTypes[E];
    }
    case "folder": {
      const value = record as LocalFolder;
      return { name: value.name, parentId: value.parent_id } as SyncPayloadTypes[E];
    }
    case "reading-plan-progress": {
      const value = record as LocalPlanProgress;
      return {
        planId: value.plan_id,
        dayNumber: value.day_number,
        completedAt: value.completed_at,
      } as SyncPayloadTypes[E];
    }
    case "reading-progress": {
      const value = record as LocalReadingProgress;
      return {
        book: value.book,
        chapter: value.chapter,
        verse: value.verse,
      } as SyncPayloadTypes[E];
    }
    case "preference": {
      return preferencePatch(record as LocalPreferences) as SyncPayloadTypes[E];
    }
  }
}

function stringValue(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || !value) throw new Error(`Sync payload is missing "${key}"`);
  return value;
}

function nullableString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" ? value : null;
}

function numberValue(payload: Record<string, unknown>, key: string): number {
  const value = payload[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Sync payload is missing "${key}"`);
  }
  return value;
}

function nullableNumber(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Converts a server payload into the local row shape, preserving the supplied metadata. */
export function payloadToRecord(
  entity: SyncEntity,
  entityId: string,
  payload: Record<string, unknown> | null,
  meta: RecordMeta,
  current?: LocalEntityRecord,
): LocalEntityRecord {
  if (!payload) throw new Error(`An upsert for ${entity} requires a payload`);

  switch (entity) {
    case "bookmark": {
      const value: LocalBookmark = {
        id: entityId,
        verse_id: stringValue(payload, "verseId"),
        version_id: stringValue(payload, "versionId"),
        label: nullableString(payload, "label"),
        ...meta,
        created_at: current?.created_at ?? meta.created_at,
      };
      return value;
    }
    case "highlight": {
      const color = stringValue(payload, "color") as LocalHighlight["color"];
      return {
        id: entityId,
        verse_id: stringValue(payload, "verseId"),
        version_id: stringValue(payload, "versionId"),
        color,
        start_offset: nullableNumber(payload, "startOffset"),
        end_offset: nullableNumber(payload, "endOffset"),
        ...meta,
        created_at: current?.created_at ?? meta.created_at,
      };
    }
    case "note": {
      return {
        id: entityId,
        verse_id: nullableString(payload, "verseId"),
        reference: nullableString(payload, "reference"),
        title: nullableString(payload, "title"),
        body: stringValue(payload, "body"),
        folder_id: nullableString(payload, "folderId"),
        ...meta,
        created_at: current?.created_at ?? meta.created_at,
      };
    }
    case "folder": {
      return {
        id: entityId,
        name: stringValue(payload, "name"),
        parent_id: nullableString(payload, "parentId"),
        ...meta,
        created_at: current?.created_at ?? meta.created_at,
      };
    }
    case "reading-plan-progress": {
      return {
        id: entityId,
        plan_id: stringValue(payload, "planId"),
        day_number: numberValue(payload, "dayNumber"),
        completed_at: nullableString(payload, "completedAt"),
        ...meta,
        created_at: current?.created_at ?? meta.created_at,
      };
    }
    case "reading-progress": {
      return {
        version_id: entityId,
        book: stringValue(payload, "book") as BookCode,
        chapter: numberValue(payload, "chapter"),
        verse: nullableNumber(payload, "verse"),
        ...meta,
        created_at: current?.created_at ?? meta.created_at,
      };
    }
    case "preference": {
      return mergePreferences(
        (current as LocalPreferences | undefined)?.id === PREFERENCES_ID
          ? (current as LocalPreferences)
          : undefined,
        payload as PreferencePayload,
        meta,
      );
    }
  }
}

export function preferencesWithMeta(record: LocalPreferences, meta: RecordMeta): LocalPreferences {
  return {
    ...record,
    ...meta,
    created_at: record.created_at,
    id: PREFERENCES_ID,
  };
}

export function readingLocation(value: unknown): ReadingLocation | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ReadingLocation>;
  if (
    typeof candidate.versionId !== "string" ||
    typeof candidate.book !== "string" ||
    typeof candidate.chapter !== "number"
  ) {
    return null;
  }
  return {
    versionId: candidate.versionId,
    book: candidate.book as BookCode,
    chapter: candidate.chapter,
    ...(typeof candidate.verse === "number" ? { verse: candidate.verse } : {}),
  };
}
