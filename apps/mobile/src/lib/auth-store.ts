import * as SecureStore from "expo-secure-store";
import { CognitoAuthClient, type ApiSession, type CognitoTokens } from "@holyword/core";
import { COGNITO_CONFIG } from "./config";

const AUTH_KEY = "holyword.auth.v1";
const SESSION_KEY = "holyword.session.v1";
const ACCOUNT_KEY = "holyword.account.v1";
const DEVICE_KEY = "holyword.device.v1";

export type MobileAuthMode = "cognito" | "dev" | "hosted";

export interface StoredAuth {
  readonly tokens: CognitoTokens;
  readonly mode: MobileAuthMode;
  readonly username: string | null;
}

export class SessionExpiredError extends Error {
  constructor() {
    super("Your session has expired. Sign in again.");
    this.name = "SessionExpiredError";
  }
}

function isExpiring(tokens: CognitoTokens): boolean {
  const expires = Date.parse(tokens.expiresAt);
  return !Number.isFinite(expires) || expires - Date.now() < 60_000;
}

export class MobileAuthStore {
  private current: StoredAuth | null = null;
  private refreshPromise: Promise<string> | null = null;

  async initialize(): Promise<void> {
    this.current = await this.readAuth();
  }

  async getDeviceId(): Promise<string> {
    const existing = await SecureStore.getItemAsync(DEVICE_KEY);
    if (existing) return existing;
    const id = randomId();
    await SecureStore.setItemAsync(DEVICE_KEY, id);
    return id;
  }

  async saveTokens(
    tokens: CognitoTokens,
    mode: MobileAuthMode,
    username?: string | null,
  ): Promise<void> {
    this.current = { tokens, mode, username: username ?? null };
    await SecureStore.setItemAsync(AUTH_KEY, JSON.stringify(this.current));
  }

  async clearTokens(): Promise<void> {
    this.current = null;
    await SecureStore.deleteItemAsync(AUTH_KEY);
  }

  async getAccessToken(): Promise<string | null> {
    if (!this.current) this.current = await this.readAuth();
    const auth = this.current;
    if (!auth) return null;
    if (!isExpiring(auth.tokens)) return auth.tokens.accessToken;
    if (auth.mode === "dev") return auth.tokens.accessToken;
    if (!auth.tokens.refreshToken || !COGNITO_CONFIG) {
      await this.clearTokens();
      throw new SessionExpiredError();
    }
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = (async () => {
      try {
        const client = new CognitoAuthClient(COGNITO_CONFIG);
        const refreshed = await client.refresh(auth.tokens.refreshToken!);
        await this.saveTokens(refreshed, auth.mode, auth.username);
        return refreshed.accessToken;
      } catch {
        await this.clearTokens();
        throw new SessionExpiredError();
      } finally {
        this.refreshPromise = null;
      }
    })();
    return this.refreshPromise;
  }

  async readCachedSession(): Promise<ApiSession | null> {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    if (!raw) return null;
    try {
      const session = JSON.parse(raw) as ApiSession;
      return typeof session.userId === "string" ? session : null;
    } catch {
      return null;
    }
  }

  async saveCachedSession(session: ApiSession | null): Promise<void> {
    if (session) await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
    else await SecureStore.deleteItemAsync(SESSION_KEY);
  }

  async readAccountId(): Promise<string | null> {
    return SecureStore.getItemAsync(ACCOUNT_KEY);
  }

  async saveAccountId(userId: string | null): Promise<void> {
    if (userId) await SecureStore.setItemAsync(ACCOUNT_KEY, userId);
    else await SecureStore.deleteItemAsync(ACCOUNT_KEY);
  }

  private async readAuth(): Promise<StoredAuth | null> {
    const raw = await SecureStore.getItemAsync(AUTH_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as StoredAuth;
      if (!parsed.tokens?.accessToken || !parsed.tokens?.idToken) return null;
      return parsed;
    } catch {
      return null;
    }
  }
}

function randomId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  if (cryptoApi?.getRandomValues) {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
