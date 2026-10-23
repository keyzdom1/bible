import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "@/components/app-provider";
import {
  AppBar,
  AppButton,
  Card,
  EmptyState,
  MutedText,
  ProgressBar,
  Row,
  Screen,
  SyncBadge,
  styles as uiStyles,
} from "@/components/ui";
import type { PlanView } from "@/lib/mobile-runtime";
import { referenceTarget } from "@/lib/format";

export default function PlanDetailScreen() {
  const { runtime, colors, preferences, studyRevision, bumpStudy, notify } = useApp();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [plan, setPlan] = useState<PlanView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busyDay, setBusyDay] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!runtime || !id) {
      setLoaded(true);
      return;
    }
    try {
      const plans = await runtime.plansFromCache();
      setPlan(plans.find((entry) => entry.id === id) ?? null);
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
    } finally {
      setLoaded(true);
    }
  }, [id, runtime]);

  useEffect(() => {
    void load();
  }, [load, studyRevision]);

  async function toggle(day: number, complete: boolean) {
    if (!runtime || !plan) return;
    setBusyDay(day);
    try {
      await runtime.savePlanDay(plan.id, day, complete);
      bumpStudy();
      const refreshed = (await runtime.plansFromCache()).find((entry) => entry.id === plan.id);
      if (refreshed) setPlan(refreshed);
      notify(complete ? `Day ${day} marked complete.` : `Day ${day} reopened.`);
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
    } finally {
      setBusyDay(null);
    }
  }

  function openReference(reference: string) {
    const target = referenceTarget(reference);
    if (!target) {
      router.push(`/search?q=${encodeURIComponent(reference)}`);
      return;
    }
    const version = preferences?.active_version_id
      ? `&version=${encodeURIComponent(preferences.active_version_id)}`
      : "";
    router.push(
      `/read?book=${target.book}&chapter=${target.chapter}${
        target.verse ? `&verse=${target.verse}` : ""
      }${version}`,
    );
  }

  if (!loaded) {
    return (
      <Screen scroll={false}>
        <View style={{ alignItems: "center", justifyContent: "center", flex: 1, gap: 12 }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={{ color: colors.muted }}>Opening your reading plan…</Text>
        </View>
      </Screen>
    );
  }

  if (!plan) {
    return (
      <Screen>
        <AppBar title="Reading plan" onBack={() => router.back()} />
        <EmptyState
          title="This plan is not cached"
          icon="calendar-outline"
          action={<AppButton title="Back to plans" onPress={() => router.replace("/plans")} />}
        >
          Reconnect and refresh the plan catalogue to download it for offline use.
        </EmptyState>
      </Screen>
    );
  }

  const fraction = plan.day_count > 0 ? plan.completedDays.length / plan.day_count : 0;

  return (
    <Screen>
      <AppBar
        title={plan.title}
        subtitle={`${plan.completedDays.length} of ${plan.day_count} days complete`}
        onBack={() => router.back()}
        action={<SyncBadge />}
      />
      <Card>
        <Text style={{ color: colors.text, fontSize: 23, fontWeight: "800" }}>{plan.title}</Text>
        <MutedText>{plan.description}</MutedText>
        <ProgressBar fraction={fraction} />
        <Text style={{ color: colors.subtle, fontSize: 12 }}>
          {Math.round(fraction * 100)}% complete · saved on this device
        </Text>
      </Card>

      {error ? (
        <Text accessibilityRole="alert" style={{ color: colors.danger }}>
          {error}
        </Text>
      ) : null}

      <View style={{ gap: 10 }}>
        {plan.schedule.map((day) => {
          const complete = plan.completedDays.includes(day.day);
          return (
            <Card key={day.day} style={complete ? { borderColor: colors.success } : undefined}>
              <Row style={uiStyles.rowBetween}>
                <Row>
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 19,
                      backgroundColor: complete ? colors.success : colors.primarySoft,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {complete ? (
                      <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                    ) : (
                      <Text style={{ color: colors.primary, fontWeight: "800" }}>{day.day}</Text>
                    )}
                  </View>
                  <View style={{ gap: 2 }}>
                    <Text style={{ color: colors.text, fontWeight: "800" }}>Day {day.day}</Text>
                    <Text style={{ color: colors.muted }}>{day.title}</Text>
                  </View>
                </Row>
                <AppButton
                  title={complete ? "Undo" : "Complete"}
                  variant={complete ? "secondary" : "primary"}
                  compact
                  loading={busyDay === day.day}
                  onPress={() => void toggle(day.day, !complete)}
                />
              </Row>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
                {day.references.map((reference) => (
                  <Pressable
                    key={reference}
                    accessibilityRole="button"
                    onPress={() => openReference(reference)}
                    style={({ pressed }) => ({
                      borderRadius: 999,
                      backgroundColor: colors.surfaceAlt,
                      paddingHorizontal: 11,
                      paddingVertical: 7,
                      opacity: pressed ? 0.65 : 1,
                    })}
                  >
                    <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 12 }}>
                      {reference}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Card>
          );
        })}
      </View>

      <Row style={{ justifyContent: "center" }}>
        <Text style={{ color: colors.subtle, fontSize: 12, textAlign: "center" }}>
          Reading plan progress is part of your synced study data. You can catch up or repeat days
          at any time.
        </Text>
      </Row>
    </Screen>
  );
}
