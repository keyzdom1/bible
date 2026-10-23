"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ApiVersion } from "@holyword/core";
import { DownloadPausedError, type DownloadProgress, type LocalVersion } from "@holyword/offline";
import { useApp } from "@/components/app-provider";
import { Modal } from "@/components/modal";
import { EmptyState, PageHeader } from "@/components/ui";
import { DownloadIcon, LibraryIcon, TrashIcon } from "@/components/icons";
import { formatBytes } from "@/lib/format";

interface LibraryData {
  readonly installed: LocalVersion[];
  readonly catalog: ApiVersion[];
  readonly progress: DownloadProgress[];
  readonly storage: { used: number; quota: number | null };
}

function downloadLabel(progress: DownloadProgress | undefined): string {
  if (!progress) return "";
  if (progress.status === "paused") return "Paused";
  if (progress.status === "verifying") return "Verifying package…";
  if (progress.status === "complete") return "Installing…";
  if (progress.status === "error") return progress.error ?? "Download failed";
  if (progress.fraction !== null) return `${Math.round(progress.fraction * 100)}%`;
  return formatBytes(progress.receivedBytes);
}

export default function LibraryPage() {
  const { runtime, session, libraryRevision, bumpLibrary, notify } = useApp();
  const [data, setData] = useState<LibraryData | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiVersion | null>(null);

  async function load() {
    if (!runtime) return;
    const [installed, catalog, progress, storage] = await Promise.all([
      runtime.listInstalledVersions(),
      runtime.listCatalog(),
      runtime.listDownloadProgress(),
      runtime.storageEstimate(),
    ]);
    setData({ installed, catalog, progress, storage });
  }

  useEffect(() => {
    void load();
    // Reload when the provider reports a library change.
  }, [runtime, session, libraryRevision]);

  useEffect(() => {
    if (!runtime) return;
    return runtime.onDownload((progress) => {
      setData((current) =>
        current
          ? {
              ...current,
              progress: [
                ...current.progress.filter((entry) => entry.versionId !== progress.versionId),
                progress,
              ],
            }
          : current,
      );
    });
  }, [runtime]);

  async function startDownload(versionId: string) {
    if (!runtime) return;
    setBusy(versionId);
    setError(null);
    try {
      await runtime.downloadVersion(versionId);
      bumpLibrary();
      await load();
      notify("Bible version downloaded and verified. It is ready offline.");
    } catch (errorValue) {
      if (!(errorValue instanceof DownloadPausedError)) {
        setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
      }
    } finally {
      setBusy(null);
    }
  }

  async function pause(versionId: string) {
    if (!runtime) return;
    setError(null);
    await runtime.pauseDownload(versionId).catch((errorValue: unknown) => {
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
    });
  }

  async function remove(version: ApiVersion) {
    if (!runtime) return;
    setBusy(version.versionId);
    setError(null);
    try {
      await runtime.deleteVersion(version.versionId);
      setDeleteTarget(null);
      bumpLibrary();
      await load();
      notify(`${version.name} was removed from this device.`);
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
    } finally {
      setBusy(null);
    }
  }

  if (!data) {
    return <EmptyState title="Opening your library">Checking downloads and storage…</EmptyState>;
  }

  const installedById = new Map(data.installed.map((version) => [version.version_id, version]));
  const progressById = new Map(data.progress.map((entry) => [entry.versionId, entry]));
  const catalogById = new Map(data.catalog.map((version) => [version.versionId, version]));
  const versions = [
    ...data.catalog,
    ...data.installed
      .filter((version) => !catalogById.has(version.version_id))
      .map<ApiVersion>((version) => ({
        versionId: version.version_id,
        versionCode: version.version_code,
        name: version.name,
        abbreviation: version.abbreviation,
        language: version.language,
        languageName: version.language_name,
        direction: version.direction,
        enabled: true,
        licenceStatus: version.licence.status,
        verseCount: version.verse_count,
        downloadBytes: version.package_bytes,
        copyright: version.copyright,
        attribution: version.attribution,
        paraphrase: false,
      })),
  ].sort((a, b) => {
    const installedDelta =
      Number(installedById.has(b.versionId)) - Number(installedById.has(a.versionId));
    return installedDelta || a.name.localeCompare(b.name);
  });

  return (
    <>
      <PageHeader
        eyebrow="Offline library"
        title="Download once. Read anywhere."
        description="Packages are checksum-verified before installation. Once installed, reading and search work without a connection."
        actions={
          <div className="storage-line">
            <LibraryIcon size={18} />
            <span>
              {formatBytes(data.storage.used)} used
              {data.storage.quota ? ` of ${formatBytes(data.storage.quota)} available` : ""}
            </span>
          </div>
        }
      />

      {error ? (
        <p className="form-error" role="alert" style={{ marginBottom: 18 }}>
          {error}
        </p>
      ) : null}

      <div className="grid-2">
        {versions.map((version) => {
          const installed = installedById.get(version.versionId);
          const progress = progressById.get(version.versionId);
          const downloading =
            progress?.status === "downloading" || progress?.status === "verifying";
          const paused = progress?.status === "paused";
          const available = version.enabled && version.licenceStatus !== "unlicensed";
          const canReadOnline = available && version.licenceStatus === "public-domain";
          const isBusy = busy === version.versionId;
          return (
            <article
              className="version-card"
              key={version.versionId}
              data-unavailable={!available}
              aria-labelledby={`version-${version.versionId}`}
            >
              <div className="version-card-head">
                <div>
                  <h2 id={`version-${version.versionId}`}>{version.name}</h2>
                  <p className="subtle" style={{ margin: 0 }}>
                    {version.languageName} · {version.verseCount.toLocaleString()} verses
                  </p>
                </div>
                <span
                  className={`pill${
                    installed ? " pill-success" : available ? " pill-gold" : " pill-danger"
                  }`}
                >
                  {installed
                    ? "Offline"
                    : available
                      ? version.licenceStatus === "public-domain"
                        ? "Public domain"
                        : "Licence required"
                      : "Not available"}
                </span>
              </div>

              <div className="version-meta">
                <span className="pill">{version.abbreviation}</span>
                {version.downloadBytes ? (
                  <span className="pill">{formatBytes(version.downloadBytes)}</span>
                ) : null}
                {installed ? (
                  <span className="pill">
                    {formatBytes(installed.storage_bytes)} on this device
                  </span>
                ) : null}
                {installed ? (
                  <span className="pill">
                    Installed {new Date(installed.installed_at).toLocaleDateString()}
                  </span>
                ) : null}
              </div>

              <div className="licence-block">
                <strong>{version.attribution}</strong>
                {`\n${version.copyright}`}
              </div>

              {progress && !installed ? (
                <div className="download-progress" aria-live="polite">
                  <div className="download-progress-label">
                    <span>{downloadLabel(progress)}</span>
                    <span>
                      {formatBytes(progress.receivedBytes)}
                      {progress.totalBytes ? ` / ${formatBytes(progress.totalBytes)}` : ""}
                    </span>
                  </div>
                  <div className="progress-track" aria-hidden="true">
                    <div
                      className="progress-fill"
                      style={{
                        width:
                          progress.fraction === null
                            ? "35%"
                            : `${Math.max(2, Math.round(progress.fraction * 100))}%`,
                      }}
                    />
                  </div>
                  {progress.status === "error" ? (
                    <p className="subtle" style={{ margin: 0, color: "var(--danger)" }}>
                      {progress.error}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {installed ? (
                <div className="row">
                  <Link
                    className="button"
                    href={`/read?version=${encodeURIComponent(version.versionId)}&book=GEN&chapter=1`}
                  >
                    Read offline
                  </Link>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => setDeleteTarget(version)}
                    disabled={isBusy}
                  >
                    <TrashIcon size={17} /> Remove
                  </button>
                </div>
              ) : downloading ? (
                <div className="row">
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => void pause(version.versionId)}
                  >
                    Pause download
                  </button>
                </div>
              ) : paused ? (
                <div className="row">
                  <button
                    type="button"
                    className="button"
                    onClick={() => void startDownload(version.versionId)}
                    disabled={isBusy}
                  >
                    <DownloadIcon size={17} /> Resume
                  </button>
                </div>
              ) : available ? (
                <div className="row">
                  <button
                    type="button"
                    className="button"
                    onClick={() => void startDownload(version.versionId)}
                    disabled={isBusy}
                  >
                    <DownloadIcon size={17} /> {isBusy ? "Preparing…" : "Download for offline use"}
                  </button>
                  {canReadOnline ? (
                    <Link
                      className="button button-secondary"
                      href={`/read?version=${encodeURIComponent(version.versionId)}&book=GEN&chapter=1`}
                    >
                      Read online
                    </Link>
                  ) : null}
                </div>
              ) : (
                <div>
                  <button type="button" className="button" disabled>
                    {version.licenceStatus === "unlicensed"
                      ? "Not licensed for distribution"
                      : "Not available yet"}
                  </button>
                  <p className="subtle" style={{ margin: "9px 0 0" }}>
                    {version.licenceStatus === "unlicensed"
                      ? "A confirmed publisher licence is required before this translation can be enabled."
                      : "This version is disabled in the HolyWord catalogue."}
                  </p>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {versions.length === 0 ? (
        <EmptyState title="The catalogue is unavailable">
          Connect to the internet and try again. Downloaded versions remain readable offline.
        </EmptyState>
      ) : null}

      <section className="card card-pad" style={{ marginTop: 24 }}>
        <h2>Licence notices</h2>
        <p className="muted">
          HolyWord does not invent or paraphrase Scripture. Only the supplied public-domain KJV
          package is enabled. Other translations remain disabled until licensed files and written
          licence confirmation are in place. Copy and share limits are enforced per version.
        </p>
        <p className="subtle" style={{ marginBottom: 0 }}>
          KJV: King James Version, public domain. Package downloads are verified against the
          manifest SHA-256 before any verse is stored.
        </p>
      </section>

      {deleteTarget ? (
        <Modal
          title={`Remove ${deleteTarget.name}?`}
          onClose={() => setDeleteTarget(null)}
          footer={
            <>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button button-danger"
                onClick={() => void remove(deleteTarget)}
                disabled={busy === deleteTarget.versionId}
              >
                Remove from device
              </button>
            </>
          }
        >
          <p>
            The downloaded text and its local search index will be deleted from this browser.
            Bookmarks, highlights and notes remain in your account and can sync again later.
          </p>
        </Modal>
      ) : null}
    </>
  );
}
