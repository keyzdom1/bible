/**
 * Background Sync registration for the HolyWord service worker.
 *
 * The service worker (`public/sw.js`) listens for the `sync` and `periodicsync`
 * events with the `holyword-sync` tag and notifies every open window to drain its
 * sync queue. That tag is only ever registered from here: whenever local study data
 * is waiting to be pushed, the active worker is asked to register it. If connectivity
 * is lost before the queue drains, the browser replays the tag on reconnect and the
 * worker wakes the app even when timers are throttled in a background tab.
 */

export const BACKGROUND_SYNC_TAG = "holyword-sync";

/** A tag is worth registering only while operations are waiting to be pushed. */
export function shouldRequestBackgroundSync(pending: number): boolean {
  return Number.isFinite(pending) && pending > 0;
}

/**
 * Asks the active service worker to register the background sync tag.
 * Returns `true` when the message reached a worker. Registration is best-effort:
 * unsupported browsers and unregistered workers simply fall back to the app's own
 * sync triggers (online event, visibility change and the polling interval).
 */
export async function requestBackgroundSync(): Promise<boolean> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const worker = registration?.active;
    if (!worker) return false;
    worker.postMessage({ type: "REQUEST_SYNC", tag: BACKGROUND_SYNC_TAG });
    return true;
  } catch {
    return false;
  }
}
