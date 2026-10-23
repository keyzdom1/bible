import type {
  Bookmark,
  Folder,
  Highlight,
  Note,
  PlanProgress,
  Preference,
  ReadingProgress,
  ReadingPlan,
} from "@holyword/db";

export interface BookmarkDto {
  id: string;
  verseId: string;
  versionId: string;
  label: string | null;
  hlc: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  serverVersion: number;
}

export function toBookmarkDto(row: Bookmark): BookmarkDto {
  return {
    id: row.id,
    verseId: row.verseId,
    versionId: row.versionId,
    label: row.label,
    hlc: row.hlc,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    serverVersion: row.serverVersion,
  };
}

export interface HighlightDto {
  id: string;
  verseId: string;
  versionId: string;
  color: string;
  startOffset: number | null;
  endOffset: number | null;
  hlc: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  serverVersion: number;
}

export function toHighlightDto(row: Highlight): HighlightDto {
  return {
    id: row.id,
    verseId: row.verseId,
    versionId: row.versionId,
    color: row.color,
    startOffset: row.startOffset,
    endOffset: row.endOffset,
    hlc: row.hlc,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    serverVersion: row.serverVersion,
  };
}

export interface NoteDto {
  id: string;
  verseId: string | null;
  reference: string | null;
  title: string | null;
  body: string;
  folderId: string | null;
  hlc: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  serverVersion: number;
}

export function toNoteDto(row: Note): NoteDto {
  return {
    id: row.id,
    verseId: row.verseId,
    reference: row.reference,
    title: row.title,
    body: row.body,
    folderId: row.folderId,
    hlc: row.hlc,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    serverVersion: row.serverVersion,
  };
}

export interface FolderDto {
  id: string;
  name: string;
  parentId: string | null;
  hlc: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  serverVersion: number;
}

export function toFolderDto(row: Folder): FolderDto {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parentId,
    hlc: row.hlc,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    serverVersion: row.serverVersion,
  };
}

export interface PlanDto {
  id: string;
  slug: string;
  title: string;
  description: string;
  dayCount: number;
  schedule: ReadingPlan["schedule"];
}

export function toPlanDto(row: ReadingPlan): PlanDto {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    dayCount: row.dayCount,
    schedule: row.schedule,
  };
}

export interface PlanProgressDto {
  id: string;
  planId: string;
  dayNumber: number;
  completedAt: Date | null;
  hlc: string;
  updatedAt: Date;
  serverVersion: number;
}

export function toPlanProgressDto(row: PlanProgress): PlanProgressDto {
  return {
    id: row.id,
    planId: row.planId,
    dayNumber: row.dayNumber,
    completedAt: row.completedAt,
    hlc: row.hlc,
    updatedAt: row.updatedAt,
    serverVersion: row.serverVersion,
  };
}

export interface ReadingProgressDto {
  versionId: string;
  book: string;
  chapter: number;
  verse: number | null;
  hlc: string;
  updatedAt: Date;
  serverVersion: number;
}

export function toReadingProgressDto(row: ReadingProgress): ReadingProgressDto {
  return {
    versionId: row.versionId,
    book: row.book,
    chapter: row.chapter,
    verse: row.verse,
    hlc: row.hlc,
    updatedAt: row.updatedAt,
    serverVersion: row.serverVersion,
  };
}

export interface PreferenceDto {
  theme: string;
  readingTheme: string;
  fontScale: number;
  activeVersionId: string | null;
  lastLocation: Preference["lastLocation"];
  hlc: string;
  updatedAt: Date;
  serverVersion: number;
}

export function toPreferenceDto(row: Preference): PreferenceDto {
  return {
    theme: row.theme,
    readingTheme: row.readingTheme,
    fontScale: row.fontScale,
    activeVersionId: row.activeVersionId,
    lastLocation: row.lastLocation,
    hlc: row.hlc,
    updatedAt: row.updatedAt,
    serverVersion: row.serverVersion,
  };
}
