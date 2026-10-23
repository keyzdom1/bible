import type { ApiSession } from "@holyword/core";

const DEVICE_KEY = "holyword.deviceId";
const SESSION_KEY = "holyword.session";
const ACCOUNT_KEY = "holyword.accountId";
const CATALOG_KEY = "holyword.catalog";

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function getOrCreateDeviceId(): string {
  const current = storage()?.getItem(DEVICE_KEY);
  if (current) return current;
  const id = crypto.randomUUID();
  storage()?.setItem(DEVICE_KEY, id);
  return id;
}

export function readCachedSession(): ApiSession | null {
  const raw = storage()?.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as ApiSession;
    return typeof value.userId === "string" && typeof value.email === "string" ? value : null;
  } catch {
    return null;
  }
}

export function writeCachedSession(session: ApiSession | null): void {
  if (session) storage()?.setItem(SESSION_KEY, JSON.stringify(session));
  else storage()?.removeItem(SESSION_KEY);
}

export function readAccountId(): string | null {
  return storage()?.getItem(ACCOUNT_KEY) ?? null;
}

export function writeAccountId(userId: string | null): void {
  if (userId) storage()?.setItem(ACCOUNT_KEY, userId);
  else storage()?.removeItem(ACCOUNT_KEY);
}

export function readCatalogCache<T>(): T | null {
  const raw = storage()?.getItem(CATALOG_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeCatalogCache(value: unknown): void {
  try {
    storage()?.setItem(CATALOG_KEY, JSON.stringify(value));
  } catch {
    // A full browser storage area should not make the library unusable.
  }
}
