"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { tryParseReference, type ApiVersion, type BookCode, type Reference } from "@holyword/core";
import type { LocalVersion } from "@holyword/offline";
import { useApp } from "@/components/app-provider";
import { EmptyState, PageHeader, Spinner } from "@/components/ui";
import { BookIcon, SearchIcon } from "@/components/icons";
import type { SearchOutcome } from "@/lib/web-runtime";
import { bookName } from "@/lib/format";
import { highlightSegments } from "@/lib/highlight";

interface VersionOption {
  readonly versionId: string;
  readonly name: string;
  readonly abbreviation: string;
  readonly installed: boolean;
}

export default function SearchRoute() {
  return (
    <Suspense fallback={<Spinner label="Preparing search" />}>
      <SearchPage />
    </Suspense>
  );
}

function SearchPage() {
  const { runtime, preferences, libraryRevision, session } = useApp();
  const searchParams = useSearchParams();
  const queryParam = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(queryParam);
  const [selectedVersion, setSelectedVersion] = useState("");
  const [versions, setVersions] = useState<VersionOption[]>([]);
  const [outcome, setOutcome] = useState<SearchOutcome | null>(null);
  const [searchedQuery, setSearchedQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const autoRan = useRef(false);

  useEffect(() => {
    if (!runtime || !session) return;
    let active = true;
    void (async () => {
      const [installed, catalog] = await Promise.all([
        runtime.listInstalledVersions(),
        runtime.listCatalog(),
      ]);
      const map = new Map<string, VersionOption>();
      for (const version of catalog as ApiVersion[]) {
        if (!version.enabled || version.licenceStatus === "unlicensed") continue;
        map.set(version.versionId, {
          versionId: version.versionId,
          name: version.name,
          abbreviation: version.abbreviation,
          installed: false,
        });
      }
      for (const version of installed as LocalVersion[]) {
        map.set(version.version_id, {
          versionId: version.version_id,
          name: version.name,
          abbreviation: version.abbreviation,
          installed: true,
        });
      }
      const options = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
      if (!active) return;
      setVersions(options);
      setSelectedVersion((current) => {
        if (current) return current;
        const fromPrefs = options.find(
          (version) => version.versionId === preferences?.active_version_id,
        );
        return (
          fromPrefs?.versionId ??
          options.find((version) => version.installed)?.versionId ??
          options[0]?.versionId ??
          ""
        );
      });
    })();
    return () => {
      active = false;
    };
  }, [runtime, session, libraryRevision, preferences?.active_version_id]);

  useEffect(() => {
    if (autoRan.current || !runtime || !queryParam || versions.length === 0) return;
    autoRan.current = true;
    setQuery(queryParam);
    void runSearch(queryParam);
    // Run once for the deep-linked query.
  }, [runtime, queryParam, versions.length]);

  async function runSearch(value: string) {
    if (!runtime) return;
    const trimmed = value.trim();
    if (!trimmed) {
      setOutcome(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    setSearchedQuery(trimmed);
    const started = performance.now();
    try {
      const result = await runtime.search(trimmed, selectedVersion || undefined);
      setOutcome(result);
      setElapsed(performance.now() - started);
    } catch (errorValue) {
      setOutcome(null);
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    autoRan.current = true;
    void runSearch(query);
  }

  const reference = useMemo(() => {
    if (!searchedQuery) return null;
    return tryParseReference(searchedQuery);
  }, [searchedQuery]);
  const referenceTarget = useMemo(() => referenceAnchor(reference), [reference]);
  const versionById = useMemo(
    () => new Map(versions.map((version) => [version.versionId, version])),
    [versions],
  );

  return (
    <>
      <PageHeader
        eyebrow="Search Scripture"
        title="Find a word, phrase or reference"
        description="Searches downloaded versions on this device first. Exact phrases can be wrapped in quotes; references like John 3:16 jump straight to the passage."
      />

      <form className="search-box" onSubmit={onSubmit} role="search">
        <div className="field" style={{ flex: 1 }}>
          <label
            htmlFor="search-query"
            className="label"
            style={{ position: "absolute", left: -9999 }}
          >
            Search the Bible
          </label>
          <input
            id="search-query"
            className="input"
            type="search"
            placeholder='Try "faith", a quoted phrase or Romans 8:28'
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoFocus
          />
        </div>
        <div className="field">
          <label
            htmlFor="search-version"
            className="label"
            style={{ position: "absolute", left: -9999 }}
          >
            Bible version
          </label>
          <select
            id="search-version"
            className="select"
            value={selectedVersion}
            onChange={(event) => setSelectedVersion(event.target.value)}
          >
            {versions.length === 0 ? <option value="">No versions available</option> : null}
            {versions.map((version) => (
              <option key={version.versionId} value={version.versionId}>
                {version.abbreviation}
                {version.installed ? " · offline" : ""}
              </option>
            ))}
          </select>
        </div>
        <button className="button" type="submit" disabled={loading || !query.trim()}>
          <SearchIcon size={18} /> {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {error ? (
        <p className="form-error" role="alert" style={{ marginTop: 18 }}>
          Search could not finish. {error}
        </p>
      ) : null}

      {reference && referenceTarget ? (
        <div className="card card-pad" style={{ marginTop: 18 }}>
          <div className="row-between">
            <div>
              <p className="eyebrow" style={{ marginBottom: 3 }}>
                Reference found
              </p>
              <strong>
                {bookName(referenceTarget.book)} {referenceTarget.chapter}
                {referenceTarget.verse ? `:${referenceTarget.verse}` : ""}
              </strong>
            </div>
            <Link
              className="button"
              href={`/read?version=${encodeURIComponent(selectedVersion)}&book=${referenceTarget.book}&chapter=${referenceTarget.chapter}${referenceTarget.verse ? `&verse=${referenceTarget.verse}` : ""}`}
            >
              <BookIcon size={17} /> Open passage
            </Link>
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 22 }}>
        {loading ? <Spinner label="Searching" /> : null}

        {!loading && outcome ? (
          <>
            <div className="row-between" style={{ marginBottom: 12 }}>
              <p className="subtle" style={{ margin: 0 }} role="status">
                {outcome.results.length} result{outcome.results.length === 1 ? "" : "s"} for “
                {searchedQuery}”
                {elapsed !== null && outcome.engine === "local"
                  ? ` · local search ${Math.round(elapsed)} ms`
                  : ""}
              </p>
              <span
                className={`pill${outcome.engine === "local" ? " pill-success" : " pill-gold"}`}
              >
                {outcome.engine === "local" ? "Offline index" : "Online search"}
              </span>
            </div>
            {outcome.results.length > 0 ? (
              <div className="result-list">
                {outcome.results.map((result) => {
                  const version = versionById.get(result.versionId);
                  return (
                    <Link
                      key={`${result.versionId}-${result.verseId}`}
                      className="result-card"
                      href={`/read?version=${encodeURIComponent(result.versionId)}&verseId=${result.verseId}&q=${encodeURIComponent(searchedQuery)}`}
                    >
                      <span className="result-reference">
                        <span>
                          {bookName(result.book as BookCode)} {result.chapter}:{result.verse}
                        </span>
                        <span>{version?.abbreviation ?? result.versionId.toUpperCase()}</span>
                      </span>
                      <p className="result-text">
                        {highlightSegments(result.text, searchedQuery).map((segment, index) =>
                          segment.match ? (
                            <mark key={index}>{segment.text}</mark>
                          ) : (
                            <span key={index}>{segment.text}</span>
                          ),
                        )}
                      </p>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                title="No verses matched"
                action={
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => {
                      setQuery("");
                      setOutcome(null);
                    }}
                  >
                    Clear search
                  </button>
                }
              >
                Try fewer words, check the spelling, or use a reference such as “Psalm 23”.
              </EmptyState>
            )}
          </>
        ) : null}

        {!loading && !outcome && !error ? (
          <EmptyState title="Search every downloaded verse">
            Local search works with no connection. Downloaded KJV text is indexed on this device and
            stays available offline.
          </EmptyState>
        ) : null}
      </div>
    </>
  );
}

function referenceAnchor(
  reference: Reference | null | undefined,
): { book: BookCode; chapter: number; verse?: number } | null {
  if (!reference) return null;
  switch (reference.type) {
    case "book":
      return { book: reference.book, chapter: 1 };
    case "chapter":
      return { book: reference.book, chapter: reference.chapter };
    case "chapter-range":
      return { book: reference.book, chapter: reference.startChapter };
    case "verse":
      return { book: reference.book, chapter: reference.chapter, verse: reference.verse };
    case "verse-range":
      return {
        book: reference.book,
        chapter: reference.start.chapter,
        verse: reference.start.verse,
      };
  }
}
