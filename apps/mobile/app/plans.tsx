import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
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
import type { PlanView } from "@/lib/mobile-runtime";

export default function PlansScreen() {
  const { runtime, colors, studyRevision, online, syncNow } = useApp();
  const router = useRouter();
  const [plans, setPlans] = useState<PlanView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!runtime) return;
    try {
      const next = await runtime.listPlans();
      setPlans(next);
      setError(null);
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
    } finally {
      setLoaded(true);
    }
  }, [runtime]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load, studyRevision]),
  );

  return (
    <Screen>
      <AppBar
        title="Reading plans"
        subtitle={`${plans.length} plans available offline after first sync`}
        onBack={() => router.back()}
        action={<SyncBadge />}
      />
      <PageHeader
        eyebrow="Plans"
        title="Keep a steady rhythm in Scripture"
        description="Plans and completed days are cached on this device. Progress syncs to your account and is preserved across devices."
      />

      {error ? (
        <Card>
          <Text accessibilityRole="alert" style={{ color: colors.danger }}>
            {error}
          </Text>
        </Card>
      ) : null}

      <Row style={uiStyles.rowBetween}>
        <Text style={{ color: colors.muted }}>
          {online ? "Refresh plan catalogue" : "Offline plan cache"}
        </Text>
        <AppButton
          title="Refresh"
          variant="secondary"
          compact
          loading={refreshing}
          disabled={!online}
          onPress={() => {
            setRefreshing(true);
            void load()
              .then(() => syncNow())
              .catch(() => undefined)
              .finally(() => setRefreshing(false));
          }}
        />
      </Row>

      {!loaded ? (
        <Text style={{ color: colors.muted }}>Loading reading plans…</Text>
      ) : plans.length === 0 ? (
        <EmptyState title="No plans available" icon="calendar-outline">
          Reconnect and refresh to download the reading-plan catalogue. Plans are then available
          offline.
        </EmptyState>
      ) : (
        plans.map((plan) => {
          const fraction = plan.day_count > 0 ? plan.completedDays.length / plan.day_count : 0;
          return (
            <Card
              key={plan.id}
              onPress={() => router.push(`/plan?id=${encodeURIComponent(plan.id)}`)}
            >
              <Row style={uiStyles.rowBetween}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>
                    {plan.title}
                  </Text>
                  <Text style={{ color: colors.muted, lineHeight: 20 }}>{plan.description}</Text>
                </View>
                <View
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 14,
                    backgroundColor: colors.primarySoft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="calendar-outline" size={23} color={colors.primary} />
                </View>
              </Row>
              <ProgressBar fraction={fraction} />
              <Row style={uiStyles.rowBetween}>
                <Text style={{ color: colors.subtle, fontSize: 12 }}>
                  {plan.completedDays.length} of {plan.day_count} days ·{" "}
                  {Math.round(fraction * 100)}%
                </Text>
                <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 12 }}>
                  Open plan
                </Text>
              </Row>
            </Card>
          );
        })
      )}
    </Screen>
  );
}
