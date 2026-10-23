"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ApiSession, CognitoTokens } from "@holyword/core";
import type { LocalPreferences, PreferencePayload, SyncStateView } from "@holyword/offline";
import { WebRuntime } from "@/lib/web-runtime";

const EMPTY_SYNC: SyncStateView = {
  status: "offline",
  pending: 0,
  lastSyncedAt: null,
  lastError: null,
};

interface AppContextValue {
  readonly runtime: WebRuntime | null;
  readonly ready: boolean;
  readonly initError: string | null;
  readonly session: ApiSession | null;
  readonly authBusy: boolean;
  readonly preferences: LocalPreferences | null;
  readonly syncState: SyncStateView;
  readonly online: boolean;
  readonly libraryRevision: number;
  readonly studyRevision: number;
  readonly notice: string | null;
  readonly signInDev: (email: string) => Promise<void>;
  readonly signInCognito: (email: string, password: string) => Promise<void>;
  readonly signInWithTokens: (tokens: CognitoTokens) => Promise<void>;
  readonly completeNewPassword: (
    username: string,
    session: string,
    newPassword: string,
  ) => Promise<void>;
  readonly signOut: () => Promise<void>;
  readonly deleteAccount: () => Promise<void>;
  readonly setPreferences: (patch: PreferencePayload) => Promise<void>;
  readonly refreshPreferences: () => Promise<void>;
  readonly syncNow: () => Promise<void>;
  readonly bumpLibrary: () => void;
  readonly bumpStudy: () => void;
  readonly notify: (message: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

let sharedInit: Promise<WebRuntime> | null = null;

function runtimeSingleton(): Promise<WebRuntime> {
  if (!sharedInit) {
    const runtime = new WebRuntime();
    sharedInit = runtime.initialize().then(() => runtime);
  }
  return sharedInit;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [runtime, setRuntime] = useState<WebRuntime | null>(null);
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [session, setSession] = useState<ApiSession | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [preferences, setPreferencesState] = useState<LocalPreferences | null>(null);
  const [syncState, setSyncState] = useState<SyncStateView>(EMPTY_SYNC);
  const [online, setOnline] = useState(true);
  const [libraryRevision, setLibraryRevision] = useState(0);
  const [studyRevision, setStudyRevision] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let active = true;
    runtimeSingleton()
      .then(async (instance) => {
        if (!active) return;
        setRuntime(instance);
        setOnline(navigator.onLine);
        const restored = await instance.restoreSession();
        const prefs = await instance.getPreferences().catch(() => null);
        if (!active) return;
        setPreferencesState(prefs);
        setSession(restored);
        setReady(true);
        if (restored) {
          const changed = await instance.activateSession(restored);
          if (changed) window.location.reload();
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        setInitError(error instanceof Error ? error.message : String(error));
        setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const notify = useCallback((message: string) => {
    setNotice(message);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4000);
  }, []);

  useEffect(() => {
    if (!runtime) return;
    return runtime.onSync(setSyncState);
  }, [runtime]);

  useEffect(() => {
    if (!runtime || !session) return;
    const updateOnline = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void runtime.syncNow().catch(() => undefined);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        setOnline(navigator.onLine);
        if (navigator.onLine) void runtime.syncNow().catch(() => undefined);
      }
    };
    const onServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === "holyword-sync" && navigator.onLine) {
        void runtime.syncNow().catch(() => undefined);
      }
    };
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    document.addEventListener("visibilitychange", onVisible);
    navigator.serviceWorker?.addEventListener("message", onServiceWorkerMessage);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void runtime.syncNow().catch(() => undefined);
      }
    }, 20_000);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
      document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker?.removeEventListener("message", onServiceWorkerMessage);
      window.clearInterval(interval);
    };
  }, [runtime, session]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      if (!preferences) return;
      const resolved =
        preferences.theme === "system" ? (media.matches ? "dark" : "light") : preferences.theme;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.dataset.readingTheme = preferences.reading_theme;
      document.documentElement.style.setProperty(
        "--reader-font-scale",
        String(preferences.font_scale),
      );
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preferences]);

  const applySession = useCallback(
    async (next: ApiSession) => {
      if (!runtime) throw new Error("The app is still starting");
      const changed = await runtime.activateSession(next);
      if (changed) {
        window.location.reload();
        return;
      }
      setSession(next);
      setPreferencesState(await runtime.getPreferences());
    },
    [runtime],
  );

  const signInDev = useCallback(
    async (email: string) => {
      if (!runtime) throw new Error("The app is still starting");
      setAuthBusy(true);
      try {
        await applySession(await runtime.signInDev(email));
      } finally {
        setAuthBusy(false);
      }
    },
    [applySession, runtime],
  );

  const signInCognito = useCallback(
    async (email: string, password: string) => {
      if (!runtime) throw new Error("The app is still starting");
      setAuthBusy(true);
      try {
        await applySession(await runtime.signInCognito(email, password));
      } finally {
        setAuthBusy(false);
      }
    },
    [applySession, runtime],
  );

  const signInWithTokens = useCallback(
    async (tokens: CognitoTokens) => {
      if (!runtime) throw new Error("The app is still starting");
      setAuthBusy(true);
      try {
        await applySession(await runtime.signInWithTokens(tokens));
      } finally {
        setAuthBusy(false);
      }
    },
    [applySession, runtime],
  );

  const completeNewPassword = useCallback(
    async (username: string, cognitoSession: string, newPassword: string) => {
      if (!runtime) throw new Error("The app is still starting");
      setAuthBusy(true);
      try {
        await applySession(
          await runtime.completeNewPassword(username, cognitoSession, newPassword),
        );
      } finally {
        setAuthBusy(false);
      }
    },
    [applySession, runtime],
  );

  const signOut = useCallback(async () => {
    if (!runtime) return;
    await runtime.signOut();
    setSession(null);
  }, [runtime]);

  const deleteAccount = useCallback(async () => {
    if (!runtime) return;
    await runtime.deleteAccount();
    setSession(null);
    setPreferencesState(null);
    window.location.assign("/login");
  }, [runtime]);

  const setPreferences = useCallback(
    async (patch: PreferencePayload) => {
      if (!runtime) return;
      const next = await runtime.savePreferences(patch);
      setPreferencesState(next);
    },
    [runtime],
  );

  const refreshPreferences = useCallback(async () => {
    if (!runtime) return;
    setPreferencesState(await runtime.getPreferences());
  }, [runtime]);

  const syncNow = useCallback(async () => {
    if (!runtime) return;
    await runtime.syncNow();
  }, [runtime]);

  const bumpLibrary = useCallback(() => setLibraryRevision((value) => value + 1), []);
  const bumpStudy = useCallback(() => setStudyRevision((value) => value + 1), []);

  const value = useMemo<AppContextValue>(
    () => ({
      runtime,
      ready,
      initError,
      session,
      authBusy,
      preferences,
      syncState,
      online,
      libraryRevision,
      studyRevision,
      notice,
      signInDev,
      signInCognito,
      signInWithTokens,
      completeNewPassword,
      signOut,
      deleteAccount,
      setPreferences,
      refreshPreferences,
      syncNow,
      bumpLibrary,
      bumpStudy,
      notify,
    }),
    [
      runtime,
      ready,
      initError,
      session,
      authBusy,
      preferences,
      syncState,
      online,
      libraryRevision,
      studyRevision,
      notice,
      signInDev,
      signInCognito,
      signInWithTokens,
      completeNewPassword,
      signOut,
      deleteAccount,
      setPreferences,
      refreshPreferences,
      syncNow,
      bumpLibrary,
      bumpStudy,
      notify,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used inside AppProvider");
  return value;
}
