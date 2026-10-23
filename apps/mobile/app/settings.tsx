import { useCallback, useEffect, useState } from "react";
import { Alert, Share, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "@/components/app-provider";
import {
  AppBar,
  AppButton,
  Card,
  Chip,
  MutedText,
  PageHeader,
  ProgressBar,
  Row,
  Screen,
  SectionHeading,
  SyncBadge,
  styles as uiStyles,
} from "@/components/ui";
import { FONT_SCALE_MAX, FONT_SCALE_MIN, fontScaleOf, readingPalette } from "@/theme";
import { formatBytes, formatRelativeTime } from "@/lib/format";

export default function SettingsScreen() {
  const {
    runtime,
    session,
    preferences,
    colors,
    syncState,
    online,
    setPreferences,
    syncNow,
    signOut,
    deleteAccount,
    notify,
  } = useApp();
  const router = useRouter();
  const [storage, setStorage] = useState<{ used: number; quota: number | null } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStorage = useCallback(async () => {
    if (!runtime) return;
    try {
      setStorage(await runtime.storageEstimate());
    } catch {
      setStorage(null);
    }
  }, [runtime]);

  useFocusEffect(
    useCallback(() => {
      void loadStorage();
    }, [loadStorage]),
  );

  useEffect(() => {
    void loadStorage();
  }, [loadStorage]);

  async function runSync() {
    setSyncing(true);
    setError(null);
    try {
      await syncNow();
      notify("Sync finished.");
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
    } finally {
      setSyncing(false);
    }
  }

  async function exportAccount() {
    if (!runtime) return;
    setExporting(true);
    setError(null);
    try {
      const data = await runtime.exportAccount();
      await Share.share({
        title: "HolyWord account export",
        message: JSON.stringify(data, null, 2),
      });
      notify("Account export prepared.");
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
    } finally {
      setExporting(false);
    }
  }

  function confirmDeleteAccount() {
    Alert.alert(
      "Delete your account?",
      "This permanently removes your account, bookmarks, highlights, notes, folders and reading-plan progress from HolyWord, and clears this device's local database. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete permanently",
          style: "destructive",
          onPress: () => {
            void deleteAccount().catch((errorValue: unknown) =>
              setError(errorValue instanceof Error ? errorValue.message : String(errorValue)),
            );
          },
        },
      ],
    );
  }

  const theme = preferences?.theme ?? "system";
  const readingTheme = preferences?.reading_theme ?? "light";
  const fontScale = fontScaleOf(preferences);
  const preview = readingPalette(readingTheme);

  return (
    <Screen>
      <AppBar title="Settings" onBack={() => router.back()} action={<SyncBadge />} />
      <PageHeader
        eyebrow="Settings"
        title="Make HolyWord yours"
        description="Reading preferences stay on this device. Account and study data can be synced, exported or deleted."
      />

      {error ? (
        <Card>
          <Text accessibilityRole="alert" style={{ color: colors.danger, lineHeight: 21 }}>
            {error}
          </Text>
        </Card>
      ) : null}

      <Card>
        <SectionHeading title="Appearance" />
        <View style={{ gap: 7 }}>
          <Text style={{ color: colors.text, fontWeight: "600" }}>App theme</Text>
          <Row>
            {(["system", "light", "dark"] as const).map((value) => (
              <Chip
                key={value}
                label={value[0]!.toUpperCase() + value.slice(1)}
                selected={theme === value}
                onPress={() => void setPreferences({ theme: value })}
              />
            ))}
          </Row>
        </View>
        <View style={{ gap: 7 }}>
          <Text style={{ color: colors.text, fontWeight: "600" }}>Reading background</Text>
          <Row>
            {(["light", "sepia", "dark"] as const).map((value) => (
              <Chip
                key={value}
                label={value[0]!.toUpperCase() + value.slice(1)}
                selected={readingTheme === value}
                onPress={() => void setPreferences({ readingTheme: value })}
              />
            ))}
          </Row>
        </View>
        <View style={{ gap: 7 }}>
          <Row style={uiStyles.rowBetween}>
            <Text style={{ color: colors.text, fontWeight: "600" }}>Reading text size</Text>
            <Text style={{ color: colors.subtle, fontSize: 12 }}>
              {Math.round(fontScale * 100)}%
            </Text>
          </Row>
          <Row>
            <AppButton
              title="A−"
              variant="secondary"
              compact
              disabled={fontScale <= FONT_SCALE_MIN}
              onPress={() =>
                void setPreferences({ fontScale: Math.max(FONT_SCALE_MIN, fontScale - 0.05) })
              }
            />
            <AppButton
              title="A+"
              variant="secondary"
              compact
              disabled={fontScale >= FONT_SCALE_MAX}
              onPress={() =>
                void setPreferences({ fontScale: Math.min(FONT_SCALE_MAX, fontScale + 0.05) })
              }
            />
            <Text style={{ color: colors.subtle, fontSize: 11, flex: 1, textAlign: "right" }}>
              Applies to Scripture only
            </Text>
          </Row>
          <View
            style={{
              backgroundColor: preview.background,
              borderColor: preview.border,
              borderWidth: StyleSheet.hairlineWidth,
              borderRadius: 12,
              padding: 14,
            }}
          >
            <Text style={{ color: preview.muted, fontSize: 11, marginBottom: 3 }}>
              Reading preview
            </Text>
            <Text
              style={{
                color: preview.text,
                fontSize: 18 * fontScale,
                lineHeight: 29 * fontScale,
                fontWeight: "500",
              }}
            >
              Your Scripture text will appear at this size.
            </Text>
          </View>
        </View>
      </Card>

      <Card>
        <Row style={uiStyles.rowBetween}>
          <SectionHeading title="Sync" />
          <AppButton
            title={syncing ? "Syncing…" : "Sync now"}
            variant="secondary"
            compact
            loading={syncing}
            disabled={!online}
            onPress={() => void runSync()}
          />
        </Row>
        <View style={{ flexDirection: "row", gap: 14 }}>
          <Stat label="Connection" value={!online ? "Offline" : "Online"} />
          <Stat label="Waiting" value={String(syncState.pending)} />
          <Stat label="Last sync" value={formatRelativeTime(syncState.lastSyncedAt)} />
          <Stat
            label="Status"
            value={
              syncState.status === "error"
                ? "Error"
                : syncState.status === "syncing"
                  ? "Syncing"
                  : "Ready"
            }
          />
        </View>
        {syncState.lastError ? (
          <Text style={{ color: colors.danger, lineHeight: 20 }}>{syncState.lastError}</Text>
        ) : null}
        <MutedText>
          HolyWord syncs when the app returns to the foreground, when the connection returns and
          every 20 seconds while open. Background sync is best-effort. Queued changes are retried
          until accepted exactly once.
        </MutedText>
      </Card>

      <Card>
        <SectionHeading title="Account" />
        <Row style={uiStyles.rowBetween}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: colors.text, fontWeight: "800" }}>
              {session?.displayName || "HolyWord reader"}
            </Text>
            <Text style={{ color: colors.muted }}>{session?.email}</Text>
          </View>
          <AppButton title="Sign out" variant="secondary" compact onPress={() => void signOut()} />
        </Row>
        <Row style={uiStyles.rowBetween}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: colors.text, fontWeight: "700" }}>Export your account</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              Share a JSON copy of bookmarks, highlights, notes, folders and progress.
            </Text>
          </View>
          <AppButton
            title={exporting ? "Preparing…" : "Export"}
            variant="secondary"
            compact
            loading={exporting}
            disabled={!online}
            onPress={() => void exportAccount()}
          />
        </Row>
      </Card>

      <Card>
        <SectionHeading title="Device storage" />
        {storage ? (
          <>
            <Text style={{ color: colors.muted }}>
              {formatBytes(storage.used)} stored on this device
            </Text>
            <ProgressBar fraction={storage.quota ? storage.used / storage.quota : 0.08} />
            <Text style={{ color: colors.subtle, fontSize: 12, lineHeight: 18 }}>
              Includes downloaded Scripture, the SQLite search index and local study data.
              {storage.quota ? " A system storage quota is not exposed by this device." : ""}
            </Text>
          </>
        ) : (
          <Text style={{ color: colors.muted }}>Checking local storage…</Text>
        )}
        <AppButton
          title="Manage downloads"
          variant="secondary"
          compact
          onPress={() => router.push("/library")}
        />
      </Card>

      <Card>
        <SectionHeading title="About HolyWord" />
        <MutedText>
          HolyWord is an offline-first Bible app. Scripture is only served from supplied,
          checksum-verified packages. The King James Version is public domain; other translations
          remain disabled until a written licence and licensed files are available.
        </MutedText>
        <MutedText>
          Never invent, paraphrase or hard-code Bible text. Copy and share actions always include
          the reference and licence attribution.
        </MutedText>
        <Text style={{ color: colors.subtle, fontSize: 12 }}>Version 1.0.0 · Phase 5</Text>
      </Card>

      <Card style={{ borderColor: colors.danger }}>
        <SectionHeading title="Delete account" />
        <MutedText>
          Permanently remove your account and synced study data, and clear this device's local
          database. This cannot be undone.
        </MutedText>
        <AppButton
          title="Delete account"
          variant="danger"
          disabled={!online}
          icon={<Ionicons name="trash-outline" size={18} color="#FFFFFF" />}
          onPress={confirmDeleteAccount}
        />
      </Card>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const { colors } = useApp();
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={{ color: colors.text, fontWeight: "800", fontSize: 14 }}>{value}</Text>
      <Text style={{ color: colors.subtle, fontSize: 10 }}>{label}</Text>
    </View>
  );
}
