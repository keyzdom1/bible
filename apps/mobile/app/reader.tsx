import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Share,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { BOOKS, CHAPTER_COUNTS, getBook, tryParseVerseId, type BookCode } from "@holyword/core";
import type {
  HighlightColor,
  LocalBookmark,
  LocalFolder,
  LocalHighlight,
  LocalNote,
} from "@holyword/offline";
import { useApp } from "@/components/app-provider";
import { Sheet } from "@/components/modal";
import { NoteComposer } from "@/components/note-composer";
import { AppButton, Chip, EmptyState, Row } from "@/components/ui";
import type { ChapterView, VersionSummary } from "@/lib/mobile-runtime";
import { adjacentChapter, bookName, referenceLabel } from "@/lib/format";

const HIGHLIGHT_COLORS: readonly {
  color: HighlightColor;
  label: string;
  value: string;
}[] = [
  { color: "gold", label: "Gold", value: "#F4B942" },
  { color: "cyan", label: "Cyan", value: "#85DDEA" },
  { color: "emerald", label: "Emerald", value: "#7FDCBF" },
  { color: "royal-red", label: "Royal red", value: "#F29AA6" },
  { color: "purple", label: "Purple", value: "#C6ACF5" },
];

function highlightValue(color: HighlightColor): string {
  return HIGHLIGHT_COLORS.find((entry) => entry.color === color)?.value ?? "#F4B942";
}

function param(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function positiveInt(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export default function ReaderScreen() {
  const {
    runtime,
    preferences,
    colors,
    readingColors,
    fontScale,
    setPreferences,
    refreshPreferences,
    libraryRevision,
    studyRevision,
    bumpStudy,
    notify,
    online,
  } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    version?: string;
    book?: string;
    chapter?: string;
    verse?: string;
    verseId?: string;
  }>();
  const parsedVerse = useMemo(() => {
    const verseId = param(params.verseId);
    return verseId ? tryParseVerseId(verseId) : undefined;
  }, [params.verseId]);
  const last = preferences?.last_location;
  const initialBook = (parsedVerse?.book ??
    getBook(param(params.book))?.code ??
    last?.book ??
    "GEN") as BookCode;
  const initialChapter = Math.min(
    Math.max(1, parsedVerse?.chapter ?? positiveInt(param(params.chapter), last?.chapter ?? 1)),
    CHAPTER_COUNTS[initialBook] ?? 1,
  );
  const focusVerse = (parsedVerse?.verse ?? positiveInt(param(params.verse), 0)) || null;

  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [versionId, setVersionId] = useState(param(params.version));
  const [book, setBook] = useState<BookCode>(initialBook);
  const [chapterNumber, setChapterNumber] = useState(initialChapter);
  const [chapter, setChapter] = useState<ChapterView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(
    focusVerse ? new Set([focusVerse]) : new Set(),
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<"books" | "chapters">("chapters");
  const [pickerBook, setPickerBook] = useState<BookCode>(initialBook);
  const [noteVerse, setNoteVerse] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bookmarks, setBookmarks] = useState<LocalBookmark[]>([]);
  const [highlights, setHighlights] = useState<LocalHighlight[]>([]);
  const [notes, setNotes] = useState<LocalNote[]>([]);
  const [folders, setFolders] = useState<LocalFolder[]>([]);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const positions = useRef<Map<number, number>>(new Map());
  const initialFocus = useRef(focusVerse);

  useEffect(() => {
    if (!runtime) return;
    let active = true;
    void runtime.listVersionSummaries().then((next) => {
      if (!active) return;
      setVersions(next);
      setVersionId((current) => {
        if (current && next.some((entry) => entry.versionId === current)) return current;
        const installed = next.filter((entry) => entry.installed);
        const preferred = installed.find(
          (entry) => entry.versionId === preferences?.active_version_id,
        );
        return preferred?.versionId ?? installed[0]?.versionId ?? next[0]?.versionId ?? "";
      });
    });
    return () => {
      active = false;
    };
  }, [runtime, preferences?.active_version_id, libraryRevision]);

  useEffect(() => {
    if (!runtime || !versionId) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setLoadError(null);
    setActionError(null);
    void runtime
      .loadChapter(versionId, book, chapterNumber)
      .then((next) => {
        if (!active) return;
        setChapter(next);
        positions.current.clear();
        setSelected(initialFocus.current ? new Set([initialFocus.current]) : new Set());
        void runtime
          .saveReadingPosition(versionId, book, chapterNumber, initialFocus.current)
          .then(() => refreshPreferences())
          .catch(() => undefined);
        initialFocus.current = null;
      })
      .catch((errorValue) => {
        if (!active) return;
        setChapter(null);
        setLoadError(errorValue instanceof Error ? errorValue.message : String(errorValue));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [runtime, versionId, book, chapterNumber, refreshPreferences]);

  const loadAnnotations = useCallback(async () => {
    if (!runtime) return;
    const [nextBookmarks, nextHighlights, nextNotes, nextFolders] = await Promise.all([
      runtime.listBookmarks(),
      runtime.listHighlights(),
      runtime.listNotes(),
      runtime.listFolders(),
    ]);
    setBookmarks(nextBookmarks);
    setHighlights(nextHighlights);
    setNotes(nextNotes);
    setFolders(nextFolders);
  }, [runtime]);

  useEffect(() => {
    void loadAnnotations();
  }, [loadAnnotations, studyRevision]);

  useEffect(() => {
    if (loading || !chapter) return;
    const verse = focusVerse;
    if (!verse) return;
    const timer = setTimeout(() => {
      const y = positions.current.get(verse);
      if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: true });
    }, 350);
    return () => clearTimeout(timer);
  }, [chapter, focusVerse, loading]);

  const chapterBookmarks = useMemo(
    () =>
      bookmarks.filter(
        (entry) =>
          entry.version_id === versionId && entry.verse_id.startsWith(`${book}.${chapterNumber}.`),
      ),
    [bookmarks, versionId, book, chapterNumber],
  );
  const chapterHighlights = useMemo(
    () =>
      highlights.filter(
        (entry) =>
          entry.version_id === versionId && entry.verse_id.startsWith(`${book}.${chapterNumber}.`),
      ),
    [highlights, versionId, book, chapterNumber],
  );
  const chapterNotes = useMemo(
    () =>
      notes.filter(
        (entry) =>
          entry.verse_id?.startsWith(`${book}.${chapterNumber}.`) ||
          entry.reference?.startsWith(referenceLabel(book, chapterNumber)),
      ),
    [notes, book, chapterNumber],
  );
  const bookmarkedVerses = useMemo(
    () => new Set(chapterBookmarks.map((entry) => Number(entry.verse_id.split(".")[2]))),
    [chapterBookmarks],
  );
  const notedVerses = useMemo(
    () =>
      new Set(
        chapterNotes
          .map((entry) => Number(entry.verse_id?.split(".")[2]))
          .filter((value) => Number.isFinite(value) && value > 0),
      ),
    [chapterNotes],
  );
  const highlightByVerse = useMemo(() => {
    const map = new Map<number, LocalHighlight>();
    for (const highlight of chapterHighlights) {
      const verse = Number(highlight.verse_id.split(".")[2]);
      if (!map.has(verse)) map.set(verse, highlight);
    }
    return map;
  }, [chapterHighlights]);

  const currentVersion = versions.find((entry) => entry.versionId === versionId);
  const selectedNumbers = chapter
    ? chapter.verses.filter((entry) => selected.has(entry.verse)).map((entry) => entry.verse)
    : [];
  const availableVersions = versions.filter(
    (entry) => entry.installed || entry.licenceStatus === "public-domain",
  );

  function go(nextBook: BookCode, nextChapter: number, nextVersion = versionId) {
    setBook(nextBook);
    setChapterNumber(nextChapter);
    setVersionId(nextVersion);
    setSelected(new Set());
    setPickerOpen(false);
    setActionError(null);
  }

  function move(direction: 1 | -1) {
    const next = adjacentChapter(book, chapterNumber, direction);
    if (next) go(next.book, next.chapter);
  }

  function openPicker() {
    setPickerBook(book);
    setPickerMode("chapters");
    setPickerOpen(true);
  }

  async function toggleBookmark() {
    if (!runtime || selectedNumbers.length === 0) return;
    setBusy(true);
    setActionError(null);
    try {
      const allMarked = selectedNumbers.every((verse) => bookmarkedVerses.has(verse));
      for (const verse of selectedNumbers) {
        const existing = chapterBookmarks.find(
          (entry) => Number(entry.verse_id.split(".")[2]) === verse,
        );
        if (allMarked && existing) {
          await runtime.studyStore.deleteBookmark(existing.id);
        } else if (!allMarked && !existing) {
          await runtime.studyStore.saveBookmark({
            verseId: `${book}.${chapterNumber}.${verse}`,
            versionId,
            label: referenceLabel(book, chapterNumber, verse),
          });
        }
      }
      runtime.scheduleSync();
      bumpStudy();
      await loadAnnotations();
      notify(allMarked ? "Bookmark removed." : "Bookmarked.");
    } catch (errorValue) {
      setActionError(errorValue instanceof Error ? errorValue.message : String(errorValue));
    } finally {
      setBusy(false);
    }
  }

  async function applyHighlight(color: HighlightColor) {
    if (!runtime || selectedNumbers.length === 0) return;
    setBusy(true);
    setActionError(null);
    try {
      for (const verse of selectedNumbers) {
        const existing = chapterHighlights.find(
          (entry) => Number(entry.verse_id.split(".")[2]) === verse,
        );
        await runtime.studyStore.saveHighlight({
          ...(existing ? { id: existing.id } : {}),
          verseId: `${book}.${chapterNumber}.${verse}`,
          versionId,
          color,
        });
      }
      runtime.scheduleSync();
      bumpStudy();
      await loadAnnotations();
      notify("Highlight saved.");
    } catch (errorValue) {
      setActionError(errorValue instanceof Error ? errorValue.message : String(errorValue));
    } finally {
      setBusy(false);
    }
  }

  async function copySelection(mode: "copy" | "share") {
    if (!runtime || !chapter || selectedNumbers.length === 0) return;
    setBusy(true);
    setActionError(null);
    try {
      const text = await runtime.citation(chapter, selectedNumbers, mode);
      if (mode === "copy") {
        await Clipboard.setStringAsync(text);
        notify("Copied with reference and licence attribution.");
      } else {
        await Share.share({ message: text });
      }
    } catch (errorValue) {
      setActionError(errorValue instanceof Error ? errorValue.message : String(errorValue));
    } finally {
      setBusy(false);
    }
  }

  function cycleReadingTheme() {
    const current = preferences?.reading_theme ?? "light";
    const next = current === "light" ? "sepia" : current === "sepia" ? "dark" : "light";
    void setPreferences({ readingTheme: next });
  }

  const reading = chapter ?? null;
  const title = `${bookName(book)} ${chapterNumber}`;
  const allSelectedBookmarked =
    selectedNumbers.length > 0 && selectedNumbers.every((verse) => bookmarkedVerses.has(verse));

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: readingColors.background }}
      edges={["top", "bottom"]}
    >
      <StatusBar style={preferences?.reading_theme === "dark" ? "light" : "dark"} />
      <View
        style={{
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: readingColors.border,
          gap: 6,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => router.back()}
            style={{ padding: 8 }}
          >
            <Ionicons name="chevron-back" size={24} color={readingColors.text} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose book, chapter or version"
            onPress={openPicker}
            style={{ flex: 1, alignItems: "center" }}
          >
            <Row style={{ justifyContent: "center" }}>
              <Text
                style={{
                  color: readingColors.text,
                  fontSize: 18,
                  fontWeight: "800",
                  textAlign: "center",
                }}
              >
                {title}
              </Text>
              <Ionicons name="chevron-down" size={17} color={readingColors.muted} />
            </Row>
            <Text style={{ color: readingColors.muted, fontSize: 11 }}>
              {currentVersion?.abbreviation ?? versionId.toUpperCase()} ·{" "}
              {reading?.source === "local" ? "Downloaded" : reading ? "Online" : "—"}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Reading theme: ${preferences?.reading_theme ?? "light"}`}
            onPress={cycleReadingTheme}
            style={{ padding: 8 }}
          >
            <Ionicons
              name={
                preferences?.reading_theme === "dark"
                  ? "moon"
                  : preferences?.reading_theme === "sepia"
                    ? "sunny"
                    : "contrast-outline"
              }
              size={22}
              color={readingColors.text}
            />
          </Pressable>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6, alignItems: "center", paddingRight: 6 }}
            style={{ flex: 1 }}
          >
            {availableVersions.map((version) => (
              <Chip
                key={version.versionId}
                label={version.abbreviation}
                selected={version.versionId === versionId}
                onPress={() => go(book, chapterNumber, version.versionId)}
              />
            ))}
            {availableVersions.length === 0 ? (
              <Text style={{ color: readingColors.muted, fontSize: 12 }}>No version selected</Text>
            ) : null}
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Decrease text size"
            onPress={() => void setPreferences({ fontScale: Math.max(0.85, fontScale - 0.05) })}
            style={{ padding: 7 }}
          >
            <Text style={{ color: readingColors.text, fontWeight: "800", fontSize: 13 }}>A−</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Increase text size"
            onPress={() => void setPreferences({ fontScale: Math.min(1.6, fontScale + 0.05) })}
            style={{ padding: 7 }}
          >
            <Text style={{ color: readingColors.text, fontWeight: "800", fontSize: 18 }}>A+</Text>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
          <ActivityIndicator color={readingColors.text} />
          <Text style={{ color: readingColors.muted }}>Opening {title}…</Text>
        </View>
      ) : loadError ? (
        <View style={{ flex: 1, padding: 22, gap: 14, justifyContent: "center" }}>
          <EmptyState title="This passage could not be opened" icon="cloud-offline-outline">
            {loadError}
          </EmptyState>
          <AppButton
            title={online ? "Try again" : "Open library"}
            onPress={() => {
              if (online) {
                setChapterNumber((value) => value);
                setLoadError(null);
                void runtime
                  ?.loadChapter(versionId, book, chapterNumber)
                  .then((next) => {
                    setChapter(next);
                  })
                  .catch((errorValue) =>
                    setLoadError(
                      errorValue instanceof Error ? errorValue.message : String(errorValue),
                    ),
                  );
              } else {
                router.push("/library");
              }
            }}
          />
        </View>
      ) : !reading ? (
        <View style={{ flex: 1, justifyContent: "center", padding: 22 }}>
          {versions.length === 0 ? (
            <EmptyState
              title="No Bible version is available"
              icon="download-outline"
              action={
                <AppButton
                  title="Open the offline library"
                  onPress={() => router.push("/library")}
                />
              }
            >
              Download the public-domain King James Version to read and search offline.
            </EmptyState>
          ) : (
            <EmptyState title="Choose a book and chapter" icon="book-outline">
              Use the chapter menu above to begin reading.
            </EmptyState>
          )}
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 140 }}
          showsVerticalScrollIndicator={false}
        >
          <Text
            accessibilityRole="header"
            style={{
              color: readingColors.text,
              fontSize: 28 * fontScale,
              lineHeight: 35 * fontScale,
              fontWeight: "800",
              marginBottom: 4,
            }}
          >
            {title}
          </Text>
          <Text style={{ color: readingColors.muted, marginBottom: 16, fontSize: 12 }}>
            {currentVersion?.name ?? versionId} · Tap a verse to select it
          </Text>
          {reading.verses.map((verse) => {
            const highlight = highlightByVerse.get(verse.verse);
            const isSelected = selected.has(verse.verse);
            return (
              <View
                key={verse.id}
                onLayout={(event) => {
                  positions.current.set(verse.verse, event.nativeEvent.layout.y);
                }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`Verse ${verse.verse}${isSelected ? ", selected" : ""}`}
                  onPress={() => {
                    setSelected((current) => {
                      const next = new Set(current);
                      if (next.has(verse.verse)) next.delete(verse.verse);
                      else next.add(verse.verse);
                      return next;
                    });
                    setActionError(null);
                  }}
                  style={{
                    flexDirection: "row",
                    gap: 8,
                    paddingVertical: 5,
                    paddingHorizontal: 7,
                    marginHorizontal: -7,
                    borderRadius: 8,
                    borderWidth: isSelected ? 1.5 : 0,
                    borderColor: isSelected ? readingColors.text : "transparent",
                    backgroundColor: highlight
                      ? `${highlightValue(highlight.color)}55`
                      : isSelected
                        ? readingColors.highlight
                        : "transparent",
                  }}
                >
                  <View
                    style={{ flexDirection: "row", alignItems: "center", gap: 3, paddingTop: 3 }}
                  >
                    <Text
                      style={{
                        color: readingColors.muted,
                        fontSize: 11 * fontScale,
                        fontWeight: "800",
                        minWidth: 17,
                      }}
                    >
                      {verse.verse}
                    </Text>
                    {bookmarkedVerses.has(verse.verse) ? (
                      <Ionicons name="bookmark" size={9} color={readingColors.muted} />
                    ) : null}
                    {notedVerses.has(verse.verse) ? (
                      <Ionicons name="document-text" size={9} color={readingColors.muted} />
                    ) : null}
                  </View>
                  <Text
                    style={{
                      color: readingColors.text,
                      fontSize: 18 * fontScale,
                      lineHeight: 29 * fontScale,
                      flex: 1,
                    }}
                  >
                    {verse.text}
                  </Text>
                </Pressable>
              </View>
            );
          })}
          <View
            style={{
              marginTop: 26,
              paddingTop: 14,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: readingColors.border,
              gap: 10,
            }}
          >
            <Text style={{ color: readingColors.muted, fontSize: 12, lineHeight: 18 }}>
              {reading.copyright}
            </Text>
            <Text style={{ color: readingColors.muted, fontSize: 12, lineHeight: 18 }}>
              {reading.attribution}
            </Text>
            <Row style={{ justifyContent: "space-between", marginTop: 6 }}>
              <AppButton
                title={adjacentChapter(book, chapterNumber, -1) ? "Previous" : "Start"}
                variant="secondary"
                compact
                disabled={!adjacentChapter(book, chapterNumber, -1)}
                icon={<Ionicons name="chevron-back" size={16} color={colors.primary} />}
                onPress={() => move(-1)}
              />
              <AppButton
                title={adjacentChapter(book, chapterNumber, 1) ? "Next" : "End"}
                variant="secondary"
                compact
                disabled={!adjacentChapter(book, chapterNumber, 1)}
                onPress={() => move(1)}
              />
            </Row>
          </View>
        </ScrollView>
      )}

      {selectedNumbers.length > 0 ? (
        <View
          style={{
            position: "absolute",
            left: 12,
            right: 12,
            bottom: Math.max(10, insets.bottom + 6),
            backgroundColor: colors.surface,
            borderRadius: 18,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
            padding: 12,
            gap: 10,
            elevation: 8,
            shadowColor: "#000",
            shadowOpacity: 0.18,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
          }}
        >
          <Row style={{ justifyContent: "space-between" }}>
            <Text style={{ color: colors.text, fontWeight: "800" }}>
              {selectedNumbers.length} verse{selectedNumbers.length === 1 ? "" : "s"} selected
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear selection"
              onPress={() => setSelected(new Set())}
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={23} color={colors.muted} />
            </Pressable>
          </Row>
          <Row>
            {HIGHLIGHT_COLORS.map((entry) => {
              const active =
                selectedNumbers.length === 1 &&
                highlightByVerse.get(selectedNumbers[0]!)?.color === entry.color;
              return (
                <Pressable
                  key={entry.color}
                  accessibilityRole="button"
                  accessibilityLabel={`Highlight ${entry.label.toLowerCase()}`}
                  accessibilityState={{ selected: active }}
                  onPress={() => void applyHighlight(entry.color)}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    backgroundColor: entry.value,
                    borderWidth: active ? 3 : 1,
                    borderColor: active ? colors.text : colors.border,
                  }}
                />
              );
            })}
            <Text style={{ color: colors.subtle, fontSize: 11 }}>Five highlight colours</Text>
          </Row>
          {actionError ? (
            <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 12 }}>
              {actionError}
            </Text>
          ) : null}
          <Row style={{ justifyContent: "space-between" }}>
            <ActionButton
              icon={allSelectedBookmarked ? "bookmark" : "bookmark-outline"}
              label={allSelectedBookmarked ? "Unmark" : "Bookmark"}
              onPress={() => void toggleBookmark()}
              disabled={busy}
            />
            <ActionButton
              icon="document-text-outline"
              label="Note"
              onPress={() => {
                if (selectedNumbers.length !== 1) {
                  setActionError("Select one verse to write a note.");
                  return;
                }
                setNoteVerse(selectedNumbers[0]!);
              }}
              disabled={selectedNumbers.length !== 1 || busy}
            />
            <ActionButton
              icon="copy-outline"
              label="Copy"
              onPress={() => void copySelection("copy")}
              disabled={busy}
            />
            <ActionButton
              icon="share-outline"
              label="Share"
              onPress={() => void copySelection("share")}
              disabled={busy}
            />
          </Row>
        </View>
      ) : null}

      <Sheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={pickerMode === "books" ? "Choose a book" : title}
        fullHeight
      >
        {pickerMode === "chapters" ? (
          <>
            <AppButton
              title="Choose another book"
              variant="secondary"
              icon={<Ionicons name="list-outline" size={18} color={colors.primary} />}
              onPress={() => setPickerMode("books")}
            />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9 }}>
              {Array.from({ length: CHAPTER_COUNTS[pickerBook] ?? 1 }, (_, index) => index + 1).map(
                (chapterValue) => (
                  <Pressable
                    key={chapterValue}
                    accessibilityRole="button"
                    accessibilityLabel={`Chapter ${chapterValue}`}
                    accessibilityState={{
                      selected: pickerBook === book && chapterValue === chapterNumber,
                    }}
                    onPress={() => go(pickerBook, chapterValue)}
                    style={{
                      width: 54,
                      height: 46,
                      borderRadius: 11,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor:
                        pickerBook === book && chapterValue === chapterNumber
                          ? colors.primary
                          : colors.surfaceAlt,
                    }}
                  >
                    <Text
                      style={{
                        color:
                          pickerBook === book && chapterValue === chapterNumber
                            ? colors.onPrimary
                            : colors.text,
                        fontWeight: "700",
                      }}
                    >
                      {chapterValue}
                    </Text>
                  </Pressable>
                ),
              )}
            </View>
          </>
        ) : (
          <View style={{ gap: 8 }}>
            {BOOKS.map((entry) => (
              <Pressable
                key={entry.code}
                accessibilityRole="button"
                onPress={() => {
                  setPickerBook(entry.code);
                  setPickerMode("chapters");
                }}
                style={{
                  paddingVertical: 13,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  backgroundColor: entry.code === book ? colors.primarySoft : colors.surface,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: colors.border,
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <Text
                  style={{
                    color: entry.code === book ? colors.primary : colors.text,
                    fontWeight: "700",
                  }}
                >
                  {entry.name}
                </Text>
                <Text style={{ color: colors.subtle, fontSize: 12 }}>
                  {entry.chapterCount} chapter{entry.chapterCount === 1 ? "" : "s"}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </Sheet>

      {reading ? (
        <NoteComposer
          visible={noteVerse !== null}
          onClose={() => setNoteVerse(null)}
          onSaved={async () => {
            bumpStudy();
            await loadAnnotations();
          }}
          book={book}
          chapter={chapterNumber}
          verse={noteVerse}
          versionId={versionId}
          folders={folders}
        />
      ) : null}
    </SafeAreaView>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useApp();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        gap: 3,
        paddingHorizontal: 6,
        paddingVertical: 4,
        opacity: disabled ? 0.4 : pressed ? 0.65 : 1,
      })}
    >
      <Ionicons name={icon} size={21} color={colors.primary} />
      <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}
