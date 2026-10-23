import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "@/components/app-provider";
import {
  AppButton,
  Card,
  MutedText,
  PageHeader,
  Row,
  Screen,
  SectionHeading,
  SyncBadge,
  styles as uiStyles,
} from "@/components/ui";
import { formatRelativeTime } from "@/lib/format";

const LINKS = [
  {
    href: "/notes",
    icon: "document-text-outline",
    title: "Notes and folders",
    description: "Write, edit and organise study notes",
  },
  {
    href: "/plans",
    icon: "calendar-outline",
    title: "Reading plans",
    description: "Follow a plan and track completed days",
  },
  {
    href: "/library",
    icon: "library-outline",
    title: "Offline library",
    description: "Download, pause or remove Bible versions",
  },
  {
    href: "/settings",
    icon: "settings-outline",
    title: "Settings",
    description: "Appearance, sync, export and account",
  },
] as const;

export default function MoreScreen() {
  const { session, colors, syncState, online, signOut } = useApp();
  const router = useRouter();

  return (
    <Screen>
      <PageHeader
        eyebrow="More"
        title="Your account and app"
        description="Manage study tools, downloads, appearance and the data associated with your account."
        action={<SyncBadge detailed />}
      />

      <Card>
        <Row style={uiStyles.rowBetween}>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={{ color: colors.subtle, fontSize: 11, fontWeight: "800" }}>SIGNED IN</Text>
            <Text style={{ color: colors.text, fontWeight: "800", fontSize: 18 }}>
              {session?.displayName || "HolyWord reader"}
            </Text>
            <Text style={{ color: colors.muted }}>{session?.email}</Text>
          </View>
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 16,
              backgroundColor: colors.primarySoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="person-outline" size={24} color={colors.primary} />
          </View>
        </Row>
        <View
          style={{
            flexDirection: "row",
            gap: 14,
            paddingTop: 12,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.border,
          }}
        >
          <Stat label="Connection" value={online ? "Online" : "Offline"} />
          <Stat label="Waiting" value={String(syncState.pending)} />
          <Stat label="Last sync" value={formatRelativeTime(syncState.lastSyncedAt)} />
        </View>
      </Card>

      <View style={{ gap: 8 }}>
        {LINKS.map((link) => (
          <Pressable
            key={link.href}
            accessibilityRole="button"
            accessibilityLabel={link.title}
            onPress={() => router.push(link.href)}
            style={({ pressed }) => ({
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderWidth: StyleSheet.hairlineWidth,
              borderRadius: 15,
              padding: 15,
              flexDirection: "row",
              alignItems: "center",
              gap: 13,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: 13,
                backgroundColor: colors.primarySoft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name={link.icon} size={21} color={colors.primary} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: colors.text, fontWeight: "800", fontSize: 16 }}>
                {link.title}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 17 }}>
                {link.description}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={19} color={colors.subtle} />
          </Pressable>
        ))}
      </View>

      <Card>
        <SectionHeading title="Sign out" />
        <MutedText>
          Signing out removes your session from this device but keeps downloaded Scripture and
          unsynced study data. Sign back in with the same account to resume syncing.
        </MutedText>
        <AppButton
          title="Sign out"
          variant="secondary"
          onPress={() => {
            void signOut();
          }}
        />
      </Card>

      <Card>
        <SectionHeading title="About HolyWord" />
        <MutedText>
          HolyWord is an offline-first Bible reader. Scripture is only served from supplied,
          checksum-verified packages; it is never invented, paraphrased or hard-coded.
        </MutedText>
        <MutedText>
          The King James Version is public domain. Other translations remain disabled until a
          written licence and licensed files are available. Copy and share actions always keep the
          reference and licence attribution with the text.
        </MutedText>
        <Text style={{ color: colors.subtle, fontSize: 12 }}>Version 1.0.0 (Phase 5)</Text>
      </Card>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const { colors } = useApp();
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={{ color: colors.text, fontWeight: "800", fontSize: 15 }}>{value}</Text>
      <Text style={{ color: colors.subtle, fontSize: 11 }}>{label}</Text>
    </View>
  );
}
