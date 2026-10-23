export * from "./types";
export { PersistentHybridClock, randomUuid, type ClockStateStore, type IdGenerator } from "./clock";
export {
  defaultPreferences,
  mergePreferences,
  mergePreferencePayloads,
  payloadToRecord,
  PREFERENCES_ID,
  preferencePatch,
  recordEntityId,
  recordHlc,
  recordServerVersion,
  toSyncPayload,
  type RecordMeta,
} from "./records";
export {
  LocalStudy,
  type LocalStudyOptions,
  type SaveBookmarkInput,
  type SaveFolderInput,
  type SaveHighlightInput,
  type SaveNoteInput,
  type SavePlanProgressInput,
  type SaveReadingProgressInput,
} from "./study";
export {
  applyRemoteChange,
  noteConflictId,
  type ApplyOptions,
  type ApplyResult,
  type ConflictHint,
} from "./sync/apply";
export {
  ApiSyncTransport,
  SyncClient,
  type SyncClientOptions,
  type SyncStateView,
  type SyncSummary,
} from "./sync/client";
export { MiniSearchEngine } from "./search/minisearch";
export { normalizeSearchText } from "./search/text";
export { referenceToVerseRange, searchReference } from "./search/reference";
export {
  DownloadError,
  DownloadManager,
  DownloadPausedError,
  type DownloadManagerOptions,
  type FetchLike as DownloadFetchLike,
  type TicketProvider,
} from "./download/manager";
export {
  PackageVerificationError,
  sha256Hex,
  verifyManifestChecksum,
  verifyPackageArchive,
  type ExpectedPackage,
  type PackageVerificationCode,
  type VerifiedPackage,
} from "./download/verification";
export { PackageInstaller, type PackageInstallerOptions } from "./download/installer";
export { OfflineLibrary, type OfflineLibraryOptions } from "./library";
