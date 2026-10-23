"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ApiVersion } from "@holyword/core";
import type { LocalBookmark, LocalVersion } from "@holyword/offline";
import { useApp } from "@/components/app-provider";
import { EmptyState, PageHeader, Spinner } from "@/components/ui";
import { BookIcon, BookmarkIcon, DownloadIcon, PlanIcon } from "@/components/icons";
import type { PlanView } from "@/lib/web-runtime";
import { formatRelativeTime, referenceLabel } from "@/lib/format";

interface HomeData {
  readonly installed: LocalVersion[];
  readonly catalog: ApiVersion[];
  readonly bookmarks: LocalBookmark[];
  readonly plans: PlanView[];
}

export default function HomePage() {
  const { runtime, session, preferences, libraryRevision, studyRevision, syncState, online } =
    useApp();
  const [data, setData] = useState<HomeData | null>(null);

  useEffect(() => {
    if (!runtime || !session) return;
    let active = true;
    void (async () => {
      const [installed, catalog, bookmarks, plans] = await Promise.all([
        runtime.listInstalledVersions(),
        runtime.listCatalog(),
        runtime.listBookmarks(),
        runtime.plansFromCache(),
      ]);
      if (!active) return;
      setData({
        installed,
        catalog,
        bookmarks: bookmarks.slice(0, 4),
        plans,
      });
    })();
    return () => {
      active = false;
    };
  }, [runtime, session, libraryRevision, studyRevision]);

  if (!data) return <Spinner label="Preparing your library" />;

  const location = preferences?.last_location;
  const activeVersion =
    data.installed.find((version) => version.version_id === preferences?.active_version_id) ??
    data.installed[0];
  const continueHref = location
    ? `/read?version=${location.versionId}&book=${location.book}&chapter=${location.chapter}${location.verse ? `&verse=${location.verse}` : ""}`
    : activeVersion
      ? `/read?version=${activeVersion.version_id}&book=GEN&chapter=1`
      : "/library";
  const nextPlan = data.plans.find((plan) => {
    const nextDay = plan.schedule.find((day) => !plan.completedDays.includes(day.day));
    return Boolean(nextDay);
  });
  const nextDay = nextPlan?.schedule.find((day) => !nextPlan.completedDays.includes(day.day));
  const licenseReady = data.catalog.find((version) => version.versionId === "kjv");

  return (
    <>
      <PageHeader
        eyebrow={session ? `Signed in as ${session.email}` : "Welcome"}
        title="Your quiet place in the Word"
        description="Read offline, search every downloaded verse and keep your study notes in step across devices."
      />

      <section className="hero-card">
        <p className="eyebrow">{location ? "Continue where you left off" : "Begin reading"}</p>
        <h1>
          {location
            ? `${referenceLabel(location.book, location.chapter, location.verse)}`
            : activeVersion
              ? "Open the Scriptures"
              : "Download the King James Version"}
        </h1>
        <p>
          {location
            ? `Pick up in ${activeVersion?.name ?? location.versionId.toUpperCase()}. Your last position is saved on this device and synced to your account.`
            : activeVersion
              ? `${activeVersion.verse_count.toLocaleString()} verses are installed and ready offline.`
              : "The complete KJV is public domain, checksum-verified and available to download for offline reading."}
        </p>
        <div className="row">
          <Link className="button" href={continueHref}>
            <BookIcon size={18} /> {location ? "Continue reading" : "Start reading"}
          </Link>
          <Link className="button button-secondary" href="/search">
            Search Scripture
          </Link>
        </div>
      </section>

      <div className="home-grid">
        <div className="stack">
          <section className="card card-pad">
            <div className="section-title">
              <h2>Reading plans</h2>
              <Link href="/study?tab=plans">All plans</Link>
            </div>
            {nextPlan && nextDay ? (
              <div className="stack">
                <div className="row-between">
                  <div>
                    <h3 style={{ marginBottom: 4 }}>{nextPlan.title}</h3>
                    <p className="muted" style={{ margin: 0 }}>
                      Day {nextDay.day} of {nextPlan.day_count} · {nextDay.title}
                    </p>
                  </div>
                  <PlanIcon size={26} />
                </div>
                <div className="plan-references">
                  {nextDay.references.map((reference) => (
                    <Link
                      key={reference}
                      className="plan-reference"
                      href={`/search?q=${encodeURIComponent(reference)}`}
                    >
                      {reference}
                    </Link>
                  ))}
                </div>
                <div className="progress-track" aria-hidden="true">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${Math.round((nextPlan.completedDays.length / nextPlan.day_count) * 100)}%`,
                    }}
                  />
                </div>
                <p className="subtle" style={{ margin: 0 }}>
                  {nextPlan.completedDays.length} of {nextPlan.day_count} days complete
                </p>
              </div>
            ) : (
              <EmptyState
                title="No plan in progress"
                action={
                  <Link className="button button-secondary" href="/study?tab=plans">
                    Browse reading plans
                  </Link>
                }
              >
                Reading plans are cached on this device so you can keep going offline.
              </EmptyState>
            )}
          </section>

          <section className="card card-pad">
            <div className="section-title">
              <h2>Recent bookmarks</h2>
              <Link href="/study?tab=bookmarks">All bookmarks</Link>
            </div>
            {data.bookmarks.length > 0 ? (
              <div className="list">
                {data.bookmarks.map((bookmark) => (
                  <div className="list-row" key={bookmark.id}>
                    <div className="list-row-main">
                      <strong>{bookmark.label ?? "Bookmark"}</strong>
                      <p>{bookmark.verse_id.replaceAll(".", " ")}</p>
                    </div>
                    <Link
                      className="button button-ghost button-small"
                      href={`/read?verseId=${bookmark.verse_id}&version=${bookmark.version_id}`}
                    >
                      Open
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No bookmarks yet"
                action={
                  <Link className="button button-secondary" href={continueHref}>
                    Open the reader
                  </Link>
                }
              >
                Tap a verse while reading to bookmark it, highlight it or write a note.
              </EmptyState>
            )}
          </section>
        </div>

        <div className="stack">
          <section className="card card-pad">
            <div className="section-title">
              <h2>Offline library</h2>
              <Link href="/library">Manage</Link>
            </div>
            {data.installed.length > 0 ? (
              <div className="list">
                {data.installed.map((version) => (
                  <div className="list-row" key={version.version_id}>
                    <div className="list-row-main">
                      <strong>{version.name}</strong>
                      <p>
                        {version.abbreviation} · {version.verse_count.toLocaleString()} verses
                      </p>
                    </div>
                    <span className="pill pill-success">Offline</span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Nothing downloaded"
                action={
                  <Link className="button" href="/library">
                    <DownloadIcon size={17} /> Download KJV
                  </Link>
                }
              >
                {licenseReady
                  ? "The KJV is public domain and ready to download."
                  : "Sign in and connect to load the version catalogue."}
              </EmptyState>
            )}
            {data.installed[0] ? (
              <p className="subtle" style={{ marginTop: 12 }}>
                Installed {formatRelativeTime(data.installed[0].installed_at)} · search is local
              </p>
            ) : null}
          </section>

          <section className="card card-pad">
            <div className="section-title">
              <h2>Sync</h2>
              <Link href="/settings">Settings</Link>
            </div>
            <div className="stack">
              <div className="row-between">
                <span className="muted">Status</span>
                <strong>
                  {!online
                    ? "Offline"
                    : syncState.status === "error"
                      ? "Needs attention"
                      : syncState.status === "syncing"
                        ? "Syncing"
                        : "Up to date"}
                </strong>
              </div>
              <div className="row-between">
                <span className="muted">Waiting to upload</span>
                <strong>{syncState.pending}</strong>
              </div>
              <div className="row-between">
                <span className="muted">Last synced</span>
                <strong>{formatRelativeTime(syncState.lastSyncedAt)}</strong>
              </div>
              {syncState.lastError ? <p className="form-error">{syncState.lastError}</p> : null}
            </div>
          </section>

          <section className="card card-pad">
            <div className="section-title">
              <h3>
                <BookmarkIcon size={18} /> Study offline
              </h3>
            </div>
            <p className="muted" style={{ marginBottom: 0 }}>
              Bookmarks, five highlight colours, folders and notes are stored in your browser and
              queued for sync. Nothing depends on a connection.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
