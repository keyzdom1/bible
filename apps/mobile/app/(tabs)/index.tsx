import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { LocalVersion, LocalReadingProgress, LocalBookmark } from "@holyword/offline";
import { useApp } from "@/components/app-provider";
import {
  AppButton,
  Card,
  EmptyState,
  MutedText,
  PageHeader,
  ProgressBar,
  Row,
  Screen,
  SectionHeading,
  SyncBadge,
  styles,
} from "@/components/ui";
import type { PlanView } from "@/lib/mobile-runtime";
import { formatBytes, formatRelativeTime, referenceLabel, verseReference } from "@/lib/format";

interface HomeData {
  readonly versions: LocalVersion[];
  readonly progress: readonly {
    version: LocalVersion;
    progress: LocalReadingProgress | undefined;
  }[];
  readonly plans: PlanView[];
  readonly bookmarks: LocalBookmark[];
}

export default function HomeScreen() {
  const { runtime, session, preferences, colors, libraryRevision, studyRevision, online } =
    useApp();
  const router = useRouter();
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!runtime) return;
    try {
      const [versions, progress, plans, bookmarks] = await Promise.all([
        runtime.listInstalledVersions(),
        runtime.listReadingProgress(),
        runtime.plansFromCache(),
        runtime.listBookmarks(),
      ]);
      setData({
        versions,
        progress,
        plans,
        bookmarks: bookmarks.sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 3),
      });
      setError(null);
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
    }
  }, [runtime]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load, libraryRevision, studyRevision]),
  );

  if (!data) {
    return (
      <Screen>
        <PageHeader eyebrow="HolyWord" title="Opening your library" />
        <MutedText>Reading your local downloads and study progress…</MutedText>
      </Screen>
    );
  }

  const installedIds = new Set(data.versions.map((version) => version.version_id));
  const active =
    data.versions.find((version) => version.version_id === preferences?.active_version_id) ??
    data.versions[0];
  const location = preferences?.last_location;
  const continueTarget =
    location && installedIds.has(location.versionId)
      ? location
      : active
        ? { versionId: active.version_id, book: "GEN" as const, chapter: 1 }
        : null;
  const activePlan = data.plans
    .filter((plan) => plan.completedDays.length > 0 && plan.completedDays.length < plan.day_count)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  const totalBytes = data.versions.reduce((total, version) => total + version.storage_bytes, 0);

  function openReading(versionId: string, book: string, chapter: number, verse?: number): void {
    router.push(
      `/read?version=${encodeURIComponent(versionId)}&book=${book}&chapter=${chapter}${
        verse ? `&verse=${verse}` : ""
      }`,
    );
  }

  return (
    <Screen>
      <PageHeader
        eyebrow={`Welcome${session?.displayName ? `, ${session.displayName.split(" ")[0]}` : ""}`}
        title="Scripture, ready when you are"
        description="Read and study offline. Your notes and progress follow you when you reconnect."
        action={<SyncBadge detailed />}
      />

      {!online ? (
        <Card style={{ backgroundColor: colors.primarySoft }}>
          <Row>
            <Ionicons name="cloud-offline-outline" size={22} color={colors.primary} />
            <Text style={{ color: colors.text, fontWeight: "700", flex: 1 }}>
              You are offline. Downloaded reading, search and study remain available.
            </Text>
          </Row>
        </Card>
      ) : null}

      {error ? <Text style={{ color: colors.danger, lineHeight: 21 }}>{error}</Text> : null}

      {data.versions.length === 0 ? (
        <Card style={{ gap: 14 }}>
          <View style={{ alignItems: "center", paddingVertical: 8, gap: 10 }}>
            <View
              style={{
                width: 58,
                height: 58,
                borderRadius: 29,
                backgroundColor: colors.primarySoft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="download-outline" size={28} color={colors.primary} />
            </View>
            <Text
              style={{ color: colors.text, fontSize: 20, fontWeight: "800", textAlign: "center" }}
            >
              Download the King James Version
            </Text>
            <MutedText>
              The KJV is public domain. Downloads are resumable, checksum-verified and searchable
              entirely on this device.
            </MutedText>
          </View>
          <AppButton title="Open the library" onPress={() => router.push("/library")} />
        </Card>
      ) : (
        <>
          <Card style={{ gap: 14 }}>
            <Row style={styles.rowBetween}>
              <View style={{ gap: 3, flex: 1 }}>
                <Text style={{ color: colors.subtle, fontSize: 11, fontWeight: "800" }}>
                  CONTINUE READING
                </Text>
                <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800" }}>
                  {continueTarget
                    ? referenceLabel(
                        continueTarget.book,
                        continueTarget.chapter,
                        continueTarget.verse,
                      )
                    : "Start in Genesis"}
                </Text>
                <Text style={{ color: colors.muted }}>
                  {active?.abbreviation ?? "KJV"} · Last position saved on this device
                </Text>
              </View>
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 16,
                  backgroundColor: colors.primarySoft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="book-outline" size={25} color={colors.primary} />
              </View>
            </Row>
            <AppButton
              title="Continue reading"
              onPress={() => {
                if (!continueTarget) return;
                openReading(
                  continueTarget.versionId,
                  continueTarget.book,
                  continueTarget.chapter,
                  continueTarget.verse,
                );
              }}
            />
          </Card>

          {activePlan ? (
            <Card onPress={() => router.push(`/plan?id=${encodeURIComponent(activePlan.id)}`)}>
              <Row style={styles.rowBetween}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ color: colors.subtle, fontSize: 11, fontWeight: "800" }}>
                    READING PLAN
                  </Text>
                  <Text style={{ color: colors.text, fontSize: 17, fontWeight: "800" }}>
                    {activePlan.title}
                  </Text>
                </View>
                <Ionicons name="calendar-outline" size={22} color={colors.primary} />
              </Row>
              <ProgressBar fraction={activePlan.completedDays.length / activePlan.day_count} />
              <Text style={{ color: colors.muted }}>
                {activePlan.completedDays.length} of {activePlan.day_count} days complete
              </Text>
            </Card>
          ) : null}

          <SectionHeading
            title="Your study"
            action={
              <Text
                accessibilityRole="button"
                onPress={() => router.push("/bookmarks")}
                style={{ color: colors.primary, fontWeight: "700" }}
              >
                See all
              </Text>
            }
          />
          {data.bookmarks.length === 0 ? (
            <Card>
              <EmptyState title="No bookmarks yet" icon="bookmark-outline">
                While reading, tap a verse to bookmark it, highlight it or write a note.
              </EmptyState>
            </Card>
          ) : (
            <Card style={{ gap: 0 }}>
              {data.bookmarks.map((bookmark, index) => (
                <View
                  key={bookmark.id}
                  style={{
                    paddingVertical: 11,
                    borderTopWidth: index === 0 ? 0 : 1,
                    borderTopColor: colors.border,
                  }}
                >
                  <Text
                    accessibilityRole="button"
                    onPress={() =>
                      router.push(
                        `/read?version=${encodeURIComponent(bookmark.version_id)}&verseId=${encodeURIComponent(bookmark.verse_id)}`,
                      )
                    }
                    style={{ color: colors.text, fontWeight: "700" }}
                  >
                    {bookmark.label || verseReference(bookmark.verse_id)}
                  </Text>
                  <Text style={{ color: colors.subtle, fontSize: 12, marginTop: 2 }}>
                    Saved {formatRelativeTime(bookmark.updated_at)}
                  </Text>
                </View>
              ))}
            </Card>
          )}

          <SectionHeading title="Library" />
          <Card>
            <Row style={styles.rowBetween}>
              <View style={{ gap: 2 }}>
                <Text style={{ color: colors.text, fontWeight: "800", fontSize: 16 }}>
                  {data.versions.length} downloaded{" "}
                  {data.versions.length === 1 ? "version" : "versions"}
                </Text>
                <Text style={{ color: colors.subtle, fontSize: 12 }}>
                  {formatBytes(totalBytes)} of Scripture and search indexes
                </Text>
              </View>
              <AppButton
                title="Manage"
                variant="secondary"
                compact
                onPress={() => router.push("/library")}
              />
            </Row>
          </Card>

          {data.progress.some((entry) => entry.progress) ? (
            <>
              <SectionHeading title="Reading progress" />
              <Card style={{ gap: 10 }}>
                {data.progress.map(({ version, progress }) => (
                  <View key={version.version_id} style={{ gap: 6 }}>
                    <Row style={styles.rowBetween}>
                      <Text style={{ color: colors.text, fontWeight: "700" }}>
                        {version.abbreviation}
                      </Text>
                      <Text style={{ color: colors.subtle, fontSize: 12 }}>
                        {progress
                          ? referenceLabel(progress.book, progress.chapter, progress.verse)
                          : "Not started"}
                      </Text>
                    </Row>
                    {progress ? (
                      <ProgressBar
                        fraction={Math.min(
                          1,
                          (progress.chapter - 1) / Math.max(1, version.manifest.totals.chapters),
                        )}
                      />
                    ) : null}
                  </View>
                ))}
              </Card>
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}
