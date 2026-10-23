import { useEffect } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppProvider, useApp } from "@/components/app-provider";
import "@/lib/background-sync";

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

function SessionGate() {
  const { ready, initError, session, colors } = useApp();
  const segments = useSegments();
  const router = useRouter();
  const onSignIn = segments[0] === "sign-in";

  useEffect(() => {
    if (!ready) return;
    void SplashScreen.hideAsync().catch(() => undefined);
    if (!session && !onSignIn) router.replace("/sign-in");
    if (session && onSignIn) router.replace("/");
  }, [ready, session, onSignIn, router]);

  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          backgroundColor: colors.background,
        }}
      >
        <Text style={{ color: colors.primary, fontSize: 34, fontWeight: "800" }}>HolyWord</Text>
        <ActivityIndicator color={colors.primary} />
        <Text style={{ color: colors.muted }}>Opening your offline Bible…</Text>
      </View>
    );
  }

  if (initError) {
    return (
      <View
        style={{
          flex: 1,
          padding: 28,
          gap: 16,
          justifyContent: "center",
          backgroundColor: colors.background,
        }}
      >
        <Text style={{ color: colors.text, fontSize: 25, fontWeight: "800" }}>
          HolyWord could not open its local database
        </Text>
        <Text style={{ color: colors.muted, lineHeight: 22 }}>{initError}</Text>
        <Text style={{ color: colors.muted, lineHeight: 22 }}>
          Free storage on this device, then close and reopen the app. Your downloaded Scripture and
          study notes are stored locally and will not be overwritten.
        </Text>
      </View>
    );
  }

  if (!session && !onSignIn) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: "slide_from_right",
      }}
    />
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <ThemedStatus />
        <SessionGate />
      </AppProvider>
    </SafeAreaProvider>
  );
}

function ThemedStatus() {
  const { theme } = useApp();
  return <StatusBar style={theme === "dark" ? "light" : "dark"} />;
}
