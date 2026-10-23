"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/app-provider";
import { Modal } from "@/components/modal";
import { PageHeader } from "@/components/ui";
import { SyncIcon, TrashIcon } from "@/components/icons";
import { formatBytes, formatRelativeTime } from "@/lib/format";

export default function SettingsPage() {
  const {
    runtime,
    session,
    preferences,
    setPreferences,
    syncState,
    online,
    syncNow,
    signOut,
    deleteAccount,
    notify,
  } = useApp();
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function runSync() {
    setSyncing(true);
    setError(null);
    try {
      await syncNow();
      notify("Sync finished.");
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
    } finally {
      setSyncing(false);
    }
  }

  async function exportAccount() {
    if (!runtime) return;
    setExporting(true);
    setError(null);
    try {
      const data = await runtime.exportAccount();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `holyword-account-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      notify("Account export downloaded.");
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
    } finally {
      setExporting(false);
    }
  }

  async function removeAccount() {
    setDeleting(true);
    setError(null);
    try {
      await deleteAccount();
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
      setDeleting(false);
    }
  }

  const theme = preferences?.theme ?? "system";
  const readingTheme = preferences?.reading_theme ?? "light";
  const fontScale = preferences?.font_scale ?? 1;

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Make HolyWord yours"
        description="Reading preferences stay on this device. Account and study data can be synced, exported or deleted."
      />

      {error ? (
        <p className="form-error" role="alert" style={{ marginBottom: 16 }}>
          {error}
        </p>
      ) : null}

      <section className="settings-section" aria-labelledby="appearance-heading">
        <h2 id="appearance-heading">Appearance</h2>
        <div className="settings-row">
          <div>
            <h3>App theme</h3>
            <p>Follow your device or choose a light or dark interface.</p>
          </div>
          <div className="segmented" role="group" aria-label="App theme">
            {(["system", "light", "dark"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={theme === value}
                onClick={() => void setPreferences({ theme: value })}
              >
                {value[0]!.toUpperCase() + value.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-row">
          <div>
            <h3>Reading background</h3>
            <p>The reader can stay light, use warm paper or match a dark room.</p>
          </div>
          <div className="segmented" role="group" aria-label="Reading background">
            {(["light", "sepia", "dark"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={readingTheme === value}
                onClick={() => void setPreferences({ readingTheme: value })}
              >
                {value[0]!.toUpperCase() + value.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-row">
          <div>
            <h3>Reading text size</h3>
            <p>Adjust the Scripture text without changing the rest of the app.</p>
          </div>
          <label className="row" style={{ minWidth: 230 }}>
            <span className="subtle">A</span>
            <input
              type="range"
              min={0.85}
              max={1.6}
              step={0.05}
              value={fontScale}
              aria-label="Reading text size"
              onChange={(event) => void setPreferences({ fontScale: Number(event.target.value) })}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: "1.15rem", fontWeight: 700 }}>A</span>
          </label>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="sync-heading">
        <div className="row-between">
          <h2 id="sync-heading">Sync</h2>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => void runSync()}
            disabled={syncing || !online}
          >
            <SyncIcon size={17} /> {syncing ? "Syncing…" : "Sync now"}
          </button>
        </div>
        <div className="sync-detail" style={{ marginTop: 16 }}>
          <div className="sync-stat">
            <strong>
              {!online ? "Offline" : syncState.status === "error" ? "Error" : "Ready"}
            </strong>
            <span>Connection</span>
          </div>
          <div className="sync-stat">
            <strong>{syncState.pending}</strong>
            <span>Changes waiting</span>
          </div>
          <div className="sync-stat">
            <strong>{formatRelativeTime(syncState.lastSyncedAt)}</strong>
            <span>Last sync</span>
          </div>
        </div>
        {syncState.lastError ? (
          <p className="form-error" style={{ marginTop: 14 }}>
            {syncState.lastError}
          </p>
        ) : null}
        <p className="subtle" style={{ marginBottom: 0, marginTop: 14 }}>
          HolyWord syncs on reconnect, when the app returns to the foreground and every 20 seconds
          while open. A queued change is retried until the server accepts it exactly once.
        </p>
      </section>

      <section className="settings-section" aria-labelledby="account-heading">
        <h2 id="account-heading">Account</h2>
        <div className="settings-row">
          <div>
            <h3>{session?.displayName || "HolyWord reader"}</h3>
            <p>{session?.email}</p>
          </div>
          <button type="button" className="button button-secondary" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
        <div className="settings-row">
          <div>
            <h3>Export your account</h3>
            <p>Download a JSON copy of bookmarks, highlights, notes, folders and progress.</p>
          </div>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => void exportAccount()}
            disabled={exporting || !online}
          >
            {exporting ? "Preparing…" : "Download export"}
          </button>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="storage-heading">
        <h2 id="storage-heading">Device storage</h2>
        <StorageSummary />
      </section>

      <section className="settings-section" aria-labelledby="about-heading">
        <h2 id="about-heading">About HolyWord</h2>
        <p className="muted">
          HolyWord is an offline-first Bible app. Scripture is only served from supplied,
          checksum-verified packages. The King James Version is public domain; other translations
          remain disabled until a written licence and licensed files are available.
        </p>
        <p className="subtle" style={{ marginBottom: 0 }}>
          Never invent, paraphrase or hard-code Bible text. Copy and share actions always include
          the reference and licence attribution.
        </p>
      </section>

      <section
        className="settings-section danger-zone"
        aria-labelledby="danger-heading"
        style={{ marginTop: 16 }}
      >
        <h2 id="danger-heading">Delete account</h2>
        <div className="settings-row">
          <div>
            <h3>Delete your account and synced study data</h3>
            <p>
              This permanently removes your account, bookmarks, highlights, notes, folders and
              progress from HolyWord and clears this device's local database.
            </p>
          </div>
          <button
            type="button"
            className="button button-danger"
            onClick={() => setDeleteOpen(true)}
            disabled={!online}
          >
            <TrashIcon size={17} /> Delete account
          </button>
        </div>
      </section>

      {deleteOpen ? (
        <Modal
          title="Delete your account?"
          onClose={() => {
            setDeleteOpen(false);
            setDeleteConfirm("");
          }}
          footer={
            <>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  setDeleteOpen(false);
                  setDeleteConfirm("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button button-danger"
                disabled={deleteConfirm !== "DELETE" || deleting}
                onClick={() => void removeAccount()}
              >
                {deleting ? "Deleting…" : "Delete permanently"}
              </button>
            </>
          }
        >
          <div className="stack">
            <p>
              Your account deletion request is sent to the server immediately. Synced data is
              removed, and this browser's downloads and study data are cleared.
            </p>
            <div className="field">
              <label htmlFor="delete-confirm">Type DELETE to confirm</label>
              <input
                id="delete-confirm"
                className="input"
                value={deleteConfirm}
                onChange={(event) => setDeleteConfirm(event.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function StorageSummary() {
  const { runtime, libraryRevision } = useApp();
  const [summary, setSummary] = useState<{ used: number; quota: number | null } | null>(null);

  useEffect(() => {
    if (!runtime) return;
    let active = true;
    void runtime.storageEstimate().then((value) => {
      if (active) setSummary(value);
    });
    return () => {
      active = false;
    };
  }, [runtime, libraryRevision]);

  return summary ? (
    <div className="stack">
      <p className="muted" style={{ margin: 0 }}>
        {formatBytes(summary.used)} stored
        {summary.quota ? ` of ${formatBytes(summary.quota)} available to this browser.` : "."}
      </p>
      <div className="progress-track" aria-hidden="true">
        <div
          className="progress-fill"
          style={{
            width: summary.quota
              ? `${Math.min(100, Math.max(1, (summary.used / summary.quota) * 100))}%`
              : "4%",
          }}
        />
      </div>
      <p className="subtle" style={{ margin: 0 }}>
        Includes downloaded Bible text, the local search index and this app's cache. Removing a
        version in the library frees its text immediately.
      </p>
    </div>
  ) : (
    <p className="subtle" role="status">
      Checking storage...
    </p>
  );
}
