"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import { tryParseReference } from "@holyword/core";
import type {
  LocalBookmark,
  LocalFolder,
  LocalHighlight,
  LocalNote,
  LocalNoteConflict,
} from "@holyword/offline";
import { useApp } from "@/components/app-provider";
import { Modal } from "@/components/modal";
import { EmptyState, PageHeader, Spinner } from "@/components/ui";
import { PlanIcon, TrashIcon } from "@/components/icons";
import type { PlanView } from "@/lib/web-runtime";

type StudyTab = "bookmarks" | "highlights" | "notes" | "plans";

const TABS: readonly { id: StudyTab; label: string }[] = [
  { id: "bookmarks", label: "Bookmarks" },
  { id: "highlights", label: "Highlights" },
  { id: "notes", label: "Notes & folders" },
  { id: "plans", label: "Reading plans" },
];

interface StudyData {
  readonly bookmarks: LocalBookmark[];
  readonly highlights: LocalHighlight[];
  readonly notes: LocalNote[];
  readonly folders: LocalFolder[];
  readonly plans: PlanView[];
  readonly conflicts: LocalNoteConflict[];
}

function verseHref(verseId: string, versionId: string): string {
  return `/read?version=${encodeURIComponent(versionId)}&verseId=${encodeURIComponent(verseId)}`;
}

function planHref(reference: string, versionId: string): string {
  const parsed = tryParseReference(reference);
  if (!parsed) return `/search?q=${encodeURIComponent(reference)}`;
  if (parsed.type === "book") return `/read?version=${versionId}&book=${parsed.book}&chapter=1`;
  if (parsed.type === "chapter") {
    return `/read?version=${versionId}&book=${parsed.book}&chapter=${parsed.chapter}`;
  }
  if (parsed.type === "chapter-range") {
    return `/read?version=${versionId}&book=${parsed.book}&chapter=${parsed.startChapter}`;
  }
  if (parsed.type === "verse") {
    return `${verseHref(`${parsed.book}.${parsed.chapter}.${parsed.verse}`, versionId)}`;
  }
  return `${verseHref(`${parsed.book}.${parsed.start.chapter}.${parsed.start.verse}`, versionId)}`;
}

export default function StudyRoute() {
  return (
    <Suspense fallback={<Spinner label="Opening your study" />}>
      <StudyPage />
    </Suspense>
  );
}

function StudyPage() {
  const { runtime, studyRevision, bumpStudy, notify, preferences } = useApp();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const tab: StudyTab =
    requestedTab === "highlights" || requestedTab === "notes" || requestedTab === "plans"
      ? requestedTab
      : "bookmarks";
  const [data, setData] = useState<StudyData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeFolder, setActiveFolder] = useState<string>("all");
  const [folderName, setFolderName] = useState("");
  const [editingNote, setEditingNote] = useState<LocalNote | null>(null);
  const [openPlan, setOpenPlan] = useState<PlanView | null>(null);

  async function load() {
    if (!runtime) return;
    const [bookmarks, highlights, notes, folders, plans, conflicts] = await Promise.all([
      runtime.listBookmarks(),
      runtime.listHighlights(),
      runtime.listNotes(),
      runtime.listFolders(),
      runtime.listPlans(),
      runtime.listConflicts(),
    ]);
    setData({
      bookmarks: bookmarks.sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
      highlights: highlights.sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
      notes: notes.sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
      folders: folders.sort((a, b) => a.name.localeCompare(b.name)),
      plans,
      conflicts,
    });
  }

  useEffect(() => {
    if (!runtime) return;
    let active = true;
    void load().catch((errorValue: unknown) => {
      if (active) setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
    });
    return () => {
      active = false;
    };
    // Load when the provider reports new study data.
  }, [runtime, studyRevision]);

  async function removeBookmark(bookmark: LocalBookmark) {
    if (!runtime) return;
    await runtime.studyStore.deleteBookmark(bookmark.id);
    bumpStudy();
    runtime.scheduleSync();
    await load();
    notify("Bookmark removed.");
  }

  async function removeHighlight(highlight: LocalHighlight) {
    if (!runtime) return;
    await runtime.studyStore.deleteHighlight(highlight.id);
    bumpStudy();
    runtime.scheduleSync();
    await load();
    notify("Highlight removed.");
  }

  async function createFolder(event: FormEvent) {
    event.preventDefault();
    if (!runtime || !folderName.trim()) return;
    try {
      await runtime.studyStore.saveFolder({ name: folderName.trim() });
      setFolderName("");
      bumpStudy();
      runtime.scheduleSync();
      await load();
      notify("Folder created.");
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
    }
  }

  async function removeFolder(folder: LocalFolder) {
    if (!runtime) return;
    await runtime.studyStore.deleteFolder(folder.id);
    if (activeFolder === folder.id) setActiveFolder("all");
    bumpStudy();
    runtime.scheduleSync();
    await load();
    notify("Folder removed. Its notes are still available.");
  }

  async function dismissConflict(conflict: LocalNoteConflict) {
    if (!runtime) return;
    await runtime.deleteConflict(conflict.id);
    await load();
  }

  async function togglePlanDay(plan: PlanView, day: number, complete: boolean) {
    if (!runtime) return;
    await runtime.savePlanDay(plan.id, day, complete);
    bumpStudy();
    await load();
    const refreshed = (await runtime.plansFromCache()).find((entry) => entry.id === plan.id);
    if (refreshed) setOpenPlan(refreshed);
  }

  const filteredNotes = useMemo(() => {
    if (!data) return [];
    if (activeFolder === "all") return data.notes;
    if (activeFolder === "none") return data.notes.filter((note) => !note.folder_id);
    return data.notes.filter((note) => note.folder_id === activeFolder);
  }, [activeFolder, data]);

  if (!data) return <Spinner label="Gathering bookmarks, notes and plans" />;

  const folderById = new Map(data.folders.map((folder) => [folder.id, folder]));
  const activeVersion = preferences?.active_version_id ?? "kjv";

  return (
    <>
      <PageHeader
        eyebrow="Your study"
        title="Keep what the Word is saying"
        description="Bookmarks, highlights, notes and reading-plan progress are stored offline and synced to your account when a connection is available."
      />

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="tabs" role="tablist" aria-label="Study sections">
        {TABS.map((entry) => (
          <Link
            key={entry.id}
            className="tab"
            role="tab"
            aria-selected={tab === entry.id}
            href={`/study?tab=${entry.id}`}
            scroll={false}
          >
            {entry.label}
          </Link>
        ))}
      </div>

      {tab === "bookmarks" ? (
        <section aria-labelledby="bookmarks-heading">
          <div className="section-title">
            <h2 id="bookmarks-heading">Bookmarks</h2>
            <span className="pill">{data.bookmarks.length}</span>
          </div>
          {data.bookmarks.length === 0 ? (
            <EmptyState
              title="No bookmarks yet"
              action={
                <Link className="button" href="/read">
                  Open the reader
                </Link>
              }
            >
              While reading, select a verse and choose Bookmark.
            </EmptyState>
          ) : (
            <div className="list">
              {data.bookmarks.map((bookmark) => (
                <div className="list-row" key={bookmark.id}>
                  <div className="list-row-main">
                    <strong>{bookmark.label ?? bookmark.verse_id.replaceAll(".", " ")}</strong>
                    <p>
                      {bookmark.version_id.toUpperCase()} · saved{" "}
                      {new Date(bookmark.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="list-row-actions">
                    <Link
                      className="button button-secondary button-small"
                      href={verseHref(bookmark.verse_id, bookmark.version_id)}
                    >
                      Read
                    </Link>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Remove bookmark"
                      onClick={() => void removeBookmark(bookmark)}
                    >
                      <TrashIcon size={17} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {tab === "highlights" ? (
        <section aria-labelledby="highlights-heading">
          <div className="section-title">
            <h2 id="highlights-heading">Highlights</h2>
            <span className="pill">{data.highlights.length}</span>
          </div>
          {data.highlights.length === 0 ? (
            <EmptyState title="No highlights yet">
              Select verses in the reader and choose one of the five highlighter colours.
            </EmptyState>
          ) : (
            <div className="list">
              {data.highlights.map((highlight) => (
                <div className="list-row" key={highlight.id}>
                  <div className="list-row-main">
                    <strong style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span
                        aria-hidden="true"
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: 4,
                          background: `var(--highlight-${highlight.color})`,
                          border: "1px solid var(--border-strong)",
                        }}
                      />
                      {highlight.verse_id.replaceAll(".", " ")}
                    </strong>
                    <p>
                      {highlight.version_id.toUpperCase()} · {highlight.color.replace("-", " ")}
                    </p>
                  </div>
                  <div className="list-row-actions">
                    <Link
                      className="button button-secondary button-small"
                      href={verseHref(highlight.verse_id, highlight.version_id)}
                    >
                      Read
                    </Link>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Remove highlight"
                      onClick={() => void removeHighlight(highlight)}
                    >
                      <TrashIcon size={17} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {tab === "notes" ? (
        <section aria-labelledby="notes-heading" className="stack">
          <div className="section-title">
            <h2 id="notes-heading">Notes and folders</h2>
            <span className="pill">{data.notes.length}</span>
          </div>

          {data.conflicts.length > 0 ? (
            <div className="card card-pad stack">
              <div>
                <h3>Preserved conflict copies</h3>
                <p className="muted" style={{ margin: 0 }}>
                  Both versions of these notes were kept when two devices edited at the same time.
                  Review the copies before dismissing them.
                </p>
              </div>
              {data.conflicts.map((conflict) => (
                <div className="note-card" key={conflict.id}>
                  <strong>{conflict.note_id}</strong>
                  <p>
                    <strong>Local:</strong> {String(conflict.local_payload.body ?? "(no body)")}
                  </p>
                  <p>
                    <strong>Remote:</strong> {String(conflict.remote_payload.body ?? "(no body)")}
                  </p>
                  <button
                    type="button"
                    className="button button-secondary button-small"
                    onClick={() => void dismissConflict(conflict)}
                  >
                    Dismiss conflict record
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="card card-pad">
            <form className="row" onSubmit={createFolder}>
              <div className="field" style={{ flex: 1 }}>
                <label htmlFor="folder-name">Create a folder</label>
                <input
                  id="folder-name"
                  className="input"
                  value={folderName}
                  maxLength={80}
                  placeholder="e.g. Sunday study"
                  onChange={(event) => setFolderName(event.target.value)}
                />
              </div>
              <button className="button" type="submit" disabled={!folderName.trim()}>
                Add folder
              </button>
            </form>
          </div>

          <div className="tabs" role="group" aria-label="Filter notes by folder">
            <button
              type="button"
              className="tab"
              aria-selected={activeFolder === "all"}
              onClick={() => setActiveFolder("all")}
            >
              All notes
            </button>
            <button
              type="button"
              className="tab"
              aria-selected={activeFolder === "none"}
              onClick={() => setActiveFolder("none")}
            >
              No folder
            </button>
            {data.folders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                className="tab"
                aria-selected={activeFolder === folder.id}
                onClick={() => setActiveFolder(folder.id)}
              >
                {folder.name}
              </button>
            ))}
          </div>

          {activeFolder !== "all" && activeFolder !== "none" ? (
            <div className="row">
              <span className="subtle">Folder actions:</span>
              <button
                type="button"
                className="button button-ghost button-small"
                onClick={() => {
                  const folder = folderById.get(activeFolder);
                  if (folder) void removeFolder(folder);
                }}
              >
                Delete this folder
              </button>
            </div>
          ) : null}

          {filteredNotes.length === 0 ? (
            <EmptyState title="No notes in this view">
              Select a verse in the reader and choose Note to write your first one.
            </EmptyState>
          ) : (
            <div className="grid-2">
              {filteredNotes.map((note) => (
                <article className="note-card" key={note.id}>
                  <div className="row-between">
                    <strong>{note.title || note.reference || "Note"}</strong>
                    {note.folder_id ? (
                      <span className="pill">
                        {folderById.get(note.folder_id)?.name ?? "Folder"}
                      </span>
                    ) : null}
                  </div>
                  <p>{note.body}</p>
                  <div className="row-between">
                    <span className="subtle">
                      {note.reference ?? note.verse_id?.replaceAll(".", " ") ?? "Note"}
                    </span>
                    <div className="row">
                      {note.verse_id ? (
                        <Link
                          className="button button-ghost button-small"
                          href={verseHref(note.verse_id, activeVersion)}
                        >
                          Read verse
                        </Link>
                      ) : null}
                      <button
                        type="button"
                        className="button button-secondary button-small"
                        onClick={() => setEditingNote(note)}
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {tab === "plans" ? (
        <section aria-labelledby="plans-heading">
          <div className="section-title">
            <h2 id="plans-heading">Reading plans</h2>
            <span className="pill">{data.plans.length} cached</span>
          </div>
          {data.plans.length === 0 ? (
            <EmptyState title="No plans available">
              Plans are downloaded from the HolyWord catalogue. Reconnect and open this tab to
              refresh them.
            </EmptyState>
          ) : (
            <div className="grid-2">
              {data.plans.map((plan) => {
                const percent =
                  plan.day_count > 0
                    ? Math.round((plan.completedDays.length / plan.day_count) * 100)
                    : 0;
                return (
                  <article className="plan-card" key={plan.id}>
                    <div className="row-between">
                      <h3>{plan.title}</h3>
                      <PlanIcon size={23} />
                    </div>
                    <p>{plan.description}</p>
                    <div className="progress-track" aria-hidden="true">
                      <div className="progress-fill" style={{ width: `${percent}%` }} />
                    </div>
                    <div className="row-between">
                      <span className="subtle">
                        {plan.completedDays.length} of {plan.day_count} days
                      </span>
                      <button
                        type="button"
                        className="button button-secondary button-small"
                        onClick={() => setOpenPlan(plan)}
                      >
                        Open plan
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {editingNote ? (
        <NoteEditModal
          note={editingNote}
          folders={data.folders}
          onClose={() => setEditingNote(null)}
          onSaved={async () => {
            setEditingNote(null);
            bumpStudy();
            await load();
            notify("Note saved.");
          }}
        />
      ) : null}

      {openPlan ? (
        <Modal title={openPlan.title} onClose={() => setOpenPlan(null)} wide>
          <div className="stack">
            <p className="muted" style={{ margin: 0 }}>
              {openPlan.description}
            </p>
            <div className="progress-track" aria-hidden="true">
              <div
                className="progress-fill"
                style={{
                  width: `${Math.round((openPlan.completedDays.length / openPlan.day_count) * 100)}%`,
                }}
              />
            </div>
            <div className="plan-schedule">
              {openPlan.schedule.map((day) => {
                const complete = openPlan.completedDays.includes(day.day);
                return (
                  <div className="plan-day" data-complete={complete} key={day.day}>
                    <span className="plan-day-number">{day.day}</span>
                    <div>
                      <h4>{day.title}</h4>
                      <div className="plan-references">
                        {day.references.map((reference) => (
                          <Link
                            key={reference}
                            className="plan-reference"
                            href={planHref(reference, activeVersion)}
                          >
                            {reference}
                          </Link>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`button button-small ${complete ? "button-secondary" : ""}`}
                      onClick={() => void togglePlanDay(openPlan, day.day, !complete)}
                    >
                      {complete ? "Undo" : "Mark complete"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function NoteEditModal({
  note,
  folders,
  onClose,
  onSaved,
}: {
  note: LocalNote;
  folders: readonly LocalFolder[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { runtime, notify } = useApp();
  const [title, setTitle] = useState(note.title ?? "");
  const [body, setBody] = useState(note.body);
  const [folderId, setFolderId] = useState(note.folder_id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!runtime || !body.trim()) {
      setError("A note needs some text.");
      return;
    }
    setBusy(true);
    try {
      await runtime.studyStore.saveNote({
        id: note.id,
        verseId: note.verse_id,
        reference: note.reference,
        title: title.trim() || null,
        body: body.trim(),
        folderId: folderId || null,
      });
      runtime.scheduleSync();
      await onSaved();
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!runtime) return;
    setBusy(true);
    try {
      await runtime.studyStore.deleteNote(note.id);
      runtime.scheduleSync();
      notify("Note deleted.");
      await onSaved();
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Edit note" onClose={onClose}>
      <form className="auth-form" onSubmit={save}>
        <p className="subtle" style={{ margin: 0 }}>
          {note.reference ?? note.verse_id ?? "Note"}
        </p>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="field">
          <label htmlFor="edit-note-title">Title</label>
          <input
            id="edit-note-title"
            className="input"
            value={title}
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="edit-note-body">Note</label>
          <textarea
            id="edit-note-body"
            className="textarea"
            required
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="edit-note-folder">Folder</label>
          <select
            id="edit-note-folder"
            className="select"
            value={folderId}
            onChange={(event) => setFolderId(event.target.value)}
          >
            <option value="">No folder</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
        </div>
        {confirmDelete ? (
          <p className="form-error">Delete this note? This removes it from all synced devices.</p>
        ) : null}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          {confirmDelete ? (
            <button
              type="button"
              className="button button-danger"
              onClick={() => void remove()}
              disabled={busy}
            >
              Yes, delete
            </button>
          ) : (
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
            >
              Delete note
            </button>
          )}
          <button type="button" className="button button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
