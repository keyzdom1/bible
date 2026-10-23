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
import { AppState, Text, View, useColorScheme } from "react-native";
import * as Network from "expo-network";
import * as WebBrowser from "expo-web-browser";
import type { ApiSession, CognitoTokens } from "@holyword/core";
import type { LocalPreferences, PreferencePayload, SyncStateView } from "@holyword/offline";
import { MobileRuntime } from "@/lib/mobile-runtime";
import { registerBackgroundSync } from "@/lib/background-sync";
import { APP_URL } from "@/lib/config";
import {
  fontScaleOf,
  paletteFor,
  readingPalette,
  resolveTheme,
  type Palette,
  type ReadingPalette,
  type ResolvedTheme,
} from "@/theme";

const EMPTY_SYNC: SyncStateView = {
  status: "offline",
  pending: 0,
  lastSyncedAt: null,
  lastError: null,
};

export interface AppContextValue {
  readonly runtime: MobileRuntime | null;
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
  readonly theme: ResolvedTheme;
  readonly colors: Palette;
  readonly readingColors: ReadingPalette;
  readonly fontScale: number;
  readonly signInDev: (email: string) => Promise<void>;
  readonly signInCognito: (email: string, password: string) => Promise<void>;
  readonly completeNewPassword: (
    username: string,
    session: string,
    newPassword: string,
  ) => Promise<void>;
  readonly signInWithTokens: (tokens: CognitoTokens) => Promise<void>;
  readonly hostedSignIn: (identityProvider?: string) => Promise<void>;
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

function onlineFromState(state: Network.NetworkState): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function AppProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [runtime, setRuntime] = useState<MobileRuntime | null>(null);
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
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sessionRef = useRef<ApiSession | null>(null);
  sessionRef.current = session;

  useEffect(() => {
    let active = true;
    const instance = new MobileRuntime();
    (async () => {
      try {
        await instance.initialize();
        const network = await Network.getNetworkStateAsync().catch(() => null);
        const initiallyOnline = network ? onlineFromState(network) : true;
        instance.setOnline(initiallyOnline);
        const preferred = await instance.getPreferences();
        const restored = await Promise.race([
          instance.restoreSession(),
          delay(10_000).then(() => instance.auth.readCachedSession()),
        ]);
        if (!active) return;
        setRuntime(instance);
        setOnline(initiallyOnline);
        setPreferencesState(preferred);
        if (restored) {
          const changed = await instance.activateSession(restored);
          if (changed) {
            setPreferencesState(await instance.getPreferences());
            setLibraryRevision((value) => value + 1);
            setStudyRevision((value) => value + 1);
          }
        }
        setSession(restored);
        setReady(true);
        void registerBackgroundSync();
      } catch (error) {
        if (!active) return;
        setInitError(error instanceof Error ? error.message : String(error));
        setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const notify = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 4200);
  }, []);

  useEffect(() => {
    return () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!runtime) return;
    return runtime.onSync(setSyncState);
  }, [runtime]);

  useEffect(() => {
    if (!runtime) return;
    let active = true;
    const checkNetwork = async () => {
      const state = await Network.getNetworkStateAsync().catch(() => null);
      if (!active || !state) return;
      const next = onlineFromState(state);
      setOnline(next);
      runtime.setOnline(next);
      if (next && sessionRef.current) void runtime.syncNow().catch(() => undefined);
    };
    void checkNetwork();
    const interval = setInterval(() => void checkNetwork(), 15_000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void checkNetwork();
        if (runtime.isOnline() && sessionRef.current) {
          void runtime.syncNow().catch(() => undefined);
        }
      }
    });
    return () => {
      active = false;
      clearInterval(interval);
      subscription.remove();
    };
  }, [runtime]);

  useEffect(() => {
    if (!runtime || !session) return;
    const interval = setInterval(() => {
      if (AppState.currentState === "active" && runtime.isOnline()) {
        void runtime.syncNow().catch(() => undefined);
      }
    }, 20_000);
    return () => clearInterval(interval);
  }, [runtime, session]);

  const applySession = useCallback(
    async (next: ApiSession) => {
      if (!runtime) throw new Error("The app is still starting");
      const changed = await runtime.activateSession(next);
      if (changed) {
        setPreferencesState(await runtime.getPreferences());
        setLibraryRevision((value) => value + 1);
        setStudyRevision((value) => value + 1);
      }
      setSession(next);
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
        const next = await runtime.signInCognito(email, password);
        await applySession(next);
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

  const hostedSignIn = useCallback(
    async (identityProvider?: string) => {
      if (!runtime) throw new Error("The app is still starting");
      const url = runtime.beginHostedLogin(identityProvider);
      if (!url) throw new Error("Hosted sign-in is not configured for this build");
      setAuthBusy(true);
      try {
        const result = await WebBrowser.openAuthSessionAsync(url, APP_URL);
        if (result.type !== "success") return;
        await applySession(await runtime.completeHostedLogin(result.url));
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
    notify("Signed out. Downloaded Scripture remains on this device.");
  }, [notify, runtime]);

  const deleteAccount = useCallback(async () => {
    if (!runtime) return;
    await runtime.deleteAccount();
    setSession(null);
    setPreferencesState(null);
    setLibraryRevision((value) => value + 1);
    setStudyRevision((value) => value + 1);
  }, [runtime]);

  const setPreferences = useCallback(
    async (patch: PreferencePayload) => {
      if (!runtime) return;
      const next = await runtime.savePreferences(patch);
      setPreferencesState(next);
      runtime.scheduleSync();
    },
    [runtime],
  );

  const syncNow = useCallback(async () => {
    if (!runtime) return;
    await runtime.syncNow();
  }, [runtime]);

  const refreshPreferences = useCallback(async () => {
    if (!runtime) return;
    setPreferencesState(await runtime.getPreferences());
  }, [runtime]);

  const bumpLibrary = useCallback(() => setLibraryRevision((value) => value + 1), []);
  const bumpStudy = useCallback(() => setStudyRevision((value) => value + 1), []);

  const theme = resolveTheme(preferences?.theme, systemScheme);
  const colors = useMemo(() => paletteFor(theme), [theme]);
  const readingColors = useMemo(
    () => readingPalette(preferences?.reading_theme),
    [preferences?.reading_theme],
  );
  const fontScale = fontScaleOf(preferences);

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
      theme,
      colors,
      readingColors,
      fontScale,
      signInDev,
      signInCognito,
      completeNewPassword,
      signInWithTokens,
      hostedSignIn,
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
      theme,
      colors,
      readingColors,
      fontScale,
      signInDev,
      signInCognito,
      completeNewPassword,
      signInWithTokens,
      hostedSignIn,
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

  return (
    <AppContext.Provider value={value}>
      {children}
      {notice ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 20,
            right: 20,
            top: 56,
            backgroundColor: theme === "dark" ? "#F7FAFF" : "#081B3A",
            borderRadius: 14,
            paddingHorizontal: 16,
            paddingVertical: 12,
            zIndex: 1000,
            elevation: 8,
          }}
        >
          <Text
            accessibilityLiveRegion="polite"
            style={{
              color: theme === "dark" ? "#081B3A" : "#FFFFFF",
              textAlign: "center",
              fontWeight: "600",
            }}
          >
            {notice}
          </Text>
        </View>
      ) : null}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used inside AppProvider");
  return context;
}
