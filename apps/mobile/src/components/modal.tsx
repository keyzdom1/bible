import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "./app-provider";

export function Sheet({
  visible,
  onClose,
  title,
  children,
  footer,
  fullHeight = false,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  fullHeight?: boolean;
}) {
  const { colors } = useApp();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: colors.scrim }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={{ flex: 1 }}
        />
        <SafeAreaView
          edges={["bottom"]}
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            maxHeight: fullHeight ? "94%" : "86%",
            minHeight: 220,
          }}
        >
          <View
            style={{
              width: 42,
              height: 5,
              borderRadius: 3,
              backgroundColor: colors.border,
              alignSelf: "center",
              marginTop: 9,
            }}
          />
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 20,
              paddingTop: 12,
              paddingBottom: 12,
              gap: 12,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800", flex: 1 }}>
              {title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={8}
              onPress={onClose}
              style={{ padding: 6 }}
            >
              <Ionicons name="close" size={24} color={colors.muted} />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 22, gap: 14 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
          {footer ? (
            <View
              style={{
                borderTopWidth: 1,
                borderTopColor: colors.border,
                paddingHorizontal: 20,
                paddingTop: 12,
                paddingBottom: 8,
                flexDirection: "row",
                gap: 10,
                justifyContent: "flex-end",
                flexWrap: "wrap",
              }}
            >
              {footer}
            </View>
          ) : null}
        </SafeAreaView>
      </View>
    </Modal>
  );
}
