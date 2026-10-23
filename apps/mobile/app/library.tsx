import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { DownloadProgress } from "@holyword/offline";
import { useApp } from "@/components/app-provider";
import {
  AppBar,
  AppButton,
  Card,
  EmptyState,
  PageHeader,
  ProgressBar,
  Row,
  Screen,
  SyncBadge,
  styles as uiStyles,
} from "@/components/ui";
import type { DownloadView, VersionSummary } from "@/lib/mobile-runtime";
import { formatBytes } from "@/lib/format";

export default function LibraryScreen() {
  const { runtime, colors, online, libraryRevision, bumpLibrary, notify } = useApp();
  const router = useRouter();
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [downloads, setDownloads] = useState<DownloadView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<Set<string>>(new Set());
  const mounted = useRef(true);

  const load = useCallback(async () => {
    if (!runtime) return;
    const [nextVersions, nextDownloads] = await Promise.all([
      runtime.listVersionSummaries(),
      runtime.listDownloadProgress(),
    ]);
    if (!mounted.current) return;
    setVersions(nextVersions);
    setDownloads(nextDownloads);
    setLoaded(true);
  }, [runtime]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load().catch((errorValue) => {
        setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
        setLoaded(true);
      });
    }, [load, libraryRevision]),
  );

  useEffect(() => {
    if (!runtime) return;
    return runtime.onDownload((progress: DownloadProgress) => {
      setDownloads((current) => {
        const existing = current.find((entry) => entry.versionId === progress.versionId);
        const name =
          existing?.name ??
          versions.find((entry) => entry.versionId === progress.versionId)?.name ??
          progress.versionId.toUpperCase();
        const next: DownloadView = { ...progress, name };
        return [next, ...current.filter((entry) => entry.versionId !== progress.versionId)];
      });
    });
  }, [runtime, versions]);

  async function download(version: VersionSummary) {
    if (!runtime) return;
    setError(null);
    setStarting((current) => new Set(current).add(version.versionId));
    try {
      await runtime.downloadVersion(version.versionId);
      notify(`${version.abbreviation} downloaded and indexed for offline search.`);
      bumpLibrary();
      await load();
    } catch (errorValue) {
      const message = errorValue instanceof Error ? errorValue.message : String(errorValue);
      if (!message.toLowerCase().includes("paused")) setError(message);
      await load().catch(() => undefined);
    } finally {
      setStarting((current) => {
        const next = new Set(current);
        next.delete(version.versionId);
        return next;
      });
    }
  }

  async function pause(versionId: string) {
    if (!runtime) return;
    try {
      await runtime.pauseDownload(versionId);
      notify("Download paused. It will resume where it stopped.");
      await load();
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
    }
  }

  function confirmDelete(version: VersionSummary) {
    Alert.alert(
      `Remove ${version.name}?`,
      "The downloaded text and search index will be deleted from this device. Bookmarks and notes that reference this version are kept.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            if (!runtime) return;
            void runtime
              .deleteVersion(version.versionId)
              .then(async () => {
                notify(`${version.abbreviation} removed from this device.`);
                bumpLibrary();
                await load();
              })
              .catch((errorValue: unknown) =>
                setError(errorValue instanceof Error ? errorValue.message : String(errorValue)),
              );
          },
        },
      ],
    );
  }

  const installed = versions.filter((version) => version.installed);
  const available = versions.filter((version) => !version.installed);

  return (
    <Screen>
      <AppBar
        title="Offline library"
        subtitle={`${installed.length} downloaded · ${formatBytes(
          installed.reduce((total, version) => total + version.storageBytes, 0),
        )}`}
        onBack={() => router.back()}
        action={<SyncBadge />}
      />
      <PageHeader
        eyebrow="Library"
        title="Scripture on this device"
        description="Downloads are resumable and every package is checksum-verified before it becomes readable. Offline search is built on the device with SQLite FTS5."
      />

      {!online ? (
        <Card style={{ backgroundColor: colors.primarySoft }}>
          <Row>
            <Ionicons name="cloud-offline-outline" size={21} color={colors.primary} />
            <Text style={{ color: colors.text, flex: 1, lineHeight: 20 }}>
              You are offline. Downloaded versions can still be read and searched; new downloads
              wait for a connection.
            </Text>
          </Row>
        </Card>
      ) : null}

      {error ? (
        <Card>
          <Text accessibilityRole="alert" style={{ color: colors.danger, lineHeight: 21 }}>
            {error}
          </Text>
        </Card>
      ) : null}

      {!loaded ? (
        <Text style={{ color: colors.muted }}>Reading the version catalogue…</Text>
      ) : versions.length === 0 ? (
        <EmptyState title="No versions available" icon="library-outline">
          Reconnect to refresh the catalogue. The public-domain King James Version is the only
          version enabled for this Phase 5 build.
        </EmptyState>
      ) : null}

      {installed.length > 0 ? (
        <View style={{ gap: 10 }}>
          <Text style={{ color: colors.text, fontSize: 19, fontWeight: "800" }}>Downloaded</Text>
          {installed.map((version) => (
            <Card key={version.versionId}>
              <Row style={uiStyles.rowBetween}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Row>
                    <Text style={{ color: colors.text, fontSize: 17, fontWeight: "800" }}>
                      {version.name}
                    </Text>
                    <StatusPill label="Offline" color={colors.success} />
                  </Row>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>
                    {version.abbreviation} · {version.language} ·{" "}
                    {formatBytes(version.storageBytes)}
                  </Text>
                  <Text style={{ color: colors.subtle, fontSize: 11, lineHeight: 16 }}>
                    {version.attribution}
                    {`\n${version.copyright}`}
                  </Text>
                </View>
                <View
                  style={{
                    width: 43,
                    height: 43,
                    borderRadius: 13,
                    backgroundColor: colors.primarySoft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="checkmark-circle" size={23} color={colors.success} />
                </View>
              </Row>
              <Row style={uiStyles.rowBetween}>
                <AppButton
                  title="Read"
                  compact
                  onPress={() =>
                    router.push(`/read?version=${encodeURIComponent(version.versionId)}`)
                  }
                />
                <AppButton
                  title="Search"
                  variant="secondary"
                  compact
                  onPress={() => router.push("/search")}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${version.name}`}
                  onPress={() => confirmDelete(version)}
                  hitSlop={8}
                  style={{ padding: 8 }}
                >
                  <Ionicons name="trash-outline" size={19} color={colors.danger} />
                </Pressable>
              </Row>
            </Card>
          ))}
        </View>
      ) : null}

      {downloads.length > 0 ? (
        <View style={{ gap: 10 }}>
          <Text style={{ color: colors.text, fontSize: 19, fontWeight: "800" }}>
            Download activity
          </Text>
          {downloads.map((item) => {
            const active = item.status === "downloading" || item.status === "verifying";
            return (
              <Card key={item.versionId}>
                <Row style={uiStyles.rowBetween}>
                  <Text style={{ color: colors.text, fontWeight: "700" }}>{item.name}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12, textTransform: "capitalize" }}>
                    {item.status.replace("-", " ")}
                  </Text>
                </Row>
                <ProgressBar fraction={item.fraction ?? 0} />
                <Row style={uiStyles.rowBetween}>
                  <Text style={{ color: colors.subtle, fontSize: 12 }}>
                    {formatBytes(item.receivedBytes)}
                    {item.totalBytes ? ` of ${formatBytes(item.totalBytes)}` : ""}
                  </Text>
                  {active ? (
                    <AppButton
                      title="Pause"
                      variant="secondary"
                      compact
                      onPress={() => void pause(item.versionId)}
                    />
                  ) : item.status === "paused" || item.status === "error" ? (
                    <AppButton
                      title="Resume"
                      compact
                      disabled={!online}
                      onPress={() => {
                        const version = versions.find(
                          (entry) => entry.versionId === item.versionId,
                        );
                        if (version) void download(version);
                      }}
                    />
                  ) : null}
                </Row>
                {item.error ? (
                  <Text style={{ color: colors.danger, fontSize: 12 }}>{item.error}</Text>
                ) : null}
              </Card>
            );
          })}
        </View>
      ) : null}

      {available.length > 0 ? (
        <View style={{ gap: 10 }}>
          <Text style={{ color: colors.text, fontSize: 19, fontWeight: "800" }}>Available</Text>
          {available.map((version) => {
            const blocked = !version.enabled || version.licenceStatus === "unlicensed";
            const progress = downloads.find((entry) => entry.versionId === version.versionId);
            const busy =
              starting.has(version.versionId) ||
              progress?.status === "downloading" ||
              progress?.status === "verifying";
            return (
              <Card key={version.versionId}>
                <Row style={uiStyles.rowBetween}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Row>
                      <Text style={{ color: colors.text, fontSize: 17, fontWeight: "800" }}>
                        {version.name}
                      </Text>
                      <StatusPill
                        label={
                          blocked
                            ? "Licence required"
                            : version.licenceStatus === "public-domain"
                              ? "Public domain"
                              : "Licensed"
                        }
                        color={blocked ? colors.danger : colors.success}
                      />
                    </Row>
                    <Text style={{ color: colors.muted, fontSize: 12 }}>
                      {version.abbreviation} · {version.language}
                    </Text>
                  </View>
                </Row>
                {blocked ? (
                  <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
                    This version is disabled until a written licence and licensed package files are
                    available. HolyWord will not substitute or invent text.
                  </Text>
                ) : (
                  <>
                    <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
                      Resumable download, checksum verification and on-device full-text search.
                    </Text>
                    <Text style={{ color: colors.subtle, fontSize: 11, lineHeight: 16 }}>
                      {version.attribution}
                      {`\n${version.copyright}`}
                    </Text>
                  </>
                )}
                <Row style={{ justifyContent: "flex-end" }}>
                  {progress && (progress.status === "paused" || progress.status === "error") ? (
                    <AppButton
                      title="Resume download"
                      variant="secondary"
                      compact
                      disabled={!online || blocked}
                      loading={busy}
                      onPress={() => void download(version)}
                    />
                  ) : (
                    <AppButton
                      title={busy ? "Downloading…" : "Download"}
                      compact
                      disabled={!online || blocked || busy}
                      loading={busy}
                      icon={<Ionicons name="download-outline" size={17} color={colors.onPrimary} />}
                      onPress={() => void download(version)}
                    />
                  )}
                </Row>
              </Card>
            );
          })}
        </View>
      ) : null}

      <Card>
        <Row>
          <Ionicons name="shield-checkmark-outline" size={22} color={colors.primary} />
          <Text style={{ color: colors.text, fontWeight: "700", flex: 1 }}>
            Only supplied public-domain packages
          </Text>
        </Row>
        <Text style={{ color: colors.muted, lineHeight: 20 }}>
          HolyWord never fetches unverified Bible text. The King James Version package is verified
          against its signed manifest checksum before installation, and disabled or unlicensed
          versions are blocked at both the catalogue and API layers.
        </Text>
      </Card>
    </Screen>
  );
}

function StatusPill({ label, color }: { label: string; color: string }) {
  return (
    <View
      style={{
        borderRadius: 999,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: color,
        paddingHorizontal: 8,
        paddingVertical: 3,
      }}
    >
      <Text style={{ color, fontSize: 10, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}
