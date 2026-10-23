import { useState } from "react";
import { Text } from "react-native";
import type { BookCode } from "@holyword/core";
import type { LocalFolder } from "@holyword/offline";
import { useApp } from "./app-provider";
import { Sheet } from "./modal";
import { AppButton, AppTextInput, Chip, Field, MutedText, Row } from "./ui";
import { referenceLabel } from "@/lib/format";

export function NoteComposer({
  visible,
  onClose,
  onSaved,
  book,
  chapter,
  verse,
  versionId,
  folders,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  book: BookCode;
  chapter: number;
  verse: number | null;
  versionId: string;
  folders: readonly LocalFolder[];
}) {
  const { runtime, colors, notify } = useApp();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reference = verse ? referenceLabel(book, chapter, verse) : referenceLabel(book, chapter);

  function close() {
    setTitle("");
    setBody("");
    setError(null);
    onClose();
  }

  async function createFolder() {
    if (!runtime || !folderName.trim()) return;
    try {
      const folder = await runtime.studyStore.saveFolder({ name: folderName.trim() });
      setFolderId(folder.id);
      setFolderName("");
      runtime.scheduleSync();
      notify("Folder created.");
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
    }
  }

  async function save() {
    if (!runtime) return;
    if (!body.trim()) {
      setError("Write something in your note before saving.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await runtime.studyStore.saveNote({
        verseId: verse ? `${book}.${chapter}.${verse}` : null,
        reference,
        title: title.trim() || null,
        body: body.trim(),
        folderId,
      });
      runtime.scheduleSync();
      notify("Note saved.");
      await onSaved();
      close();
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} onClose={close} title="Write a note">
      <MutedText>
        {reference} · {versionId.toUpperCase()}
      </MutedText>
      {error ? (
        <Text accessibilityRole="alert" style={{ color: colors.danger }}>
          {error}
        </Text>
      ) : null}
      <Field label="Title (optional)">
        <AppTextInput
          value={title}
          onChangeText={setTitle}
          maxLength={200}
          placeholder="A short heading"
        />
      </Field>
      <Field label="Note">
        <AppTextInput
          value={body}
          onChangeText={setBody}
          multiline
          placeholder="What is standing out to you?"
          style={{ minHeight: 150 }}
        />
      </Field>
      <Field label="Folder">
        <Row>
          <Chip label="No folder" selected={folderId === null} onPress={() => setFolderId(null)} />
          {folders.map((folder) => (
            <Chip
              key={folder.id}
              label={folder.name}
              selected={folderId === folder.id}
              onPress={() => setFolderId(folder.id)}
            />
          ))}
        </Row>
      </Field>
      <Row>
        <AppTextInput
          value={folderName}
          onChangeText={setFolderName}
          placeholder="New folder name"
          style={{ flex: 1 }}
          maxLength={80}
        />
        <AppButton
          title="Create"
          variant="secondary"
          compact
          onPress={() => void createFolder()}
          disabled={!folderName.trim()}
        />
      </Row>
      <Row style={{ justifyContent: "flex-end" }}>
        <AppButton title="Cancel" variant="ghost" onPress={close} />
        <AppButton title="Save note" onPress={() => void save()} loading={busy} />
      </Row>
    </Sheet>
  );
}
