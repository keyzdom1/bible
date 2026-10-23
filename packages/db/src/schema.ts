import type { LicencePolicy, PackageManifest } from "@holyword/core";
import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

export const licenceStatusEnum = pgEnum("licence_status", [
  "public-domain",
  "licensed",
  "unlicensed",
]);

export const syncEntityEnum = pgEnum("sync_entity", [
  "bookmark",
  "highlight",
  "note",
  "folder",
  "reading-plan-progress",
  "reading-progress",
  "preference",
]);

export const syncOpEnum = pgEnum("sync_op", ["upsert", "delete"]);

export const devicePlatformEnum = pgEnum("device_platform", ["web", "ios", "android"]);

export const themeEnum = pgEnum("theme", ["system", "light", "dark"]);
export const readingThemeEnum = pgEnum("reading_theme", ["light", "sepia", "dark"]);

export const entitlementKindEnum = pgEnum("entitlement_kind", ["offline", "audio", "commentary"]);

export const contentFormatEnum = pgEnum("content_format", ["usfm", "osis", "json"]);
export const ingestStatusEnum = pgEnum("ingest_status", ["running", "succeeded", "failed"]);

export const conflictResolutionEnum = pgEnum("conflict_resolution", [
  "kept-local",
  "kept-remote",
  "merged",
]);

export interface PlanDay {
  readonly day: number;
  readonly title: string;
  readonly references: readonly string[];
}

export interface ReadingLocation {
  readonly versionId: string;
  readonly book: string;
  readonly chapter: number;
  readonly verse?: number;
}

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/**
 * Sync bookkeeping carried by every user-owned, syncable row.
 * `serverVersion` is the per-record counter the client echoes back as `baseVersion`.
 */
function syncColumns() {
  return {
    hlc: text("hlc").notNull(),
    serverVersion: integer("server_version").notNull().default(1),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  };
}

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  cognitoSub: text("cognito_sub").notNull().unique(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  locale: text("locale").notNull().default("en"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const devices = pgTable(
  "devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name"),
    platform: devicePlatformEnum("platform").notNull(),
    appVersion: text("app_version"),
    pullCursor: bigint("pull_cursor", { mode: "number" }).notNull().default(0),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (table) => [index("devices_user_last_seen_idx").on(table.userId, table.lastSeenAt)],
);

/** Tracks which devices have downloaded a version, for per-title device limits. */
export const versionInstalls = pgTable(
  "version_installs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    versionId: text("version_id").notNull(),
    installedAt: timestamp("installed_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("version_installs_unique_idx").on(table.userId, table.versionId, table.deviceId),
  ],
);

export const contentVersions = pgTable("content_versions", {
  versionId: text("version_id").primaryKey(),
  versionCode: integer("version_code").notNull(),
  name: text("name").notNull(),
  abbreviation: text("abbreviation").notNull(),
  language: text("language").notNull(),
  languageName: text("language_name").notNull(),
  direction: text("direction").notNull().default("ltr"),
  licenceStatus: licenceStatusEnum("licence_status").notNull().default("unlicensed"),
  enabled: boolean("enabled").notNull().default(false),
  policy: jsonb("policy").$type<LicencePolicy>().notNull(),
  manifest: jsonb("manifest").$type<PackageManifest>(),
  packageKey: text("package_key"),
  packageBytes: bigint("package_bytes", { mode: "number" }),
  verseCount: integer("verse_count").notNull().default(0),
  checksum: text("checksum"),
  enabledAt: timestamp("enabled_at", { withTimezone: true }),
  enabledBy: text("enabled_by"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const entitlements = pgTable(
  "entitlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    versionId: text("version_id").notNull(),
    kind: entitlementKindEnum("kind").notNull(),
    source: text("source").notNull(),
    licenceKeyHash: text("licence_key_hash"),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("entitlements_unique_idx").on(table.userId, table.versionId, table.kind),
    index("entitlements_user_idx").on(table.userId),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id"),
    actorEmail: text("actor_email"),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (table) => [index("audit_log_target_idx").on(table.targetType, table.targetId)],
);

export const preferences = pgTable("preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  theme: themeEnum("theme").notNull().default("system"),
  readingTheme: readingThemeEnum("reading_theme").notNull().default("light"),
  fontScale: integer("font_scale").notNull().default(100),
  activeVersionId: text("active_version_id"),
  lastLocation: jsonb("last_location").$type<ReadingLocation>(),
  ...syncColumns(),
  updatedAt: updatedAt(),
});

export const bookmarks = pgTable(
  "bookmarks",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    verseId: text("verse_id").notNull(),
    versionId: text("version_id").notNull(),
    label: text("label"),
    ...syncColumns(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("bookmarks_user_updated_idx").on(table.userId, table.updatedAt),
    index("bookmarks_user_verse_idx").on(table.userId, table.verseId),
  ],
);

export const highlights = pgTable(
  "highlights",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    verseId: text("verse_id").notNull(),
    versionId: text("version_id").notNull(),
    /** Brand palette key: gold, cyan, emerald, royal-red, purple. */
    color: text("color").notNull(),
    startOffset: integer("start_offset"),
    endOffset: integer("end_offset"),
    ...syncColumns(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("highlights_user_updated_idx").on(table.userId, table.updatedAt),
    index("highlights_user_verse_idx").on(table.userId, table.verseId),
  ],
);

export const folders = pgTable(
  "folders",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => folders.id, {
      onDelete: "set null",
    }),
    ...syncColumns(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("folders_user_parent_idx").on(table.userId, table.parentId)],
);

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    verseId: text("verse_id"),
    reference: text("reference"),
    title: text("title"),
    body: text("body").notNull(),
    folderId: uuid("folder_id").references(() => folders.id, { onDelete: "set null" }),
    ...syncColumns(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("notes_user_updated_idx").on(table.userId, table.updatedAt),
    index("notes_user_verse_idx").on(table.userId, table.verseId),
    index("notes_user_folder_idx").on(table.userId, table.folderId),
  ],
);

/** Both sides of a concurrent note edit are preserved here until the user resolves them. */
export const noteConflicts = pgTable(
  "note_conflicts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    noteId: uuid("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    localPayload: jsonb("local_payload").$type<Record<string, unknown>>().notNull(),
    remotePayload: jsonb("remote_payload").$type<Record<string, unknown>>().notNull(),
    localHlc: text("local_hlc").notNull(),
    remoteHlc: text("remote_hlc").notNull(),
    resolution: conflictResolutionEnum("resolution"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [index("note_conflicts_user_created_idx").on(table.userId, table.createdAt)],
);

export const readingPlans = pgTable("reading_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  dayCount: integer("day_count").notNull(),
  schedule: jsonb("schedule").$type<readonly PlanDay[]>().notNull(),
  isPublished: boolean("is_published").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const planProgress = pgTable(
  "plan_progress",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => readingPlans.id, { onDelete: "cascade" }),
    dayNumber: integer("day_number").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...syncColumns(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("plan_progress_unique_idx").on(table.userId, table.planId, table.dayNumber),
  ],
);

export const readingProgress = pgTable(
  "reading_progress",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    versionId: text("version_id").notNull(),
    book: text("book").notNull(),
    chapter: integer("chapter").notNull(),
    verse: integer("verse"),
    ...syncColumns(),
    updatedAt: updatedAt(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.versionId] })],
);

/**
 * Idempotency + ordering log for sync pushes. `opId` is the client-generated UUID,
 * so replays are de-duplicated; `serverSeq` drives incremental pulls.
 */
export const syncOperations = pgTable(
  "sync_operations",
  {
    opId: uuid("op_id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id").notNull(),
    entity: syncEntityEnum("entity").notNull(),
    entityId: text("entity_id").notNull(),
    op: syncOpEnum("op").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    hlc: text("hlc").notNull(),
    serverSeq: bigserial("server_seq", { mode: "number" }).notNull().unique(),
    serverVersion: integer("server_version").notNull().default(1),
    conflictId: uuid("conflict_id"),
    appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("sync_operations_user_seq_idx").on(table.userId, table.serverSeq)],
);

/** Ingestion staging: validated verse text waiting to be packaged and published. */
export const ingestRuns = pgTable("ingest_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  versionId: text("version_id").notNull(),
  sourceFormat: contentFormatEnum("source_format").notNull(),
  sourceName: text("source_name").notNull(),
  sourceChecksum: text("source_checksum").notNull(),
  status: ingestStatusEnum("status").notNull().default("running"),
  stats: jsonb("stats").$type<Record<string, unknown>>(),
  startedAt: createdAt(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const ingestVerses = pgTable(
  "ingest_verses",
  {
    runId: uuid("run_id")
      .notNull()
      .references(() => ingestRuns.id, { onDelete: "cascade" }),
    verseId: text("verse_id").notNull(),
    book: text("book").notNull(),
    chapter: integer("chapter").notNull(),
    verse: integer("verse").notNull(),
    text: text("text").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.verseId] }),
    index("ingest_verses_lookup_idx").on(table.runId, table.book, table.chapter),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Device = typeof devices.$inferSelect;
export type Bookmark = typeof bookmarks.$inferSelect;
export type Highlight = typeof highlights.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type Folder = typeof folders.$inferSelect;
export type ReadingPlan = typeof readingPlans.$inferSelect;
export type PlanProgress = typeof planProgress.$inferSelect;
export type ReadingProgress = typeof readingProgress.$inferSelect;
export type Preference = typeof preferences.$inferSelect;
export type SyncOperationRow = typeof syncOperations.$inferSelect;
export type ContentVersionRow = typeof contentVersions.$inferSelect;
