import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { tryParseReference, type BookCode } from "@holyword/core";
import type { LocalVersion } from "@holyword/offline";
import { useApp } from "@/components/app-provider";
import {
  AppButton,
  Card,
  Chip,
  EmptyState,
  PageHeader,
  Row,
  Screen,
  SectionHeading,
  SyncBadge,
  styles as uiStyles,
} from "@/components/ui";
import { bookName, highlightSegments, referenceLabel, referenceTarget } from "@/lib/format";
import type { SearchOutcome } from "@/lib/mobile-runtime";

export default function SearchScreen() {
  const { runtime, preferences, colors, online, libraryRevision } = useApp();
  const router = useRouter();
  const [versions, setVersions] = useState<LocalVersion[]>([]);
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState("");
  const [versionId, setVersionId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<SearchOutcome | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!runtime) return;
      void runtime
        .listInstalledVersions()
        .then((next) => {
          setVersions(next);
          setVersionId((current) => {
            if (current && next.some((version) => version.version_id === current)) return current;
            const active = next.find(
              (version) => version.version_id === preferences?.active_version_id,
            );
            return active?.version_id ?? next[0]?.version_id ?? null;
          });
        })
        .catch(() => undefined);
    }, [runtime, preferences?.active_version_id, libraryRevision]),
  );

  const reference = useMemo(() => (searched ? tryParseReference(searched) : null), [searched]);
  const target = useMemo(
    () => (reference ? referenceTarget(searched) : null),
    [reference, searched],
  );

  async function runSearch() {
    if (!runtime) return;
    const trimmed = query.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setOutcome(null);
    setSearched(trimmed);
    try {
      const result = await runtime.search(trimmed, versionId ?? undefined);
      setOutcome(result);
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
    } finally {
      setLoading(false);
    }
  }

  function openResult(book: BookCode, chapter: number, verse: number, resultVersion: string) {
    router.push(
      `/read?version=${encodeURIComponent(resultVersion)}&book=${book}&chapter=${chapter}&verse=${verse}`,
    );
  }

  return (
    <Screen>
      <PageHeader
        eyebrow="Search"
        title="Find a word, phrase or verse"
        description="Downloaded Scripture is searched on this device with SQLite full-text search. References such as John 3:16 open straight to the passage."
        action={<SyncBadge />}
      />

      <View style={{ gap: 10 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: colors.surface,
            borderRadius: 14,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
            paddingHorizontal: 12,
          }}
        >
          <Ionicons name="search-outline" size={21} color={colors.subtle} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => void runSearch()}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Word, phrase or reference"
            placeholderTextColor={colors.subtle}
            accessibilityLabel="Search Scripture"
            style={{
              flex: 1,
              color: colors.text,
              fontSize: 16,
              paddingVertical: 13,
              paddingHorizontal: 10,
            }}
          />
          {query ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={8}
              onPress={() => {
                setQuery("");
                setSearched("");
                setOutcome(null);
                setError(null);
              }}
            >
              <Ionicons name="close-circle" size={20} color={colors.subtle} />
            </Pressable>
          ) : null}
        </View>
        <Row style={uiStyles.rowBetween}>
          <AppButton title="Search" onPress={() => void runSearch()} loading={loading} />
          <Text style={{ color: colors.subtle, fontSize: 12 }}>
            {versions.length > 0 ? "Offline search ready" : online ? "Online search" : "Offline"}
          </Text>
        </Row>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ color: colors.muted, fontWeight: "600", fontSize: 13 }}>Search version</Text>
        <Row>
          <Chip
            label="All downloaded"
            selected={versionId === null}
            onPress={() => setVersionId(null)}
          />
          {versions.map((version) => (
            <Chip
              key={version.version_id}
              label={version.abbreviation}
              selected={versionId === version.version_id}
              onPress={() => setVersionId(version.version_id)}
            />
          ))}
        </Row>
      </View>

      {target ? (
        <Card
          style={{ backgroundColor: colors.primarySoft }}
          onPress={() =>
            router.push(
              `/read?book=${target.book}&chapter=${target.chapter}${
                target.verse ? `&verse=${target.verse}` : ""
              }${versionId ? `&version=${encodeURIComponent(versionId)}` : ""}`,
            )
          }
          accessibilityLabel={`Open ${searched}`}
        >
          <Row style={uiStyles.rowBetween}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ color: colors.subtle, fontSize: 11, fontWeight: "800" }}>
                REFERENCE FOUND
              </Text>
              <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800" }}>
                {bookName(target.book)} {target.chapter}
                {target.verse ? `:${target.verse}` : ""}
              </Text>
            </View>
            <Ionicons name="arrow-forward-circle" size={30} color={colors.primary} />
          </Row>
        </Card>
      ) : null}

      {error ? (
        <Card>
          <Text accessibilityRole="alert" style={{ color: colors.danger, lineHeight: 21 }}>
            {error}
          </Text>
          {!online ? (
            <Text style={{ color: colors.muted }}>
              Offline search only covers versions downloaded to this device.
            </Text>
          ) : null}
        </Card>
      ) : null}

      {loading ? (
        <View style={{ alignItems: "center", paddingVertical: 36, gap: 12 }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={{ color: colors.muted }}>Searching Scripture…</Text>
        </View>
      ) : null}

      {outcome ? (
        <>
          <SectionHeading
            title={`${outcome.results.length} result${outcome.results.length === 1 ? "" : "s"}`}
            action={
              <Text style={{ color: colors.subtle, fontSize: 12 }}>
                {outcome.engine === "local" ? "On-device" : "Server"} search
              </Text>
            }
          />
          {outcome.results.length === 0 ? (
            <EmptyState title="No verses found" icon="search-outline">
              Try fewer words, check the spelling, or use a reference such as Psalm 23.
            </EmptyState>
          ) : (
            <Card style={{ gap: 0 }}>
              {outcome.results.map((result, index) => (
                <Pressable
                  key={`${result.versionId}-${result.verseId}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${referenceLabel(result.book, result.chapter, result.verse)}`}
                  onPress={() =>
                    openResult(result.book, result.chapter, result.verse, result.versionId)
                  }
                  style={({ pressed }) => ({
                    paddingVertical: 13,
                    borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
                    borderTopColor: colors.border,
                    opacity: pressed ? 0.65 : 1,
                  })}
                >
                  <Row style={uiStyles.rowBetween}>
                    <Text style={{ color: colors.primary, fontWeight: "800" }}>
                      {referenceLabel(result.book, result.chapter, result.verse)}
                    </Text>
                    <Text style={{ color: colors.subtle, fontSize: 11 }}>
                      {result.versionId.toUpperCase()}
                    </Text>
                  </Row>
                  <Text style={{ color: colors.text, lineHeight: 22, marginTop: 4 }}>
                    {highlightSegments(result.text, searched).map((segment, part) => (
                      <Text
                        key={`${part}-${segment.text.slice(0, 8)}`}
                        style={
                          segment.match
                            ? {
                                backgroundColor: colors.gold,
                                color: "#081B3A",
                                fontWeight: "700",
                              }
                            : undefined
                        }
                      >
                        {segment.text}
                      </Text>
                    ))}
                  </Text>
                </Pressable>
              ))}
            </Card>
          )}
        </>
      ) : null}

      {!outcome && !loading && !error ? (
        <EmptyState title="Search all downloaded Scripture" icon="search-outline">
          Try a word, a phrase in quotes, or a reference such as John 3:16. Quoted phrases are
          matched together.
        </EmptyState>
      ) : null}
    </Screen>
  );
}
