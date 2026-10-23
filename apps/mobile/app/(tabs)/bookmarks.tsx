import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { LocalBookmark, LocalHighlight, LocalNote } from "@holyword/offline";
import { useApp } from "@/components/app-provider";
import {
  AppButton,
  Card,
  EmptyState,
  PageHeader,
  Row,
  Screen,
  SyncBadge,
  styles as uiStyles,
} from "@/components/ui";
import { formatRelativeTime, verseReference } from "@/lib/format";

type Segment = "bookmarks" | "highlights" | "notes";

export default function BookmarksScreen() {
  const { runtime, colors, studyRevision, bumpStudy, notify } = useApp();
  const router = useRouter();
  const [segment, setSegment] = useState<Segment>("bookmarks");
  const [bookmarks, setBookmarks] = useState<LocalBookmark[]>([]);
  const [highlights, setHighlights] = useState<LocalHighlight[]>([]);
  const [notes, setNotes] = useState<LocalNote[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!runtime) return;
    const [nextBookmarks, nextHighlights, nextNotes] = await Promise.all([
      runtime.listBookmarks(),
      runtime.listHighlights(),
      runtime.listNotes(),
    ]);
    setBookmarks(nextBookmarks.sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
    setHighlights(nextHighlights.sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
    setNotes(nextNotes.sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
    setLoaded(true);
  }, [runtime]);

  useFocusEffect(
    useCallback(() => {
      void load().catch(() => setLoaded(true));
    }, [load, studyRevision]),
  );

  function openVerse(verseId: string, versionId: string) {
    router.push(
      `/read?version=${encodeURIComponent(versionId)}&verseId=${encodeURIComponent(verseId)}`,
    );
  }

  async function removeBookmark(bookmark: LocalBookmark) {
    if (!runtime) return;
    await runtime.studyStore.deleteBookmark(bookmark.id);
    runtime.scheduleSync();
    bumpStudy();
    await load();
    notify("Bookmark removed.");
  }

  async function removeHighlight(highlight: LocalHighlight) {
    if (!runtime) return;
    await runtime.studyStore.deleteHighlight(highlight.id);
    runtime.scheduleSync();
    bumpStudy();
    await load();
    notify("Highlight removed.");
  }

  const counts: Record<Segment, number> = {
    bookmarks: bookmarks.length,
    highlights: highlights.length,
    notes: notes.length,
  };

  return (
    <Screen>
      <PageHeader
        eyebrow="Your study"
        title="Bookmarks and highlights"
        description="Everything here is stored on this device and syncs to your account when you are online."
        action={<SyncBadge detailed />}
      />

      <View
        style={{
          flexDirection: "row",
          backgroundColor: colors.surfaceAlt,
          borderRadius: 12,
          padding: 4,
          gap: 4,
        }}
      >
        {(["bookmarks", "highlights", "notes"] as const).map((value) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityState={{ selected: segment === value }}
            onPress={() => setSegment(value)}
            style={{
              flex: 1,
              borderRadius: 9,
              paddingVertical: 9,
              backgroundColor: segment === value ? colors.surface : "transparent",
              alignItems: "center",
            }}
          >
            <Text
              style={{
                color: segment === value ? colors.text : colors.muted,
                fontWeight: "700",
                fontSize: 13,
                textTransform: "capitalize",
              }}
            >
              {value} {counts[value] > 0 ? counts[value] : ""}
            </Text>
          </Pressable>
        ))}
      </View>

      {!loaded ? (
        <Text style={{ color: colors.muted }}>Loading your saved study…</Text>
      ) : segment === "bookmarks" ? (
        bookmarks.length === 0 ? (
          <EmptyState
            title="No bookmarks yet"
            icon="bookmark-outline"
            action={<AppButton title="Open the reader" onPress={() => router.push("/read")} />}
          >
            While reading, tap a verse and choose Bookmark.
          </EmptyState>
        ) : (
          <Card style={{ gap: 0 }}>
            {bookmarks.map((bookmark, index) => (
              <View
                key={bookmark.id}
                style={[
                  listRow,
                  index > 0 && {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: colors.border,
                  },
                ]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${bookmark.label || verseReference(bookmark.verse_id)}`}
                  onPress={() => openVerse(bookmark.verse_id, bookmark.version_id)}
                  style={{ flex: 1, gap: 3 }}
                >
                  <Text style={{ color: colors.text, fontWeight: "800", fontSize: 16 }}>
                    {bookmark.label || verseReference(bookmark.verse_id)}
                  </Text>
                  <Text style={{ color: colors.subtle, fontSize: 12 }}>
                    {bookmark.version_id.toUpperCase()} · saved{" "}
                    {formatRelativeTime(bookmark.updated_at)}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Delete bookmark"
                  hitSlop={8}
                  onPress={() => void removeBookmark(bookmark)}
                  style={{ padding: 6 }}
                >
                  <Ionicons name="trash-outline" size={19} color={colors.danger} />
                </Pressable>
              </View>
            ))}
          </Card>
        )
      ) : segment === "highlights" ? (
        highlights.length === 0 ? (
          <EmptyState title="No highlights yet" icon="color-palette-outline">
            Select verses in the reader and choose one of the five highlighter colours.
          </EmptyState>
        ) : (
          <Card style={{ gap: 0 }}>
            {highlights.map((highlight, index) => (
              <View
                key={highlight.id}
                style={[
                  listRow,
                  index > 0 && {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: colors.border,
                  },
                ]}
              >
                <Pressable
                  accessibilityRole="button"
                  onPress={() => openVerse(highlight.verse_id, highlight.version_id)}
                  style={{ flex: 1, gap: 4 }}
                >
                  <Row>
                    <View
                      style={{
                        width: 13,
                        height: 13,
                        borderRadius: 4,
                        backgroundColor: highlightColor(highlight.color),
                        borderWidth: StyleSheet.hairlineWidth,
                        borderColor: colors.border,
                      }}
                    />
                    <Text style={{ color: colors.text, fontWeight: "800" }}>
                      {verseReference(highlight.verse_id)}
                    </Text>
                  </Row>
                  <Text style={{ color: colors.subtle, fontSize: 12 }}>
                    {highlight.version_id.toUpperCase()} · {highlight.color.replace("-", " ")}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Delete highlight"
                  hitSlop={8}
                  onPress={() => void removeHighlight(highlight)}
                  style={{ padding: 6 }}
                >
                  <Ionicons name="trash-outline" size={19} color={colors.danger} />
                </Pressable>
              </View>
            ))}
          </Card>
        )
      ) : notes.length === 0 ? (
        <EmptyState
          title="No notes yet"
          icon="document-text-outline"
          action={<AppButton title="Write a note" onPress={() => router.push("/notes")} />}
        >
          Open a verse, select it and choose Note. Notes can be organised into folders.
        </EmptyState>
      ) : (
        <>
          <Card style={{ gap: 0 }}>
            {notes.slice(0, 5).map((note, index) => (
              <Pressable
                key={note.id}
                accessibilityRole="button"
                onPress={() => router.push("/notes")}
                style={({ pressed }) => [
                  listRow,
                  index > 0 && {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: colors.border,
                  },
                  { opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ color: colors.text, fontWeight: "800" }}>
                    {note.title || note.reference || "Note"}
                  </Text>
                  <Text numberOfLines={2} style={{ color: colors.muted, lineHeight: 20 }}>
                    {note.body}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.subtle} />
              </Pressable>
            ))}
          </Card>
          <Row style={uiStyles.rowBetween}>
            <Text style={{ color: colors.muted }}>
              {notes.length} note{notes.length === 1 ? "" : "s"} in total
            </Text>
            <AppButton
              title="All notes and folders"
              variant="secondary"
              compact
              onPress={() => router.push("/notes")}
            />
          </Row>
        </>
      )}
    </Screen>
  );
}

const listRow = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  gap: 10,
  paddingVertical: 12,
};

function highlightColor(color: string): string {
  switch (color) {
    case "green":
      return "#8FE3C1";
    case "blue":
      return "#9FC5FF";
    case "pink":
      return "#FFB3C7";
    case "purple":
      return "#C9B3FF";
    default:
      return "#F4B942";
  }
}
