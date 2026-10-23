import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "./app-provider";

export function Screen({
  children,
  scroll = true,
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useApp();
  if (!scroll) {
    return (
      <SafeAreaView
        style={[{ flex: 1, backgroundColor: colors.background }, style]}
        edges={["top"]}
      >
        {children}
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={[
          { padding: 20, paddingBottom: 48, gap: 18 },
          style as StyleProp<ViewStyle>,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function AppBar({
  title,
  subtitle,
  onBack,
  action,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  action?: ReactNode;
}) {
  const { colors } = useApp();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingBottom: 4,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onBack}
        hitSlop={8}
        style={{ padding: 6, marginLeft: -6 }}
      >
        <Ionicons name="chevron-back" size={26} color={colors.text} />
      </Pressable>
      <View style={{ flex: 1, gap: 1 }}>
        <Text numberOfLines={1} style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={{ color: colors.subtle, fontSize: 11 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  const { colors } = useApp();
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.rowBetween}>
        <View style={{ flex: 1, gap: 5 }}>
          {eyebrow ? (
            <Text style={[styles.eyebrow, { color: colors.subtle }]}>{eyebrow.toUpperCase()}</Text>
          ) : null}
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
            {title}
          </Text>
        </View>
        {action}
      </View>
      {description ? (
        <Text style={[styles.description, { color: colors.muted }]}>{description}</Text>
      ) : null}
    </View>
  );
}

export function Card({
  children,
  style,
  onPress,
  accessibilityLabel,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const { colors } = useApp();
  const content = (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: 18,
          padding: 17,
          gap: 12,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}
    >
      {content}
    </Pressable>
  );
}

export function AppButton({
  title,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  icon,
  compact = false,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useApp();
  const background =
    variant === "primary"
      ? colors.primary
      : variant === "danger"
        ? colors.danger
        : variant === "secondary"
          ? colors.primarySoft
          : "transparent";
  const foreground =
    variant === "primary" || variant === "danger"
      ? variant === "danger"
        ? "#FFFFFF"
        : colors.onPrimary
      : variant === "ghost"
        ? colors.primary
        : colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: compact ? 38 : 48,
          paddingHorizontal: compact ? 13 : 18,
          paddingVertical: compact ? 8 : 12,
          borderRadius: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          backgroundColor: background,
          opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={foreground} size="small" /> : icon}
      <Text
        style={{
          color: foreground,
          fontWeight: "700",
          fontSize: compact ? 13 : 15,
          textAlign: "center",
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  disabled = false,
}: {
  icon: ReactNode;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useApp();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.surfaceAlt,
        opacity: disabled ? 0.4 : pressed ? 0.65 : 1,
      })}
    >
      {icon}
    </Pressable>
  );
}

export function AppTextInput(props: TextInputProps) {
  const { colors } = useApp();
  const { style, multiline, ...rest } = props;
  return (
    <TextInput
      {...rest}
      multiline={multiline}
      placeholderTextColor={colors.subtle}
      style={[
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: StyleSheet.hairlineWidth,
          color: colors.text,
          borderRadius: 12,
          paddingHorizontal: 14,
          paddingVertical: 12,
          fontSize: 16,
          minHeight: multiline ? 112 : 48,
          textAlignVertical: multiline ? "top" : "center",
        },
        style,
      ]}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  const { colors } = useApp();
  return (
    <View style={{ gap: 7 }}>
      <Text style={{ color: colors.text, fontWeight: "600", fontSize: 14 }}>{label}</Text>
      {children}
      {hint ? <Text style={{ color: colors.subtle, fontSize: 12 }}>{hint}</Text> : null}
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  color,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  color?: string;
}) {
  const { colors } = useApp();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? (color ?? colors.primary) : colors.border,
        backgroundColor: selected ? (color ?? colors.primary) : colors.surface,
        paddingHorizontal: 13,
        paddingVertical: 8,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <Text
        style={{
          color: selected ? (color ? "#081B3A" : colors.onPrimary) : colors.muted,
          fontWeight: "600",
          fontSize: 13,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function SectionHeading({ title, action }: { title: string; action?: ReactNode }) {
  const { colors } = useApp();
  return (
    <View style={styles.rowBetween}>
      <Text style={{ color: colors.text, fontSize: 19, fontWeight: "800" }}>{title}</Text>
      {action}
    </View>
  );
}

export function EmptyState({
  title,
  children,
  action,
  icon = "book-outline",
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const { colors } = useApp();
  return (
    <View style={{ alignItems: "center", paddingVertical: 30, gap: 10, paddingHorizontal: 20 }}>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: colors.primarySoft,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon} size={26} color={colors.primary} />
      </View>
      <Text style={{ color: colors.text, fontWeight: "700", fontSize: 17, textAlign: "center" }}>
        {title}
      </Text>
      {children ? (
        <Text style={{ color: colors.muted, textAlign: "center", lineHeight: 21 }}>{children}</Text>
      ) : null}
      {action ? <View style={{ marginTop: 8 }}>{action}</View> : null}
    </View>
  );
}

export function SyncBadge({ detailed = false }: { detailed?: boolean }) {
  const { colors, online, syncState, theme } = useApp();
  const status = !online
    ? "offline"
    : syncState.status === "error"
      ? "error"
      : syncState.status === "syncing"
        ? "syncing"
        : "synced";
  const label =
    status === "offline"
      ? "Offline"
      : status === "error"
        ? "Sync error"
        : status === "syncing"
          ? "Syncing"
          : "Synced";
  const color =
    status === "offline"
      ? colors.subtle
      : status === "error"
        ? colors.danger
        : status === "syncing"
          ? colors.cyan
          : colors.success;
  return (
    <View
      accessibilityLabel={`${label}${syncState.pending ? `, ${syncState.pending} changes waiting` : ""}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        alignSelf: "flex-start",
        backgroundColor: theme === "dark" ? colors.surfaceAlt : colors.surface,
        borderColor: colors.border,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 6,
      }}
    >
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
      <Text style={{ color, fontSize: 12, fontWeight: "700" }}>
        {label}
        {detailed && syncState.pending > 0 ? ` · ${syncState.pending}` : ""}
      </Text>
    </View>
  );
}

export function ProgressBar({ fraction }: { fraction: number }) {
  const { colors } = useApp();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100) }}
      style={{
        height: 8,
        borderRadius: 999,
        backgroundColor: colors.surfaceAlt,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          width: `${Math.min(100, Math.max(0, fraction * 100))}%`,
          height: "100%",
          borderRadius: 999,
          backgroundColor: colors.primary,
        }}
      />
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function MutedText({ children }: { children: ReactNode }) {
  const { colors } = useApp();
  return <Text style={{ color: colors.muted, lineHeight: 21 }}>{children}</Text>;
}

export const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.4 },
  title: { fontSize: 29, fontWeight: "800", letterSpacing: -0.5 },
  description: { fontSize: 15, lineHeight: 22 },
});
