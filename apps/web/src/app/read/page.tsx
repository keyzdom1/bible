"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { BOOKS, CHAPTER_COUNTS, getBook, tryParseVerseId, type BookCode } from "@holyword/core";
import type {
  HighlightColor,
  LocalBookmark,
  LocalFolder,
  LocalHighlight,
  LocalNote,
} from "@holyword/offline";
import { useApp } from "@/components/app-provider";
import { Modal } from "@/components/modal";
import { EmptyState, Spinner } from "@/components/ui";
import {
  BookmarkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  CopyIcon,
  NoteIcon,
  ShareIcon,
  SunIcon,
  TrashIcon,
} from "@/components/icons";
import type { ChapterView } from "@/lib/web-runtime";
import { adjacentChapter, bookName, parsePositiveInt, referenceLabel } from "@/lib/format";
import { highlightSegments } from "@/lib/highlight";

const COLORS: readonly { color: HighlightColor; label: string }[] = [
  { color: "gold", label: "Gold" },
  { color: "cyan", label: "Cyan" },
  { color: "emerald", label: "Emerald" },
  { color: "royal-red", label: "Royal red" },
  { color: "purple", label: "Purple" },
];

interface ReaderVersion {
  readonly versionId: string;
  readonly name: string;
  readonly abbreviation: string;
  readonly installed: boolean;
  readonly enabled: boolean;
  readonly licenceStatus: "public-domain" | "licensed" | "unlicensed";
}

interface AnnotationState {
  readonly bookmarks: LocalBookmark[];
  readonly highlights: LocalHighlight[];
  readonly notes: LocalNote[];
  readonly folders: LocalFolder[];
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  document.execCommand("copy");
  area.remove();
}

export default function ReaderRoute() {
  return (
    <Suspense fallback={<Spinner label="Opening the reader" />}>
      <ReaderPage />
    </Suspense>
  );
}

function ReaderPage() {
  const {
    runtime,
    preferences,
    libraryRevision,
    studyRevision,
    setPreferences,
    refreshPreferences,
    bumpStudy,
    notify,
  } = useApp();
  const router = useRouter();
  const searchParams = useSearchParams();
  const verseIdParam = searchParams.get("verseId");
  const parsedVerse = verseIdParam ? tryParseVerseId(verseIdParam) : undefined;
  const versionId = searchParams.get("version") ?? "";
  const bookParam = parsedVerse?.book ?? searchParams.get("book");
  const chapterParam = parsedVerse?.chapter ?? parsePositiveInt(searchParams.get("chapter"), 1);
  const book = (bookParam && getBook(bookParam)?.code) || "GEN";
  const chapterNumber = Math.min(Math.max(1, chapterParam), CHAPTER_COUNTS[book as BookCode] ?? 1);
  const query = searchParams.get("q") ?? "";
  const targetVerse = parsedVerse?.verse ?? parsePositiveInt(searchParams.get("verse"), 0);

  const [versions, setVersions] = useState<ReaderVersion[]>([]);
  const [chapter, setChapter] = useState<ChapterView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<AnnotationState>({
    bookmarks: [],
    highlights: [],
    notes: [],
    folders: [],
  });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [noteVerse, setNoteVerse] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const anchorVerse = useRef<number | null>(null);

  const go = useCallback(
    (nextVersion: string, nextBook: BookCode, nextChapter: number, verse?: number) => {
      const params = new URLSearchParams({
        version: nextVersion,
        book: nextBook,
        chapter: String(nextChapter),
      });
      if (verse) params.set("verse", String(verse));
      router.push(`/read?${params.toString()}`);
      setPickerOpen(false);
      setSelected(new Set());
      setActionError(null);
    },
    [router],
  );

  useEffect(() => {
    if (!runtime) return;
    let active = true;
    void (async () => {
      const [installed, catalog] = await Promise.all([
        runtime.listInstalledVersions(),
        runtime.listCatalog(),
      ]);
      const map = new Map<string, ReaderVersion>();
      for (const version of catalog) {
        if (!version.enabled || version.licenceStatus === "unlicensed") continue;
        map.set(version.versionId, {
          versionId: version.versionId,
          name: version.name,
          abbreviation: version.abbreviation,
          installed: false,
          enabled: version.enabled,
          licenceStatus: version.licenceStatus,
        });
      }
      for (const version of installed) {
        map.set(version.version_id, {
          versionId: version.version_id,
          name: version.name,
          abbreviation: version.abbreviation,
          installed: true,
          enabled: true,
          licenceStatus: version.licence.status,
        });
      }
      if (!active) return;
      setVersions([...map.values()].sort((a, b) => a.name.localeCompare(b.name)));
    })();
    return () => {
      active = false;
    };
  }, [runtime, libraryRevision]);

  useEffect(() => {
    if (!runtime || versionId || versions.length === 0) return;
    const last = preferences?.last_location;
    if (last) {
      go(last.versionId, last.book, last.chapter, last.verse);
      return;
    }
    const first = versions[0];
    if (first) go(first.versionId, "GEN", 1);
  }, [go, preferences?.last_location, runtime, versionId, versions]);

  const reloadAnnotations = useCallback(async () => {
    if (!runtime) return;
    const [bookmarks, highlights, notes, folders] = await Promise.all([
      runtime.listBookmarks(),
      runtime.listHighlights(),
      runtime.listNotes(),
      runtime.listFolders(),
    ]);
    setAnnotations({ bookmarks, highlights, notes, folders });
  }, [runtime]);

  useEffect(() => {
    void reloadAnnotations();
  }, [reloadAnnotations, studyRevision, versionId, book, chapterNumber]);

  useEffect(() => {
    if (!runtime || versionId || versions.length > 0) return;
    setLoading(false);
  }, [runtime, versionId, versions.length]);

  useEffect(() => {
    if (!runtime || !versionId) return;
    let active = true;
    setLoading(true);
    setLoadError(null);
    void runtime
      .loadChapter(versionId, book, chapterNumber)
      .then((result) => {
        if (!active) return;
        setChapter(result);
        setSelected(new Set(targetVerse ? [targetVerse] : []));
        anchorVerse.current = targetVerse || null;
        void runtime
          .saveReadingPosition(versionId, book, chapterNumber, targetVerse || null)
          .then(() => refreshPreferences())
          .catch(() => undefined);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setChapter(null);
        setLoadError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [book, chapterNumber, refreshPreferences, runtime, targetVerse, versionId]);

  useEffect(() => {
    if (!chapter || !targetVerse) return;
    const element = document.getElementById(`verse-${targetVerse}`);
    element?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [chapter, targetVerse]);

  const availableVersions = versions;
  const currentVersion = availableVersions.find((version) => version.versionId === versionId);
  const chapterHighlights = useMemo(() => {
    const map = new Map<number, LocalHighlight>();
    for (const highlight of annotations.highlights) {
      if (highlight.version_id === versionId) {
        const number = Number(highlight.verse_id.split(".")[2]);
        if (Number.isFinite(number)) map.set(number, highlight);
      }
    }
    return map;
  }, [annotations.highlights, versionId]);
  const bookmarkedVerses = useMemo(
    () =>
      new Set(
        annotations.bookmarks
          .filter((bookmark) => bookmark.version_id === versionId)
          .map((bookmark) => Number(bookmark.verse_id.split(".")[2])),
      ),
    [annotations.bookmarks, versionId],
  );
  const noteVerses = useMemo(() => {
    const map = new Map<number, LocalNote[]>();
    for (const note of annotations.notes) {
      if (!note.verse_id) continue;
      const [noteBook, noteChapter, noteVerse] = note.verse_id.split(".");
      if (noteBook !== book || Number(noteChapter) !== chapterNumber) continue;
      const number = Number(noteVerse);
      map.set(number, [...(map.get(number) ?? []), note]);
    }
    return map;
  }, [annotations.notes, book, chapterNumber]);

  function toggleVerse(verse: number, shiftKey: boolean) {
    setActionError(null);
    setSelected((current) => {
      const next = new Set(current);
      if (shiftKey && anchorVerse.current !== null) {
        const start = Math.min(anchorVerse.current, verse);
        const end = Math.max(anchorVerse.current, verse);
        for (let value = start; value <= end; value += 1) next.add(value);
      } else if (next.has(verse) && next.size === 1) {
        next.delete(verse);
        anchorVerse.current = null;
      } else {
        next.add(verse);
        anchorVerse.current = verse;
      }
      return next;
    });
  }

  async function applyHighlight(color: HighlightColor) {
    if (!runtime || !chapter || selected.size === 0) return;
    setActionError(null);
    try {
      for (const verse of selected) {
        const existing = chapterHighlights.get(verse);
        await runtime.studyStore.saveHighlight({
          ...(existing ? { id: existing.id } : {}),
          verseId: `${book}.${chapterNumber}.${verse}`,
          versionId,
          color,
        });
      }
      await reloadAnnotations();
      bumpStudy();
      runtime.scheduleSync();
      notify(`Highlighted ${selected.size} verse${selected.size === 1 ? "" : "s"}.`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  }

  async function removeHighlight() {
    if (!runtime || selected.size === 0) return;
    setActionError(null);
    try {
      for (const verse of selected) {
        const existing = chapterHighlights.get(verse);
        if (existing) await runtime.studyStore.deleteHighlight(existing.id);
      }
      await reloadAnnotations();
      bumpStudy();
      runtime.scheduleSync();
      notify("Highlight removed.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  }

  async function toggleBookmarks() {
    if (!runtime || selected.size === 0) return;
    setActionError(null);
    try {
      const allMarked = [...selected].every((verse) => bookmarkedVerses.has(verse));
      for (const verse of selected) {
        const verseId = `${book}.${chapterNumber}.${verse}`;
        const existing = annotations.bookmarks.find(
          (bookmark) => bookmark.version_id === versionId && bookmark.verse_id === verseId,
        );
        if (allMarked) {
          if (existing) await runtime.studyStore.deleteBookmark(existing.id);
        } else if (!existing) {
          await runtime.studyStore.saveBookmark({
            verseId,
            versionId,
            label: referenceLabel(book, chapterNumber, verse),
          });
        }
      }
      await reloadAnnotations();
      bumpStudy();
      runtime.scheduleSync();
      notify(allMarked ? "Bookmark removed." : "Bookmarked.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  }

  async function copySelection(mode: "copy" | "share") {
    if (!runtime || !chapter || selected.size === 0) return;
    setActionError(null);
    try {
      const text = await runtime.citation(chapter, [...selected], mode);
      if (mode === "share" && navigator.share) {
        await navigator.share({
          title: `${referenceLabel(book, chapterNumber)} (${chapter.abbreviation})`,
          text,
        });
        notify("Shared.");
      } else {
        await copyText(text);
        notify(`${selected.size} verse${selected.size === 1 ? "" : "s"} copied with attribution.`);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setActionError(error instanceof Error ? error.message : String(error));
    }
  }

  function openNote() {
    const first = [...selected].sort((a, b) => a - b)[0];
    if (first) setNoteVerse(first);
  }

  const previous = adjacentChapter(book, chapterNumber, -1);
  const next = adjacentChapter(book, chapterNumber, 1);

  if (versions.length === 0 && !loading) {
    return (
      <div className="reader-page">
        <EmptyState
          title="No Bible version is available"
          action={
            <Link className="button" href="/library">
              Open the library
            </Link>
          }
        >
          Download the public-domain King James Version to begin reading offline.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="reader-page">
      <div className="reader-toolbar">
        <div className="reader-location">
          <button
            type="button"
            className="reader-location-button"
            onClick={() => setPickerOpen(true)}
            aria-haspopup="dialog"
          >
            {bookName(book as BookCode)} {chapterNumber}
            <ChevronRightIcon size={16} />
          </button>
          {currentVersion ? <span className="pill">{currentVersion.abbreviation}</span> : null}
          {chapter?.source === "online" ? <span className="pill pill-gold">Online</span> : null}
        </div>
        <div className="reader-controls">
          <button
            type="button"
            className="icon-button"
            aria-label="Decrease text size"
            onClick={() =>
              void setPreferences({
                fontScale: Math.max(
                  0.85,
                  Number(((preferences?.font_scale ?? 1) - 0.1).toFixed(2)),
                ),
              })
            }
          >
            <span aria-hidden="true" style={{ fontWeight: 800, fontSize: "0.8rem" }}>
              A−
            </span>
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Increase text size"
            onClick={() =>
              void setPreferences({
                fontScale: Math.min(1.6, Number(((preferences?.font_scale ?? 1) + 0.1).toFixed(2))),
              })
            }
          >
            <span aria-hidden="true" style={{ fontWeight: 800, fontSize: "1.05rem" }}>
              A+
            </span>
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={`Reading theme: ${preferences?.reading_theme ?? "light"}. Change theme.`}
            onClick={() => {
              const current = preferences?.reading_theme ?? "light";
              const order = ["light", "sepia", "dark"] as const;
              const index = order.indexOf(current);
              void setPreferences({
                readingTheme: order[(index + 1) % order.length] ?? "light",
              });
            }}
          >
            <SunIcon size={19} />
          </button>
        </div>
      </div>

      {loading ? <Spinner label="Opening chapter" /> : null}

      {!loading && loadError ? (
        <div className="card card-pad stack">
          <p className="form-error" role="alert">
            This chapter could not be opened. {loadError}
          </p>
          <div className="row">
            <button type="button" className="button" onClick={() => router.refresh()}>
              Try again
            </button>
            <Link className="button button-secondary" href="/library">
              Check your library
            </Link>
          </div>
        </div>
      ) : null}

      {!loading && chapter ? (
        <>
          <article
            className="reading-surface"
            aria-label={`${chapter.bookName} ${chapter.chapter}`}
          >
            <header className="chapter-heading">
              <h1>
                {chapter.bookName} {chapter.chapter}
              </h1>
              <p>
                {chapter.abbreviation} · {chapter.verses.length} verses ·{" "}
                {chapter.source === "local" ? "Available offline" : "Reading online"}
              </p>
            </header>
            <div className="verse-list">
              {chapter.verses.map((verse) => {
                const highlight = chapterHighlights.get(verse.verse);
                const highlightColor = chapterHighlights.get(verse.verse)?.color ?? undefined;
                const isBookmarked = bookmarkedVerses.has(verse.verse);
                const notes = noteVerses.get(verse.verse)?.length ?? 0;
                return (
                  <button
                    type="button"
                    key={verse.id}
                    id={`verse-${verse.verse}`}
                    className="verse"
                    data-selected={selected.has(verse.verse)}
                    data-highlight={highlightColor}
                    aria-pressed={selected.has(verse.verse)}
                    aria-label={`Verse ${verse.verse}. Select for actions.`}
                    onClick={(event) => toggleVerse(verse.verse, event.shiftKey)}
                  >
                    <span className="verse-number" aria-hidden="true">
                      {verse.verse}
                    </span>
                    <span className="verse-text">
                      {query
                        ? highlightSegments(verse.text, query).map((segment, index) =>
                            segment.match ? (
                              <mark key={index}>{segment.text}</mark>
                            ) : (
                              <span key={index}>{segment.text}</span>
                            ),
                          )
                        : verse.text}
                      {isBookmarked || notes > 0 || highlight ? (
                        <span className="verse-indicators" aria-label="Study marks">
                          {isBookmarked ? <BookmarkIcon /> : null}
                          {notes > 0 ? <NoteIcon /> : null}
                          {highlight ? (
                            <span
                              aria-hidden="true"
                              style={{
                                width: 9,
                                height: 9,
                                borderRadius: 9,
                                background: `var(--highlight-${highlight.color})`,
                                border: "1px solid var(--reader-muted)",
                              }}
                            />
                          ) : null}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
            <footer className="reading-attribution">
              {chapter.attribution}
              {chapter.copyright ? `\n${chapter.copyright}` : ""}
            </footer>
          </article>

          {actionError ? (
            <p className="form-error" role="alert" style={{ marginTop: 12 }}>
              {actionError}
            </p>
          ) : null}

          {selected.size > 0 ? (
            <div className="action-bar" role="toolbar" aria-label="Verse actions">
              <span className="action-count">{selected.size} selected</span>
              <div className="color-dots" aria-label="Highlight colour">
                {COLORS.map((entry) => (
                  <button
                    key={entry.color}
                    type="button"
                    className="color-dot"
                    data-color={entry.color}
                    aria-label={`Highlight ${entry.label.toLowerCase()}`}
                    aria-pressed={
                      selected.size === 1 &&
                      chapterHighlights.get([...selected][0]!)?.color === entry.color
                    }
                    onClick={() => void applyHighlight(entry.color)}
                  />
                ))}
              </div>
              <button
                type="button"
                className="button button-ghost button-small"
                onClick={() => void toggleBookmarks()}
                aria-label={
                  [...selected].every((verse) => bookmarkedVerses.has(verse))
                    ? "Remove bookmark"
                    : "Bookmark selected verses"
                }
              >
                <BookmarkIcon size={17} />
                <span>Bookmark</span>
              </button>
              <button type="button" className="button button-ghost button-small" onClick={openNote}>
                <NoteIcon size={17} />
                <span>Note</span>
              </button>
              <button
                type="button"
                className="button button-ghost button-small"
                onClick={() => void copySelection("copy")}
              >
                <CopyIcon size={17} />
                <span>Copy</span>
              </button>
              <button
                type="button"
                className="button button-ghost button-small"
                onClick={() => void copySelection("share")}
              >
                <ShareIcon size={17} />
                <span>Share</span>
              </button>
              {chapterHighlights.size > 0 ? (
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => void removeHighlight()}
                  aria-label="Remove highlight from selected verses"
                >
                  <TrashIcon size={17} />
                </button>
              ) : null}
              <button
                type="button"
                className="icon-button"
                onClick={() => setSelected(new Set())}
                aria-label="Clear selection"
              >
                <CloseIcon size={17} />
              </button>
            </div>
          ) : null}

          <div className="reader-pager">
            {previous ? (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => go(versionId, previous.book, previous.chapter)}
              >
                <ChevronLeftIcon size={17} /> {bookName(previous.book)} {previous.chapter}
              </button>
            ) : (
              <span />
            )}
            {next ? (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => go(versionId, next.book, next.chapter)}
              >
                {bookName(next.book)} {next.chapter} <ChevronRightIcon size={17} />
              </button>
            ) : (
              <span />
            )}
          </div>
        </>
      ) : null}

      {pickerOpen ? (
        <ChapterPicker
          versions={availableVersions}
          currentVersion={versionId}
          currentBook={book as BookCode}
          currentChapter={chapterNumber}
          onClose={() => setPickerOpen(false)}
          onSelect={go}
        />
      ) : null}

      {noteVerse !== null ? (
        <NoteEditor
          runtime={runtime}
          folders={annotations.folders}
          existing={noteVerses.get(noteVerse)?.[0]}
          verseId={`${book}.${chapterNumber}.${noteVerse}`}
          reference={`${referenceLabel(book as BookCode, chapterNumber, noteVerse)}${
            selected.size > 1 ? ` (selected ${Math.min(...selected)}-${Math.max(...selected)})` : ""
          }`}
          onClose={() => setNoteVerse(null)}
          onSaved={async () => {
            setNoteVerse(null);
            await reloadAnnotations();
            bumpStudy();
            runtime?.scheduleSync();
          }}
        />
      ) : null}
    </div>
  );
}

function ChapterPicker({
  versions,
  currentVersion,
  currentBook,
  currentChapter,
  onClose,
  onSelect,
}: {
  versions: readonly ReaderVersion[];
  currentVersion: string;
  currentBook: BookCode;
  currentChapter: number;
  onClose: () => void;
  onSelect: (version: string, book: BookCode, chapter: number) => void;
}) {
  const [book, setBook] = useState<BookCode>(currentBook);
  const [version, setVersion] = useState(currentVersion);
  return (
    <Modal title="Choose a passage" onClose={onClose} wide>
      <div className="stack">
        <div className="field">
          <label htmlFor="reader-version">Bible version</label>
          <select
            id="reader-version"
            className="select"
            value={version}
            onChange={(event) => setVersion(event.target.value)}
          >
            {versions.map((entry) => (
              <option key={entry.versionId} value={entry.versionId}>
                {entry.name}
                {entry.installed ? " — offline" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="picker-layout">
          <div className="picker-books" aria-label="Books">
            {(["OT", "NT"] as const).map((testament) => (
              <div key={testament}>
                <p className="eyebrow" style={{ margin: "12px 10px 5px" }}>
                  {testament === "OT" ? "Old Testament" : "New Testament"}
                </p>
                {BOOKS.filter((entry) => entry.testament === testament).map((entry) => (
                  <button
                    key={entry.code}
                    type="button"
                    className="picker-button"
                    aria-current={entry.code === book}
                    onClick={() => setBook(entry.code)}
                  >
                    {entry.name}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div>
            <p className="label" style={{ marginBottom: 10 }}>
              {bookName(book)} · {CHAPTER_COUNTS[book]} chapters
            </p>
            <div className="chapter-grid">
              {Array.from({ length: CHAPTER_COUNTS[book] }, (_, index) => index + 1).map(
                (chapter) => (
                  <button
                    key={chapter}
                    type="button"
                    className="chapter-button"
                    aria-current={book === currentBook && chapter === currentChapter}
                    onClick={() => onSelect(version, book, chapter)}
                  >
                    {chapter}
                  </button>
                ),
              )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function NoteEditor({
  runtime,
  folders,
  existing,
  verseId,
  reference,
  onClose,
  onSaved,
}: {
  runtime: ReturnType<typeof useApp>["runtime"];
  folders: readonly LocalFolder[];
  existing: LocalNote | undefined;
  verseId: string;
  reference: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [folderId, setFolderId] = useState(existing?.folder_id ?? "");
  const [newFolder, setNewFolder] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [folderOptions, setFolderOptions] = useState<readonly LocalFolder[]>(folders);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!runtime) return;
    if (!body.trim()) {
      setError("Write something before saving the note.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let selectedFolder = folderId;
      if (showNewFolder && newFolder.trim()) {
        const created = await runtime.studyStore.saveFolder({ name: newFolder.trim() });
        selectedFolder = created.id;
        setFolderOptions((current) => [...current, created]);
      }
      await runtime.studyStore.saveNote({
        ...(existing ? { id: existing.id } : {}),
        verseId,
        reference,
        title: title.trim() || null,
        body: body.trim(),
        folderId: selectedFolder || null,
      });
      await onSaved();
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!runtime || !existing) return;
    setBusy(true);
    try {
      await runtime.studyStore.deleteNote(existing.id);
      await onSaved();
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={existing ? "Edit note" : "New note"} onClose={onClose}>
      <form className="auth-form" onSubmit={save}>
        <p className="subtle" style={{ margin: 0 }}>
          {reference}
        </p>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="field">
          <label htmlFor="note-title">Title (optional)</label>
          <input
            id="note-title"
            className="input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
          />
        </div>
        <div className="field">
          <label htmlFor="note-body">Note</label>
          <textarea
            id="note-body"
            className="textarea"
            required
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="note-folder">Folder</label>
          <select
            id="note-folder"
            className="select"
            value={folderId}
            onChange={(event) => setFolderId(event.target.value)}
          >
            <option value="">No folder</option>
            {folderOptions.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
        </div>
        {showNewFolder ? (
          <div className="field">
            <label htmlFor="new-folder">New folder name</label>
            <input
              id="new-folder"
              className="input"
              value={newFolder}
              onChange={(event) => setNewFolder(event.target.value)}
              maxLength={80}
            />
          </div>
        ) : (
          <button
            type="button"
            className="button button-ghost button-small"
            onClick={() => setShowNewFolder(true)}
          >
            Create a folder
          </button>
        )}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          {existing ? (
            <button
              type="button"
              className="button button-secondary"
              onClick={() => void remove()}
              disabled={busy}
            >
              Delete
            </button>
          ) : null}
          <button type="button" className="button button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button" disabled={busy}>
            {busy ? "Saving…" : "Save note"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
