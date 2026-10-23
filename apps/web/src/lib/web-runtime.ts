import {
  ApiClientError,
  CognitoAuthClient,
  HolyWordApiClient,
  checkCopyAllowed,
  formatCitation,
  type ApiSession,
  type ApiVersion,
  type BookCode,
  type CognitoTokens,
  type LicencePolicy,
} from "@holyword/core";
import {
  DownloadManager,
  LocalStudy,
  MiniSearchEngine,
  OfflineLibrary,
  PackageInstaller,
  PersistentHybridClock,
  SyncClient,
  ApiSyncTransport,
  type DownloadProgress,
  type LocalNoteConflict,
  type LocalPreferences,
  type LocalReadingPlan,
  type LocalVersion,
  type LocalVerse,
  type PreferencePayload,
  type SyncStateView,
} from "@holyword/offline";
import { HolyWordDexie } from "@holyword/offline/dexie";
import { COGNITO_CONFIG, API_BASE_URL, DEV_AUTH_ENABLED } from "./config";
import {
  getOrCreateDeviceId,
  readAccountId,
  readCachedSession,
  readCatalogCache,
  writeAccountId,
  writeCachedSession,
  writeCatalogCache,
} from "./browser-storage";

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

export type SyncListener = (state: SyncStateView) => void;
export type DownloadListener = (progress: DownloadProgress) => void;

function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiClientError && (error.status === 401 || error.status === 403);
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

export class WebRuntime {
  readonly api: HolyWordApiClient;
  readonly cognito: CognitoAuthClient | null;
  private database: HolyWordDexie | null = null;
  private localSearch: MiniSearchEngine | null = null;
  private library: OfflineLibrary | null = null;
  private downloads: DownloadManager | null = null;
  private study: LocalStudy | null = null;
  private sync: SyncClient | null = null;
  private clock: PersistentHybridClock | null = null;
  private deviceId = "";
  private syncListeners = new Set<SyncListener>();
  private downloadListeners = new Set<DownloadListener>();

  constructor() {
    this.api = new HolyWordApiClient({
      baseUrl: API_BASE_URL,
      credentials: "include",
    });
    this.cognito = COGNITO_CONFIG ? new CognitoAuthClient(COGNITO_CONFIG) : null;
  }

  get db(): HolyWordDexie {
    if (!this.database) throw new Error("The offline database is not ready");
    return this.database;
  }

  get studyStore(): LocalStudy {
    if (!this.study) throw new Error("The offline study store is not ready");
    return this.study;
  }

  async initialize(): Promise<void> {
    if (this.database) return;
    this.deviceId = getOrCreateDeviceId();
    const database = new HolyWordDexie();
    await database.open();
    this.database = database;
    this.clock = new PersistentHybridClock(database, this.deviceId);
    this.localSearch = new MiniSearchEngine(database);
    this.study = new LocalStudy({ store: database, clock: this.clock });
    this.downloads = new DownloadManager({
      store: database,
      tickets: (versionId) =>
        this.api.getDownloadTicket(versionId, { deviceId: this.deviceId, platform: "web" }),
      onProgress: (progress) => this.downloadListeners.forEach((listener) => listener(progress)),
    });
    const installer = new PackageInstaller({
      store: database,
      search: this.localSearch,
    });
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
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return { ...base, status: "offline" };
    }
    return base;
  }

  async restoreSession(): Promise<ApiSession | null> {
    const cached = readCachedSession();
    try {
      const session = await this.api.getSession();
      writeCachedSession(session);
      return session;
    } catch (error) {
      if (isUnauthorized(error)) {
        writeCachedSession(null);
        return null;
      }
      return cached;
    }
  }

  async signInDev(email: string): Promise<ApiSession> {
    if (!DEV_AUTH_ENABLED) throw new Error("Local development sign-in is disabled");
    const session = await this.api.createSession(`dev:${email.trim().toLowerCase()}`);
    writeCachedSession(session);
    return session;
  }

  async signInCognito(email: string, password: string): Promise<ApiSession> {
    if (!this.cognito) throw new Error("Cognito is not configured for this build");
    const tokens = await this.cognito.signIn(email, password);
    return this.exchangeTokens(tokens);
  }

  async completeNewPassword(
    username: string,
    session: string,
    newPassword: string,
  ): Promise<ApiSession> {
    if (!this.cognito) throw new Error("Cognito is not configured for this build");
    const tokens = await this.cognito.completeNewPassword(username, session, newPassword);
    return this.exchangeTokens(tokens);
  }

  async signInWithTokens(tokens: CognitoTokens): Promise<ApiSession> {
    return this.exchangeTokens(tokens);
  }

  async hostedLoginUrl(identityProvider?: string): Promise<string | null> {
    if (!this.cognito) return null;
    const state = crypto.randomUUID();
    sessionStorage.setItem("holyword.oauth.state", state);
    const url = this.cognito.hostedLoginUrl({ state, identityProvider });
    if (!url) return null;
    return url;
  }

  readHostedTokens(hash: string): CognitoTokens | null {
    return this.cognito?.parseRedirect(hash) ?? null;
  }

  verifyOauthState(state: string | null): boolean {
    const expected = sessionStorage.getItem("holyword.oauth.state");
    sessionStorage.removeItem("holyword.oauth.state");
    return Boolean(expected && state && expected === state);
  }

  async activateSession(session: ApiSession): Promise<boolean> {
    const previous = readAccountId();
    let scopeChanged = false;
    if (previous && previous !== session.userId) {
      await this.db.clearLocalData();
      scopeChanged = true;
    }
    writeAccountId(session.userId);
    writeCachedSession(session);
    await this.syncPlans().catch(() => undefined);
    if (navigator.onLine) void this.syncNow().catch(() => undefined);
    return scopeChanged;
  }

  async signOut(): Promise<void> {
    await this.api.deleteSession().catch(() => undefined);
    writeCachedSession(null);
    this.emitSync({ ...this.getSyncState(), status: "offline" });
  }

  async deleteAccount(): Promise<void> {
    await this.api.deleteAccount();
    await this.db.clearLocalData();
    writeAccountId(null);
    writeCachedSession(null);
  }

  async exportAccount(): Promise<Record<string, unknown>> {
    return this.api.exportAccount();
  }

  async register(email: string, password: string, name?: string) {
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

  async listCatalog(): Promise<ApiVersion[]> {
    try {
      const versions = await this.api.listVersions(true);
      writeCatalogCache(versions);
      return versions;
    } catch {
      return readCatalogCache<ApiVersion[]>() ?? [];
    }
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
      if (verses.length > 0) {
        return this.chapterFromLocal(local, book, chapter, verses);
      }
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
    const selected =
      (versionId ? versions.find((version) => version.version_id === versionId) : undefined) ??
      (versionId ? undefined : versions[0]);
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

  async downloadProgress(versionId: string): Promise<DownloadProgress | null> {
    const checkpoint = await this.db.getDownload(versionId);
    if (!checkpoint) return null;
    const total = checkpoint.total_bytes;
    return {
      versionId,
      status: checkpoint.status,
      receivedBytes: checkpoint.received_bytes,
      totalBytes: total,
      fraction: total && total > 0 ? Math.min(1, checkpoint.received_bytes / total) : null,
      error: checkpoint.error_message,
    };
  }

  async listDownloadProgress(): Promise<DownloadProgress[]> {
    const checkpoints = await this.db.downloads.toArray();
    return checkpoints.map((checkpoint) => {
      const total = checkpoint.total_bytes;
      return {
        versionId: checkpoint.version_id,
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
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      this.emitSync({ ...this.getSyncState(), status: "offline" });
      return;
    }
    await this.sync.sync();
  }

  scheduleSync(): void {
    if (typeof window === "undefined") return;
    window.clearTimeout(this.syncTimer);
    this.syncTimer = window.setTimeout(() => {
      void this.syncNow().catch(() => undefined);
    }, 800);
  }

  private syncTimer: number | undefined;

  async listPlans(): Promise<PlanView[]> {
    await this.syncPlans().catch(() => undefined);
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

  async listReadingProgress() {
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
    if (navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      return { used: estimate.usage ?? 0, quota: estimate.quota ?? null };
    }
    const versions = await this.db.listVersions();
    return {
      used: versions.reduce((total, version) => total + version.storage_bytes, 0),
      quota: null,
    };
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

  private async exchangeTokens(tokens: CognitoTokens): Promise<ApiSession> {
    const session = await this.api.createSession(tokens.idToken);
    writeCachedSession(session);
    return session;
  }

  private emitSync(state: SyncStateView): void {
    for (const listener of this.syncListeners) listener(state);
  }
}
