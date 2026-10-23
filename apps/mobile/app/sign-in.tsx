import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "@/components/app-provider";
import { AppButton, AppTextInput, Card, Field, MutedText, Row, SyncBadge } from "@/components/ui";
import { DEV_AUTH_ENABLED } from "@/lib/config";
import { describeError } from "@/lib/mobile-runtime";

type Mode = "sign-in" | "register" | "confirm" | "forgot" | "reset" | "new-password";

function challengeFrom(error: unknown) {
  if (typeof error !== "object" || error === null) return null;
  const candidate = (error as { challenge?: unknown }).challenge;
  if (
    typeof candidate === "object" &&
    candidate !== null &&
    (candidate as { challengeName?: string }).challengeName === "NEW_PASSWORD_REQUIRED"
  ) {
    return candidate as {
      challengeName: "NEW_PASSWORD_REQUIRED";
      session: string;
      username: string;
    };
  }
  return null;
}

export default function SignInScreen() {
  const {
    runtime,
    colors,
    authBusy,
    signInDev,
    signInCognito,
    completeNewPassword,
    hostedSignIn,
    notify,
    online,
  } = useApp();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<{
    username: string;
    session: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const cognitoAvailable = Boolean(runtime?.cognito);
  const hostedAvailable = Boolean(runtime?.cognito?.hostedLoginUrl?.());

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setMessage(null);
    setPassword("");
    setConfirmPassword("");
    setCode("");
  }

  async function submit() {
    if (!runtime) return;
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      if (mode === "sign-in") {
        if (!email.trim() || !password) throw new Error("Enter your email and password.");
        if (!cognitoAvailable) throw new Error("Email sign-in is not configured for this build.");
        await signInCognito(email.trim(), password);
      } else if (mode === "new-password") {
        if (!challenge) throw new Error("Sign in again to continue.");
        if (password.length < 12) throw new Error("Use at least 12 characters.");
        if (password !== confirmPassword) throw new Error("The new passwords do not match.");
        await completeNewPassword(challenge.username, challenge.session, password);
      } else if (mode === "register") {
        if (!email.trim() || !password) throw new Error("Enter your email and password.");
        if (password.length < 12) throw new Error("Use a password with at least 12 characters.");
        if (password !== confirmPassword) throw new Error("The passwords do not match.");
        if (!cognitoAvailable) throw new Error("Registration is not configured for this build.");
        const result = await runtime.register(email.trim(), password, name.trim() || undefined);
        notify(
          result.userConfirmed
            ? "Account created."
            : `Confirmation code sent${result.destination ? ` to ${result.destination}` : ""}.`,
        );
        setMode(result.userConfirmed ? "sign-in" : "confirm");
        setMessage(
          result.userConfirmed
            ? "Your account is ready. Sign in with your new password."
            : "Enter the confirmation code we sent to finish creating your account.",
        );
      } else if (mode === "confirm") {
        if (!email.trim() || !code.trim()) throw new Error("Enter your email and code.");
        if (!cognitoAvailable) throw new Error("Registration is not configured for this build.");
        await runtime.confirmRegistration(email.trim(), code.trim());
        notify("Email confirmed. Sign in to continue.");
        setMode("sign-in");
        setMessage("Your email is confirmed. Sign in to continue.");
      } else if (mode === "forgot") {
        if (!email.trim()) throw new Error("Enter your account email.");
        if (!cognitoAvailable) throw new Error("Password reset is not configured for this build.");
        await runtime.requestPasswordReset(email.trim());
        setMode("reset");
        setMessage("If that account exists, a reset code is on its way.");
      } else if (mode === "reset") {
        if (!email.trim() || !code.trim() || !password) {
          throw new Error("Enter your email, reset code and new password.");
        }
        if (password !== confirmPassword) throw new Error("The new passwords do not match.");
        if (!cognitoAvailable) throw new Error("Password reset is not configured for this build.");
        await runtime.confirmPasswordReset(email.trim(), code.trim(), password);
        setMode("sign-in");
        setMessage("Password reset. Sign in with your new password.");
        notify("Password updated.");
      }
    } catch (errorValue) {
      const nextChallenge = challengeFrom(errorValue);
      if (nextChallenge) {
        setChallenge({
          username: nextChallenge.username,
          session: nextChallenge.session,
        });
        setMode("new-password");
        setMessage("Your account needs a new password before you can continue.");
      } else {
        setError(describeError(errorValue));
      }
    } finally {
      setBusy(false);
    }
  }

  async function beginHosted(identityProvider?: string) {
    setError(null);
    setBusy(true);
    try {
      await hostedSignIn(identityProvider);
    } catch (errorValue) {
      setError(describeError(errorValue));
    } finally {
      setBusy(false);
    }
  }

  const heading =
    mode === "register"
      ? "Create your account"
      : mode === "confirm"
        ? "Confirm your email"
        : mode === "forgot"
          ? "Reset your password"
          : mode === "reset"
            ? "Choose a new password"
            : mode === "new-password"
              ? "Set a new password"
              : "Welcome back";

  const description =
    mode === "register"
      ? "Create an account to sync bookmarks, highlights, notes and reading plans across your devices."
      : mode === "confirm"
        ? "Enter the code from your email to verify your account."
        : mode === "forgot"
          ? "We will email a reset code if the account exists."
          : mode === "reset"
            ? "Enter the code from your email and choose a new password."
            : mode === "new-password"
              ? "Your first sign-in requires a permanent password."
              : "Sign in to sync your study across devices. Your downloaded Bible remains available offline.";

  const submitTitle =
    mode === "register"
      ? "Create account"
      : mode === "confirm"
        ? "Confirm email"
        : mode === "forgot"
          ? "Send reset code"
          : mode === "reset" || mode === "new-password"
            ? "Save password and sign in"
            : "Sign in";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: 22, gap: 22, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ alignItems: "center", gap: 10, paddingTop: 22 }}>
            <View
              style={{
                width: 74,
                height: 74,
                borderRadius: 21,
                backgroundColor: colors.primary,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 2,
                borderColor: colors.gold,
              }}
            >
              <Text style={{ color: colors.onPrimary, fontWeight: "800", fontSize: 26 }}>HW</Text>
            </View>
            <Text style={{ color: colors.text, fontSize: 34, fontWeight: "800" }}>HolyWord</Text>
            <Text style={{ color: colors.muted, textAlign: "center", maxWidth: 320 }}>
              Read, search and study Scripture in public-domain translations that stay available
              offline.
            </Text>
            <SyncBadge />
          </View>

          <Card style={{ gap: 16 }}>
            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.text, fontSize: 23, fontWeight: "800" }}>{heading}</Text>
              <Text style={{ color: colors.muted, lineHeight: 21 }}>{description}</Text>
            </View>

            {message ? (
              <View
                style={{
                  backgroundColor: colors.primarySoft,
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <Text style={{ color: colors.text, lineHeight: 20 }}>{message}</Text>
              </View>
            ) : null}

            {error ? (
              <Text accessibilityRole="alert" style={{ color: colors.danger, lineHeight: 20 }}>
                {error}
              </Text>
            ) : null}

            {mode === "register" ? (
              <Field label="Name (optional)">
                <AppTextInput
                  value={name}
                  onChangeText={setName}
                  autoComplete="name"
                  textContentType="name"
                  placeholder="Your name"
                />
              </Field>
            ) : null}

            {mode !== "reset" && mode !== "new-password" ? (
              <Field label="Email">
                <AppTextInput
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoComplete="email"
                  textContentType="emailAddress"
                  keyboardType="email-address"
                  editable={!busy}
                  placeholder="you@example.com"
                />
              </Field>
            ) : null}

            {mode === "confirm" || mode === "reset" ? (
              <Field label="Confirmation code">
                <AppTextInput
                  value={code}
                  onChangeText={setCode}
                  autoCapitalize="characters"
                  autoComplete="one-time-code"
                  keyboardType="number-pad"
                  editable={!busy}
                  placeholder="123456"
                />
              </Field>
            ) : null}

            {mode !== "forgot" && mode !== "confirm" ? (
              <Field label={mode === "sign-in" ? "Password" : "New password"}>
                <AppTextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                  textContentType={mode === "sign-in" ? "password" : "newPassword"}
                  editable={!busy}
                  placeholder="At least 12 characters"
                />
              </Field>
            ) : null}

            {mode === "new-password" || mode === "reset" || mode === "register" ? (
              <Field label="Confirm new password">
                <AppTextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="new-password"
                  textContentType="newPassword"
                  editable={!busy}
                  placeholder="Repeat the password"
                />
              </Field>
            ) : null}

            <AppButton
              title={submitTitle}
              onPress={() => void submit()}
              loading={busy || authBusy}
              disabled={!online && mode !== "new-password"}
            />
            {!online ? (
              <Text style={{ color: colors.subtle, fontSize: 12 }}>
                Sign-in needs a connection. Downloaded Scripture can be opened once you are signed
                in.
              </Text>
            ) : null}

            {mode === "sign-in" ? (
              <>
                <Row style={{ justifyContent: "space-between" }}>
                  <Text
                    accessibilityRole="button"
                    onPress={() => switchMode("forgot")}
                    style={{ color: colors.primary, fontWeight: "600" }}
                  >
                    Forgot password?
                  </Text>
                  <Text
                    accessibilityRole="button"
                    onPress={() => switchMode("register")}
                    style={{ color: colors.primary, fontWeight: "600" }}
                  >
                    Create account
                  </Text>
                </Row>
                {hostedAvailable ? (
                  <>
                    <View style={styles.dividerRow}>
                      <View style={[styles.divider, { backgroundColor: colors.border }]} />
                      <Text style={{ color: colors.subtle, fontSize: 12 }}>OR</Text>
                      <View style={[styles.divider, { backgroundColor: colors.border }]} />
                    </View>
                    <AppButton
                      title="Continue with Google"
                      variant="secondary"
                      icon={<Ionicons name="logo-google" size={18} color={colors.primary} />}
                      onPress={() => void beginHosted()}
                      disabled={!online}
                    />
                    <AppButton
                      title="More sign-in options"
                      variant="ghost"
                      onPress={() => void beginHosted("COGNITO")}
                      disabled={!online}
                    />
                  </>
                ) : null}
              </>
            ) : (
              <Text
                accessibilityRole="button"
                onPress={() => switchMode("sign-in")}
                style={{ color: colors.primary, fontWeight: "600", textAlign: "center" }}
              >
                Back to sign in
              </Text>
            )}
          </Card>

          {DEV_AUTH_ENABLED ? (
            <Card style={{ borderStyle: "dashed" }}>
              <Row>
                <Ionicons name="construct-outline" size={20} color={colors.subtle} />
                <Text style={{ color: colors.text, fontWeight: "700", flex: 1 }}>
                  Local development sign-in
                </Text>
              </Row>
              <MutedText>
                Cognito is not configured. A local identity is accepted by the development API on
                this machine only. Never enable this mode in a production build.
              </MutedText>
              <AppButton
                title="Continue as local reader"
                variant="secondary"
                disabled={!email.trim() || busy || !online}
                onPress={async () => {
                  setError(null);
                  setBusy(true);
                  try {
                    await signInDev(email.trim());
                  } catch (errorValue) {
                    setError(describeError(errorValue));
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </Card>
          ) : null}

          <Text style={{ color: colors.subtle, fontSize: 11, textAlign: "center", lineHeight: 17 }}>
            HolyWord only serves supplied Bible packages with verified checksums. The King James
            Version is public domain. Licensed translations remain disabled until written permission
            and licensed files are in place.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  divider: { height: StyleSheet.hairlineWidth, flex: 1 },
});
