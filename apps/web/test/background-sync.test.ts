import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BACKGROUND_SYNC_TAG,
  requestBackgroundSync,
  shouldRequestBackgroundSync,
} from "../src/lib/background-sync";

interface FakeWorker {
  readonly postMessage: ReturnType<typeof vi.fn>;
}

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");

function stubServiceWorker(
  worker: FakeWorker | null,
  getRegistration: () => Promise<unknown> = () =>
    Promise.resolve(worker ? { active: worker } : null),
): void {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { serviceWorker: { getRegistration } },
  });
}

afterEach(() => {
  if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
  else Reflect.deleteProperty(globalThis, "navigator");
  vi.restoreAllMocks();
});

describe("background sync registration", () => {
  it("requests a tag only while operations are pending", () => {
    expect(shouldRequestBackgroundSync(0)).toBe(false);
    expect(shouldRequestBackgroundSync(-1)).toBe(false);
    expect(shouldRequestBackgroundSync(1)).toBe(true);
    expect(shouldRequestBackgroundSync(42)).toBe(true);
    expect(shouldRequestBackgroundSync(Number.NaN)).toBe(false);
    expect(shouldRequestBackgroundSync(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("posts the sync request to the active worker", async () => {
    const worker: FakeWorker = { postMessage: vi.fn() };
    stubServiceWorker(worker);
    await expect(requestBackgroundSync()).resolves.toBe(true);
    expect(worker.postMessage).toHaveBeenCalledWith({
      type: "REQUEST_SYNC",
      tag: BACKGROUND_SYNC_TAG,
    });
  });

  it("is a no-op when no worker is active yet", async () => {
    stubServiceWorker(null);
    await expect(requestBackgroundSync()).resolves.toBe(false);
  });

  it("fails softly when the service worker API is unavailable", async () => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {},
    });
    await expect(requestBackgroundSync()).resolves.toBe(false);
  });

  it("fails softly when registration lookup throws", async () => {
    stubServiceWorker(null, () => Promise.reject(new Error("registration blocked")));
    await expect(requestBackgroundSync()).resolves.toBe(false);
  });
});
