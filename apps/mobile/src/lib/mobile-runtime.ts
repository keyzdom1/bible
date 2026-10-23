import {
  ApiClientError,
  CognitoAuthClient,
  CognitoError,
  HolyWordApiClient,
  checkCopyAllowed,
  formatCitation,
  type ApiSession,
  type ApiVersion,
  type BookCode,
  type CognitoChallenge,
  type CognitoSignUpResult,
  type CognitoTokens,
  type LicencePolicy,
} from "@holyword/core";
import {
  ApiSyncTransport,
  DownloadManager,
  LocalStudy,
  OfflineLibrary,
  PackageInstaller,
  PersistentHybridClock,
  SyncClient,
  type DownloadCheckpoint,
  type DownloadProgress,
  type LocalNoteConflict,
  type LocalPreferences,
  type LocalReadingPlan,
  type LocalReadingProgress,
  type LocalVersion,
  type LocalVerse,
  type PreferencePayload,
  type SyncStateView,
} from "@holyword/offline";
import {
  ExpoSqliteDriver,
  SqliteOfflineDatabase,
  SqliteSearchEngine,
  type ExpoSQLiteLike,
} from "@holyword/offline/sqlite";
import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";
import { Platform } from "react-native";
import { MobileAuthStore, SessionExpiredError, type MobileAuthMode } from "./auth-store";
import { API_BASE_URL, COGNITO_CONFIG, DEV_AUTH_ENABLED } from "./config";

export interface ChapterView {
  readonly versionId: string;
  readonly book: BookCode;
  readonly bookName: string;
  readonly chapter: number;
  readonly abbreviation: string;
  readonly verses: readonly {
    readonly id: string;
    readonly verse: number;
    readonly text: string;
  }[];
  readonly source: "local" | "online";
  readonly copyright: string;
  readonly attribution: string;
  readonly policy: LicencePolicy | null;
}

export interface SearchResultView {
  readonly verseId: string;
  readonly versionId: string;
  readonly book: BookCode;
  readonly chapter: number;
  readonly verse: number;
  readonly text: string;
}

export interface SearchOutcome {
  readonly results: readonly SearchResultView[];
  readonly engine: "local" | "online";
}

export interface PlanView extends LocalReadingPlan {
  readonly completedDays: readonly number[];
}

export interface VersionSummary {
  readonly versionId: string;
  readonly name: string;
  readonly abbreviation: string;
  readonly language: string;
  readonly licenceStatus: string;
  readonly enabled: boolean;
  readonly installed: boolean;
  readonly storageBytes: number;
}

export interface DownloadView extends DownloadProgress {
  readonly name: string;
}

export type SyncListener = (state: SyncStateView) => void;
export type DownloadListener = (progress: DownloadProgress) => void;

const CATALOG_KEY = "catalog.cache.v1";

function isUnauthorized(error: unknown): boolean {
  return (
    (error instanceof ApiClientError && (error.status === 401 || error.status === 403)) ||
    error instanceof SessionExpiredError
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function policyFromApi(version: ApiVersion): LicencePolicy | null {
  if (version.licenceStatus !== "public-domain") return null;
  return {
    status: "public-domain",
    offlineDownload: true,
    maxDevices: null,
    maxVersesPerCopy: null,
    maxVersesPerShare: 500,
    encryption: "none",
    regions: null,
    copyright: version.copyright,
    attribution: version.attribution,
  };
}

function oauthState(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class MobileRuntime {
  readonly api: HolyWordApiClient;
  readonly cognito: CognitoAuthClient | null;
  readonly auth = new MobileAuthStore();
  private sqlite: SQLiteDatabase | null = null;
  private driver: ExpoSqliteDriver | null = null;
  private database: SqliteOfflineDatabase | null = null;
  private localSearch: SqliteSearchEngine | null = null;
  private library: OfflineLibrary | null = null;
  private downloads: DownloadManager | null = null;
  private study: LocalStudy | null = null;
  private sync: SyncClient | null = null;
  private clock: PersistentHybridClock | null = null;
  private deviceId = "";
  private syncListeners = new Set<SyncListener>();
  private downloadListeners = new Set<DownloadListener>();
  private syncTimer: ReturnType<typeof setTimeout> | undefined;
  private online = true;
  private pendingOauthState: string | null = null;
  private initialized = false;

  constructor() {
    this.api = new HolyWordApiClient({
      baseUrl: API_BASE_URL,
      credentials: "omit",
      getAccessToken: () => this.auth.getAccessToken(),
    });
    this.cognito = COGNITO_CONFIG ? new CognitoAuthClient(COGNITO_CONFIG) : null;
  }

  get db(): SqliteOfflineDatabase {
    if (!this.database) throw new Error("The offline database is not ready");
    return this.database;
  }

  get studyStore(): LocalStudy {
    if (!this.study) throw new Error("The offline study store is not ready");
    return this.study;
  }

  get isReady(): boolean {
    return this.initialized;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.auth.initialize();
    this.deviceId = await this.auth.getDeviceId();
    const sqlite = await openDatabaseAsync("holyword.db");
    await sqlite.execAsync("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.sqlite = sqlite;
    // Expo SQLite's runtime accepts null binds; its overloads do not expose the
    // shared driver's nullable parameter type, so adapt the static surface here.
    const driver = new ExpoSqliteDriver(sqlite as unknown as ExpoSQLiteLike);
    const database = new SqliteOfflineDatabase(driver);
    await database.initialize();
    this.driver = driver;
    this.database = database;
    this.clock = new PersistentHybridClock(database, this.deviceId);
    this.localSearch = new SqliteSearchEngine(database, driver);
    this.study = new LocalStudy({ store: database, clock: this.clock });
    this.downloads = new DownloadManager({
      store: database,
      tickets: (versionId) =>
        this.api.getDownloadTicket(versionId, {
          deviceId: this.deviceId,
          platform: Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web",
        }),
      onProgress: (progress) => this.downloadListeners.forEach((listener) => listener(progress)),
    });
    const installer = new PackageInstaller({ store: database, search: this.localSearch });
    this.library = new OfflineLibrary({
      store: database,
      search: this.localSearch,
      downloads: this.downloads,
      installer,
    });
    this.sync = new SyncClient({
      store: database,
      transport: new ApiSyncTransport(this.api),
      deviceId: this.deviceId,
      clock: this.clock,
      onState: (state) => this.emitSync(state),
    });
    const pending = await database.countQueue().catch(() => 0);
    this.emitSync({ status: "offline", pending, lastSyncedAt: null, lastError: null });
    this.initialized = true;
  }

  async close(): Promise<void> {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    await this.sqlite?.closeAsync();
    this.initialized = false;
  }

  onSync(listener: SyncListener): () => void {
    this.syncListeners.add(listener);
    listener(this.getSyncState());
    return () => this.syncListeners.delete(listener);
  }

  onDownload(listener: DownloadListener): () => void {
    this.downloadListeners.add(listener);
    return () => this.downloadListeners.delete(listener);
  }

  getSyncState(): SyncStateView {
    const base = this.sync?.getState() ?? {
      status: "offline" as const,
      pending: 0,
      lastSyncedAt: null,
      lastError: null,
    };
    return this.online ? base : { ...base, status: "offline" };
  }

  setOnline(online: boolean): void {
    const wasOffline = !this.online;
    this.online = online;
    if (!online) this.emitSync({ ...this.getSyncState(), status: "offline" });
    else if (wasOffline) this.scheduleSync();
  }

  isOnline(): boolean {
    return this.online;
  }

  async restoreSession(): Promise<ApiSession | null> {
    const cached = await this.auth.readCachedSession();
    try {
      await this.auth.getAccessToken();
      const session = await this.api.getSession();
      await this.auth.saveCachedSession(session);
      return session;
    } catch (error) {
      if (isUnauthorized(error)) {
        await this.auth.saveCachedSession(null);
        await this.auth.clearTokens();
        return null;
      }
      return cached;
    }
  }

  async signInDev(email: string): Promise<ApiSession> {
    if (!DEV_AUTH_ENABLED) throw new Error("Local development sign-in is disabled");
    const normalized = email.trim().toLowerCase();
    if (!normalized.includes("@")) throw new Error("Enter a valid email address.");
    const token = `dev:${normalized}`;
    await this.auth.saveTokens(
      {
        accessToken: token,
        idToken: token,
        refreshToken: null,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      },
      "dev",
      normalized,
    );
    try {
      const session = await this.exchangeIdentityToken(token);
      return session;
    } catch (error) {
      await this.auth.clearTokens();
      throw error;
    }
  }

  async signInCognito(email: string, password: string): Promise<ApiSession> {
    if (!this.cognito) throw new Error("Cognito is not configured for this build");
    const tokens = await this.cognito.signIn(email, password);
    return this.exchangeTokens(tokens, email);
  }

  async completeNewPassword(
    username: string,
    session: string,
    newPassword: string,
  ): Promise<ApiSession> {
    if (!this.cognito) throw new Error("Cognito is not configured for this build");
    const tokens = await this.cognito.completeNewPassword(username, session, newPassword);
    return this.exchangeTokens(tokens, username);
  }

  async signInWithTokens(tokens: CognitoTokens): Promise<ApiSession> {
    return this.exchangeTokens(tokens, null, "hosted");
  }

  beginHostedLogin(identityProvider?: string): string | null {
    if (!this.cognito) return null;
    const state = oauthState();
    this.pendingOauthState = state;
    return this.cognito.hostedLoginUrl({ state, identityProvider });
  }

  async completeHostedLogin(callbackUrl: string): Promise<ApiSession> {
    if (!this.cognito) throw new Error("Cognito is not configured for this build");
    const fragment = callbackUrl.includes("#") ? callbackUrl.split("#")[1]! : "";
    const parameters = new URLSearchParams(fragment);
    const returnedState = parameters.get("state");
    if (!this.pendingOauthState || returnedState !== this.pendingOauthState) {
      throw new Error("The sign-in response could not be verified. Try again.");
    }
    this.pendingOauthState = null;
    const tokens = this.cognito.parseRedirect(fragment);
    if (!tokens) throw new Error("The identity provider did not return a usable sign-in.");
    return this.exchangeTokens(tokens, null, "hosted");
  }

  async register(email: string, password: string, name?: string): Promise<CognitoSignUpResult> {
    if (!this.cognito) throw new Error("Cognito is not configured for this build");
    return this.cognito.signUp(email, password, name);
  }

  async confirmRegistration(email: string, code: string): Promise<void> {
    if (!this.cognito) throw new Error("Cognito is not configured for this build");
    await this.cognito.confirmSignUp(email, code);
  }

  async resendConfirmation(email: string): Promise<void> {
    if (!this.cognito) throw new Error("Cognito is not configured for this build");
    await this.cognito.resendConfirmationCode(email);
  }

  async requestPasswordReset(email: string): Promise<void> {
    if (!this.cognito) throw new Error("Cognito is not configured for this build");
    await this.cognito.forgotPassword(email);
  }

  async confirmPasswordReset(email: string, code: string, password: string): Promise<void> {
    if (!this.cognito) throw new Error("Cognito is not configured for this build");
    await this.cognito.confirmForgotPassword(email, code, password);
  }

  async activateSession(session: ApiSession): Promise<boolean> {
    const previous = await this.auth.readAccountId();
    let scopeChanged = false;
    if (previous && previous !== session.userId) {
      await this.db.clearLocalData();
      scopeChanged = true;
    }
    await this.auth.saveAccountId(session.userId);
    await this.auth.saveCachedSession(session);
    if (this.online) {
      void this.syncPlans().catch(() => undefined);
      void this.syncNow().catch(() => undefined);
    }
    return scopeChanged;
  }

  async signOut(): Promise<void> {
    if (this.online) await this.api.deleteSession().catch(() => undefined);
    await this.auth.clearTokens();
    await this.auth.saveCachedSession(null);
    this.emitSync({ ...this.getSyncState(), status: "offline" });
  }

  async deleteAccount(): Promise<void> {
    await this.api.deleteAccount();
    await this.db.clearLocalData();
    await this.auth.saveAccountId(null);
    await this.auth.saveCachedSession(null);
    await this.auth.clearTokens();
  }

  async exportAccount(): Promise<Record<string, unknown>> {
    return this.api.exportAccount();
  }

  async listCatalog(): Promise<ApiVersion[]> {
    try {
      const versions = await this.api.listVersions(true);
      await this.db.setState(CATALOG_KEY, JSON.stringify(versions));
      return versions;
    } catch {
      const raw = await this.db.getState(CATALOG_KEY);
      if (!raw) return [];
      try {
        return JSON.parse(raw) as ApiVersion[];
      } catch {
        return [];
      }
    }
  }

  async listVersionSummaries(): Promise<VersionSummary[]> {
    const [catalog, installed] = await Promise.all([this.listCatalog(), this.db.listVersions()]);
    const installedIds = new Set(installed.map((version) => version.version_id));
    const summaries: VersionSummary[] = catalog.map((version) => {
      const local = installed.find((entry) => entry.version_id === version.versionId);
      return {
        versionId: version.versionId,
        name: version.name,
        abbreviation: version.abbreviation,
        language: version.language,
        licenceStatus: version.licenceStatus,
        enabled: version.enabled,
        installed: installedIds.has(version.versionId),
        storageBytes: local?.storage_bytes ?? 0,
      };
    });
    for (const local of installed) {
      if (!summaries.some((entry) => entry.versionId === local.version_id)) {
        summaries.push({
          versionId: local.version_id,
          name: local.name,
          abbreviation: local.abbreviation,
          language: local.language,
          licenceStatus: local.licence.status,
          enabled: true,
          installed: true,
          storageBytes: local.storage_bytes,
        });
      }
    }
    return summaries.sort((a, b) => {
      if (a.installed !== b.installed) return a.installed ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  async listInstalledVersions(): Promise<LocalVersion[]> {
    return this.db.listVersions();
  }

  async getPreferences(): Promise<LocalPreferences> {
    return (await this.studyStore.getPreferences()) ?? (await this.studyStore.savePreferences({}));
  }

  async savePreferences(patch: PreferencePayload): Promise<LocalPreferences> {
    return this.studyStore.savePreferences(patch);
  }

  async saveReadingPosition(
    versionId: string,
    book: BookCode,
    chapter: number,
    verse?: number | null,
  ): Promise<void> {
    await this.studyStore.savePreferences({
      activeVersionId: versionId,
      lastLocation: { versionId, book, chapter, ...(verse ? { verse } : {}) },
    });
    await this.studyStore.saveReadingProgress({ versionId, book, chapter, verse });
    this.scheduleSync();
  }

  async loadChapter(versionId: string, book: BookCode, chapter: number): Promise<ChapterView> {
    const local = await this.db.getVersion(versionId);
    if (local) {
      const verses = await this.db.getChapter(versionId, book, chapter);
      if (verses.length > 0) return this.chapterFromLocal(local, book, chapter, verses);
    }
    if (!this.online) {
      throw new Error("This passage is not downloaded. Reconnect to download the version.");
    }
    const catalog = await this.listCatalog();
    const version = catalog.find((entry) => entry.versionId === versionId);
    if (version && (!version.enabled || version.licenceStatus === "unlicensed")) {
      throw new Error("This Bible version is not available.");
    }
    const online = await this.api.getChapter(versionId, book, chapter);
    return {
      versionId,
      book: online.book as BookCode,
      bookName: online.bookName,
      chapter: online.chapter,
      abbreviation: version?.abbreviation ?? versionId.toUpperCase(),
      verses: online.verses.map((verse) => ({
        id: verse.id,
        verse: verse.verse,
        text: verse.text,
      })),
      source: "online",
      copyright: online.copyright,
      attribution: online.attribution,
      policy: version ? policyFromApi(version) : null,
    };
  }

  async search(query: string, versionId?: string): Promise<SearchOutcome> {
    const trimmed = query.trim();
    if (!trimmed) return { results: [], engine: "local" };
    const versions = await this.db.listVersions();
    if (!versionId && versions.length > 0 && this.localSearch) {
      const batches = await Promise.all(
        versions.map((version) => this.localSearch!.search(version.version_id, trimmed, 50)),
      );
      const ranked = batches
        .flat()
        .sort((a, b) => b.score - a.score)
        .slice(0, 50)
        .map((result) => ({
          verseId: result.verseId,
          versionId: result.versionId,
          book: result.book,
          chapter: result.chapter,
          verse: result.verse,
          text: result.text,
        }));
      return { results: ranked, engine: "local" };
    }
    const selected = versionId
      ? versions.find((version) => version.version_id === versionId)
      : versions[0];
    if (selected && this.localSearch) {
      const results = await this.localSearch.search(selected.version_id, trimmed, 50);
      return {
        results: results.map((result) => ({
          verseId: result.verseId,
          versionId: result.versionId,
          book: result.book,
          chapter: result.chapter,
          verse: result.verse,
          text: result.text,
        })),
        engine: "local",
      };
    }
    if (!this.online) {
      throw new Error(
        "No Bible version is downloaded. Reconnect and download one to search offline.",
      );
    }
    const response = await this.api.search({
      q: trimmed,
      ...(versionId ? { versionId } : {}),
      scope: versionId ? "version" : "all-versions",
      limit: 50,
    });
    return {
      results: response.results.map((result) => ({
        verseId: result.verseId,
        versionId: result.versionId,
        book: result.book as BookCode,
        chapter: result.chapter,
        verse: result.verse,
        text: result.text,
      })),
      engine: response.engine === "local" ? "local" : "online",
    };
  }

  async downloadVersion(versionId: string): Promise<LocalVersion> {
    if (!this.library) throw new Error("The download engine is not ready");
    const result = await this.library.installVersion(versionId);
    this.scheduleSync();
    return result;
  }

  async pauseDownload(versionId: string): Promise<void> {
    await this.downloads?.pause(versionId);
  }

  async deleteVersion(versionId: string): Promise<void> {
    if (!this.library) throw new Error("The download engine is not ready");
    await this.library.deleteVersion(versionId);
  }

  async listDownloadProgress(): Promise<DownloadView[]> {
    if (!this.driver) return [];
    const checkpoints = await this.driver.all<DownloadCheckpoint>(
      "SELECT * FROM downloads ORDER BY updated_at DESC",
    );
    return checkpoints.map((checkpoint) => {
      const total = checkpoint.total_bytes;
      return {
        versionId: checkpoint.version_id,
        name: checkpoint.version_id.toUpperCase(),
        status: checkpoint.status,
        receivedBytes: checkpoint.received_bytes,
        totalBytes: total,
        fraction: total && total > 0 ? Math.min(1, checkpoint.received_bytes / total) : null,
        error: checkpoint.error_message,
      };
    });
  }

  async syncNow(): Promise<void> {
    if (!this.sync) throw new Error("Sync is not ready");
    if (!this.online) {
      this.emitSync({ ...this.getSyncState(), status: "offline" });
      return;
    }
    await this.sync.sync();
  }

  scheduleSync(): void {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      this.syncTimer = undefined;
      void this.syncNow().catch(() => undefined);
    }, 800);
  }

  async listPlans(): Promise<PlanView[]> {
    if (this.online) await this.syncPlans().catch(() => undefined);
    return this.plansFromCache();
  }

  async plansFromCache(): Promise<PlanView[]> {
    const [plans, progress] = await Promise.all([
      this.db.listReadingPlans(),
      this.studyStore.listPlanProgress(),
    ]);
    return plans.map((plan) => ({
      ...plan,
      completedDays: progress
        .filter((entry) => entry.plan_id === plan.id && !entry.deleted_at)
        .map((entry) => entry.day_number)
        .sort((a, b) => a - b),
    }));
  }

  async syncPlans(): Promise<LocalReadingPlan[]> {
    if (!this.online) return this.db.listReadingPlans();
    const now = new Date().toISOString();
    const remote = await this.api.listPlans();
    const existing = new Map((await this.db.listReadingPlans()).map((plan) => [plan.id, plan]));
    for (const plan of remote) {
      const previous = existing.get(plan.id);
      await this.db.putReadingPlan({
        id: plan.id,
        slug: plan.slug,
        title: plan.title,
        description: plan.description,
        day_count: plan.dayCount,
        schedule: plan.schedule,
        is_published: true,
        created_at: previous?.created_at ?? now,
        updated_at: now,
      });
    }
    return this.db.listReadingPlans();
  }

  async savePlanDay(planId: string, dayNumber: number, complete: boolean): Promise<void> {
    const progress = (await this.studyStore.listPlanProgress()).find(
      (entry) => entry.plan_id === planId && entry.day_number === dayNumber && !entry.deleted_at,
    );
    if (complete) {
      await this.studyStore.savePlanProgress({
        ...(progress ? { id: progress.id } : {}),
        planId,
        dayNumber,
        completedAt: new Date().toISOString(),
      });
    } else if (progress) {
      await this.studyStore.deletePlanProgress(progress.id);
    }
    this.scheduleSync();
  }

  async listBookmarks() {
    return this.studyStore.listBookmarks();
  }

  async listHighlights() {
    return this.studyStore.listHighlights();
  }

  async listNotes() {
    return this.studyStore.listNotes();
  }

  async listFolders() {
    return this.studyStore.listFolders();
  }

  async listConflicts(): Promise<LocalNoteConflict[]> {
    return this.db.listNoteConflicts();
  }

  async deleteConflict(id: string): Promise<void> {
    await this.db.deleteNoteConflict(id);
  }

  async listReadingProgress(): Promise<
    readonly { version: LocalVersion; progress: LocalReadingProgress | undefined }[]
  > {
    return Promise.all(
      (await this.db.listVersions()).map(async (version) => ({
        version,
        progress: await this.studyStore.getReadingProgress(version.version_id),
      })),
    );
  }

  async citation(
    chapter: ChapterView,
    verseNumbers: readonly number[],
    mode: "copy" | "share",
  ): Promise<string> {
    if (!chapter.policy) {
      throw new Error("Copy and share are disabled until this version is downloaded and licensed.");
    }
    const selected = chapter.verses.filter((verse) => verseNumbers.includes(verse.verse));
    const decision = checkCopyAllowed(chapter.policy, selected.length, mode);
    if (!decision.allowed) {
      throw new Error(`This licence allows at most ${decision.maxVerses ?? 0} verses per ${mode}.`);
    }
    return formatCitation({
      book: chapter.book,
      chapter: chapter.chapter,
      abbreviation: chapter.abbreviation,
      policy: chapter.policy,
      verses: selected.map((verse) => ({ verse: verse.verse, text: verse.text })),
    });
  }

  async storageEstimate(): Promise<{ used: number; quota: number | null }> {
    const versions = await this.db.listVersions();
    const contentBytes = versions.reduce((total, version) => total + version.storage_bytes, 0);
    let databaseBytes = 0;
    if (this.driver) {
      const page = await this.driver.get<{ page_count: number; page_size: number }>(
        "SELECT page_count * page_size AS page_count, page_size FROM pragma_page_count(), pragma_page_size()",
      );
      if (page) databaseBytes = Number(page.page_count ?? 0) * Number(page.page_size ?? 0);
    }
    return { used: Math.max(contentBytes, databaseBytes), quota: null };
  }

  private chapterFromLocal(
    version: LocalVersion,
    book: BookCode,
    chapter: number,
    verses: readonly LocalVerse[],
  ): ChapterView {
    return {
      versionId: version.version_id,
      book,
      bookName: version.manifest.books.find((entry) => entry.code === book)?.name ?? book,
      chapter,
      abbreviation: version.abbreviation,
      verses: verses.map((verse) => ({ id: verse.id, verse: verse.verse, text: verse.text })),
      source: "local",
      copyright: version.copyright,
      attribution: version.attribution,
      policy: version.licence,
    };
  }

  private async exchangeTokens(
    tokens: CognitoTokens,
    username: string | null,
    mode: MobileAuthMode = "cognito",
  ): Promise<ApiSession> {
    await this.auth.saveTokens(tokens, mode, username);
    return this.exchangeIdentityToken(tokens.idToken);
  }

  private async exchangeIdentityToken(idToken: string): Promise<ApiSession> {
    try {
      const session = await this.api.createSession(idToken);
      await this.auth.saveCachedSession(session);
      return session;
    } catch (error) {
      await this.auth.clearTokens();
      throw error;
    }
  }

  private emitSync(state: SyncStateView): void {
    for (const listener of this.syncListeners) listener(state);
  }
}

export function cognitoChallenge(error: unknown): CognitoChallenge | null {
  if (!(error instanceof CognitoError)) return null;
  const challenge = (error as CognitoError & { challenge?: CognitoChallenge }).challenge;
  return challenge ?? null;
}

export function describeError(error: unknown): string {
  return errorMessage(error);
}
