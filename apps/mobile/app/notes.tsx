import { useCallback, useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { LocalFolder, LocalNote, LocalNoteConflict } from "@holyword/offline";
import { useApp } from "@/components/app-provider";
import { Sheet } from "@/components/modal";
import {
  AppBar,
  AppButton,
  AppTextInput,
  Card,
  Chip,
  EmptyState,
  Field,
  MutedText,
  PageHeader,
  Row,
  Screen,
  SyncBadge,
  styles as uiStyles,
} from "@/components/ui";
import { formatRelativeTime } from "@/lib/format";

interface EditorState {
  readonly note: LocalNote | null;
  readonly title: string;
  readonly body: string;
  readonly folderId: string | null;
}

export default function NotesScreen() {
  const { runtime, colors, studyRevision, bumpStudy, notify, online } = useApp();
  const router = useRouter();
  const [notes, setNotes] = useState<LocalNote[]>([]);
  const [folders, setFolders] = useState<LocalFolder[]>([]);
  const [conflicts, setConflicts] = useState<LocalNoteConflict[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loaded, setLoaded] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [folderName, setFolderName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!runtime) return;
    const [nextNotes, nextFolders, nextConflicts] = await Promise.all([
      runtime.listNotes(),
      runtime.listFolders(),
      runtime.listConflicts(),
    ]);
    setNotes(nextNotes.sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
    setFolders(nextFolders.sort((a, b) => a.name.localeCompare(b.name)));
    setConflicts(nextConflicts);
    setLoaded(true);
  }, [runtime]);

  useFocusEffect(
    useCallback(() => {
      void load().catch((errorValue) =>
        setError(errorValue instanceof Error ? errorValue.message : String(errorValue)),
      );
    }, [load, studyRevision]),
  );

  const visibleNotes = useMemo(() => {
    if (filter === "all") return notes;
    if (filter === "none") return notes.filter((note) => !note.folder_id);
    return notes.filter((note) => note.folder_id === filter);
  }, [filter, notes]);

  function startNew() {
    setEditor({ note: null, title: "", body: "", folderId: null });
    setError(null);
  }

  async function createFolder() {
    if (!runtime || !folderName.trim()) return;
    try {
      await runtime.studyStore.saveFolder({ name: folderName.trim() });
      setFolderName("");
      runtime.scheduleSync();
      bumpStudy();
      await load();
      notify("Folder created.");
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
    }
  }

  function deleteFolder(folder: LocalFolder) {
    Alert.alert(
      `Delete “${folder.name}”?`,
      "The folder will be removed. Notes inside it remain available without a folder.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            if (!runtime) return;
            void runtime.studyStore
              .deleteFolder(folder.id)
              .then(async () => {
                if (filter === folder.id) setFilter("all");
                runtime.scheduleSync();
                bumpStudy();
                await load();
                notify("Folder removed. Its notes are still available.");
              })
              .catch((errorValue: unknown) =>
                setError(errorValue instanceof Error ? errorValue.message : String(errorValue)),
              );
          },
        },
      ],
    );
  }

  async function saveNote() {
    if (!runtime || !editor) return;
    if (!editor.body.trim()) {
      setError("A note needs some text.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await runtime.studyStore.saveNote({
        ...(editor.note ? { id: editor.note.id } : {}),
        verseId: editor.note?.verse_id ?? null,
        reference: editor.note?.reference ?? "Personal note",
        title: editor.title.trim() || null,
        body: editor.body.trim(),
        folderId: editor.folderId,
      });
      runtime.scheduleSync();
      bumpStudy();
      setEditor(null);
      await load();
      notify("Note saved.");
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
    } finally {
      setBusy(false);
    }
  }

  function deleteNote(note: LocalNote) {
    Alert.alert("Delete this note?", "This removes the note from every synced device.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          if (!runtime) return;
          void runtime.studyStore
            .deleteNote(note.id)
            .then(async () => {
              runtime.scheduleSync();
              bumpStudy();
              setEditor(null);
              await load();
              notify("Note deleted.");
            })
            .catch((errorValue: unknown) =>
              setError(errorValue instanceof Error ? errorValue.message : String(errorValue)),
            );
        },
      },
    ]);
  }

  async function dismissConflict(conflict: LocalNoteConflict) {
    if (!runtime) return;
    await runtime.deleteConflict(conflict.id);
    await load();
  }

  const folderById = new Map(folders.map((folder) => [folder.id, folder]));

  return (
    <Screen>
      <AppBar
        title="Notes and folders"
        subtitle={`${notes.length} notes · ${folders.length} folders`}
        onBack={() => router.back()}
        action={<SyncBadge />}
      />
      <PageHeader
        eyebrow="Study"
        title="Write down what you are learning"
        description="Notes are available offline, can be filed into folders, and sync with conflict copies preserved when two devices edit at once."
      />

      {error ? (
        <Card>
          <Text accessibilityRole="alert" style={{ color: colors.danger }}>
            {error}
          </Text>
        </Card>
      ) : null}

      {!loaded ? (
        <Text style={{ color: colors.muted }}>Gathering your notes…</Text>
      ) : (
        <>
          <Row style={uiStyles.rowBetween}>
            <AppButton
              title="New note"
              icon={<Ionicons name="add" size={18} color={colors.onPrimary} />}
              onPress={startNew}
            />
            <Text style={{ color: colors.subtle, fontSize: 12 }}>
              {online ? "Synced when online" : "Saved offline"}
            </Text>
          </Row>

          <Card>
            <Field label="Create a folder">
              <Row>
                <AppTextInput
                  value={folderName}
                  onChangeText={setFolderName}
                  placeholder="e.g. Sunday study"
                  maxLength={80}
                  style={{ flex: 1 }}
                />
                <AppButton
                  title="Add"
                  variant="secondary"
                  compact
                  disabled={!folderName.trim()}
                  onPress={() => void createFolder()}
                />
              </Row>
            </Field>
          </Card>

          <Row>
            <Chip label="All notes" selected={filter === "all"} onPress={() => setFilter("all")} />
            <Chip
              label="No folder"
              selected={filter === "none"}
              onPress={() => setFilter("none")}
            />
            {folders.map((folder) => (
              <Chip
                key={folder.id}
                label={folder.name}
                selected={filter === folder.id}
                onPress={() => setFilter(folder.id)}
              />
            ))}
          </Row>

          {filter !== "all" && filter !== "none" ? (
            <Row style={{ justifyContent: "flex-end" }}>
              <AppButton
                title="Delete this folder"
                variant="ghost"
                compact
                onPress={() => {
                  const folder = folderById.get(filter);
                  if (folder) deleteFolder(folder);
                }}
              />
            </Row>
          ) : null}

          {conflicts.length > 0 ? (
            <Card style={{ borderColor: colors.gold }}>
              <Row>
                <Ionicons name="git-compare-outline" size={22} color={colors.gold} />
                <Text style={{ color: colors.text, fontWeight: "800", flex: 1 }}>
                  Preserved note conflict copies
                </Text>
              </Row>
              <MutedText>
                Two devices changed these notes before syncing. Both copies were kept so nothing was
                silently overwritten.
              </MutedText>
              {conflicts.map((conflict) => (
                <View
                  key={conflict.id}
                  style={{
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: colors.border,
                    paddingTop: 10,
                    gap: 5,
                  }}
                >
                  <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 12 }}>
                    {conflict.note_id}
                  </Text>
                  <Text style={{ color: colors.muted, lineHeight: 19 }}>
                    <Text style={{ fontWeight: "800", color: colors.text }}>This device: </Text>
                    {String(conflict.local_payload.body ?? "(no body)")}
                  </Text>
                  <Text style={{ color: colors.muted, lineHeight: 19 }}>
                    <Text style={{ fontWeight: "800", color: colors.text }}>Other device: </Text>
                    {String(conflict.remote_payload.body ?? "(no body)")}
                  </Text>
                  <AppButton
                    title="Dismiss conflict record"
                    variant="secondary"
                    compact
                    onPress={() => void dismissConflict(conflict)}
                  />
                </View>
              ))}
            </Card>
          ) : null}

          {visibleNotes.length === 0 ? (
            <EmptyState
              title={notes.length === 0 ? "No notes yet" : "No notes in this folder"}
              icon="document-text-outline"
              action={<AppButton title="Write your first note" onPress={startNew} />}
            >
              Notes can be linked to a verse from the reader or written as a personal study note.
            </EmptyState>
          ) : (
            <View style={{ gap: 10 }}>
              {visibleNotes.map((note) => (
                <Card key={note.id}>
                  <Row style={uiStyles.rowBetween}>
                    <Text style={{ color: colors.text, fontWeight: "800", fontSize: 16, flex: 1 }}>
                      {note.title || note.reference || "Note"}
                    </Text>
                    {note.folder_id ? (
                      <Chip
                        label={folderById.get(note.folder_id)?.name ?? "Folder"}
                        selected={false}
                        onPress={() => setFilter(note.folder_id!)}
                      />
                    ) : null}
                  </Row>
                  <Text style={{ color: colors.text, lineHeight: 22 }}>{note.body}</Text>
                  <Row style={uiStyles.rowBetween}>
                    <Text style={{ color: colors.subtle, fontSize: 11 }}>
                      {note.reference ?? "Personal note"} · {formatRelativeTime(note.updated_at)}
                    </Text>
                    <Row>
                      {note.verse_id ? (
                        <AppButton
                          title="Read verse"
                          variant="ghost"
                          compact
                          onPress={() =>
                            router.push(`/read?verseId=${encodeURIComponent(note.verse_id!)}`)
                          }
                        />
                      ) : null}
                      <AppButton
                        title="Edit"
                        variant="secondary"
                        compact
                        onPress={() =>
                          setEditor({
                            note,
                            title: note.title ?? "",
                            body: note.body,
                            folderId: note.folder_id,
                          })
                        }
                      />
                    </Row>
                  </Row>
                </Card>
              ))}
            </View>
          )}
        </>
      )}

      <Sheet
        visible={editor !== null}
        onClose={() => {
          setEditor(null);
          setError(null);
        }}
        title={editor?.note ? "Edit note" : "New note"}
        footer={
          editor ? (
            <>
              {editor.note ? (
                <AppButton
                  title="Delete"
                  variant="danger"
                  compact
                  onPress={() => deleteNote(editor.note!)}
                />
              ) : null}
              <AppButton title="Cancel" variant="ghost" onPress={() => setEditor(null)} />
              <AppButton title="Save note" compact loading={busy} onPress={() => void saveNote()} />
            </>
          ) : null
        }
      >
        {editor ? (
          <View style={{ gap: 14 }}>
            {editor.note?.reference ? (
              <MutedText>{editor.note.reference}</MutedText>
            ) : (
              <MutedText>Personal study note</MutedText>
            )}
            {error ? (
              <Text accessibilityRole="alert" style={{ color: colors.danger }}>
                {error}
              </Text>
            ) : null}
            <Field label="Title (optional)">
              <AppTextInput
                value={editor.title}
                onChangeText={(title) => setEditor({ ...editor, title })}
                placeholder="A short heading"
                maxLength={200}
              />
            </Field>
            <Field label="Note">
              <AppTextInput
                value={editor.body}
                onChangeText={(body) => setEditor({ ...editor, body })}
                multiline
                placeholder="What is standing out to you?"
                style={{ minHeight: 180 }}
              />
            </Field>
            <Field label="Folder">
              <Row>
                <Chip
                  label="No folder"
                  selected={editor.folderId === null}
                  onPress={() => setEditor({ ...editor, folderId: null })}
                />
                {folders.map((folder) => (
                  <Chip
                    key={folder.id}
                    label={folder.name}
                    selected={editor.folderId === folder.id}
                    onPress={() => setEditor({ ...editor, folderId: folder.id })}
                  />
                ))}
              </Row>
            </Field>
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}
