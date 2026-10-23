"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CognitoError } from "@holyword/core";
import { useApp } from "@/components/app-provider";
import { COGNITO_CONFIG, DEV_AUTH_ENABLED } from "@/lib/config";

type Mode = "signin" | "register" | "confirm" | "forgot" | "reset" | "new-password";

interface PasswordChallenge {
  readonly challengeName: "NEW_PASSWORD_REQUIRED";
  readonly session: string;
  readonly username: string;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function LoginPage() {
  const {
    runtime,
    session,
    authBusy,
    signInDev,
    signInCognito,
    signInWithTokens,
    completeNewPassword,
  } = useApp();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [devEmail, setDevEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<PasswordChallenge | null>(null);
  const hashHandled = useRef(false);

  useEffect(() => {
    if (!runtime || hashHandled.current || session) return;
    const hash = window.location.hash;
    if (!hash || !hash.includes("id_token=")) return;
    hashHandled.current = true;
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const state = params.get("state");
    const tokens = runtime.readHostedTokens(hash);
    history.replaceState(null, "", window.location.pathname);
    if (params.get("error")) {
      setError(params.get("error_description") ?? "Sign-in was cancelled.");
      return;
    }
    if (!tokens || !runtime.verifyOauthState(state)) {
      setError("The sign-in response could not be verified. Please try again.");
      return;
    }
    void signInWithTokens(tokens).catch((signInError: unknown) => setError(messageOf(signInError)));
  }, [runtime, session, signInWithTokens]);

  async function onSignIn(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await signInCognito(email, password);
    } catch (signInError) {
      const nextChallenge = (signInError as CognitoError & { challenge?: PasswordChallenge })
        .challenge;
      if (signInError instanceof CognitoError && nextChallenge) {
        setChallenge(nextChallenge);
        setMode("new-password");
        setPassword("");
        setConfirmPassword("");
        return;
      }
      setError(messageOf(signInError));
    }
  }

  async function onNewPassword(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!challenge) return;
    if (password !== confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }
    try {
      await completeNewPassword(challenge.username, challenge.session, password);
    } catch (errorValue) {
      setError(messageOf(errorValue));
    }
  }

  async function onRegister(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    if (!runtime) return;
    try {
      const result = await runtime.register(email, password, name);
      setSuccess(
        result.destination
          ? `We sent a confirmation code to ${result.destination}.`
          : "Check your email for a confirmation code.",
      );
      setMode("confirm");
    } catch (errorValue) {
      setError(messageOf(errorValue));
    }
  }

  async function onConfirm(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!runtime) return;
    try {
      await runtime.confirmRegistration(email, code);
      setSuccess("Your email is confirmed. You can sign in now.");
      setMode("signin");
      setCode("");
    } catch (errorValue) {
      setError(messageOf(errorValue));
    }
  }

  async function onResend() {
    setError(null);
    if (!runtime) return;
    try {
      await runtime.resendConfirmation(email);
      setSuccess("A new confirmation code is on its way.");
    } catch (errorValue) {
      setError(messageOf(errorValue));
    }
  }

  async function onForgot(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!runtime) return;
    try {
      await runtime.requestPasswordReset(email);
      setSuccess("Enter the reset code we sent to your email.");
      setMode("reset");
    } catch (errorValue) {
      setError(messageOf(errorValue));
    }
  }

  async function onReset(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!runtime) return;
    if (password !== confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }
    try {
      await runtime.confirmPasswordReset(email, code, password);
      setSuccess("Your password was reset. Sign in with your new password.");
      setMode("signin");
      setCode("");
      setPassword("");
      setConfirmPassword("");
    } catch (errorValue) {
      setError(messageOf(errorValue));
    }
  }

  async function onDevSignIn(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await signInDev(devEmail);
    } catch (errorValue) {
      setError(messageOf(errorValue));
    }
  }

  async function hostedSignIn(identityProvider?: string) {
    setError(null);
    if (!runtime) return;
    const url = await runtime.hostedLoginUrl(identityProvider);
    if (!url) {
      setError("Hosted sign-in is not configured.");
      return;
    }
    window.location.assign(url);
  }

  const cognito = COGNITO_CONFIG !== null;

  return (
    <div className="auth-page">
      <section className="auth-hero" aria-label="About HolyWord">
        <span className="brand-mark" aria-hidden="true">
          HW
        </span>
        <p className="eyebrow" style={{ color: "#F4B942" }}>
          HolyWord Bible
        </p>
        <h1>Read. Grow. Be Closer to God.</h1>
        <p>
          Download a Bible version once, then read, search, highlight and make notes wherever you
          are. Your study follows you to every device when you reconnect.
        </p>
        <div className="hero-points">
          <span className="pill">Works offline</span>
          <span className="pill">Private study notes</span>
          <span className="pill">Multi-device sync</span>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <h2>
            {mode === "signin"
              ? "Welcome back"
              : mode === "register"
                ? "Create your account"
                : mode === "confirm"
                  ? "Confirm your email"
                  : mode === "forgot"
                    ? "Reset your password"
                    : mode === "reset"
                      ? "Choose a new password"
                      : "Set a permanent password"}
          </h2>
          <p className="muted">
            {mode === "confirm"
              ? "Enter the code from your email to activate your account."
              : mode === "reset"
                ? "Enter the code from your email and choose a new password."
                : mode === "new-password"
                  ? "Your temporary password must be changed before you can continue."
                  : "Your library and study notes stay private to your account."}
          </p>

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="form-success" role="status">
              {success}
            </p>
          ) : null}

          {cognito && (mode === "signin" || mode === "register") ? (
            <div className="auth-tabs" role="tablist" aria-label="Account action">
              <button
                type="button"
                role="tab"
                className="auth-tab"
                aria-selected={mode === "signin"}
                onClick={() => {
                  setMode("signin");
                  setError(null);
                }}
              >
                Sign in
              </button>
              <button
                type="button"
                role="tab"
                className="auth-tab"
                aria-selected={mode === "register"}
                onClick={() => {
                  setMode("register");
                  setError(null);
                }}
              >
                Create account
              </button>
            </div>
          ) : null}

          {mode === "signin" ? (
            <>
              {cognito ? (
                <form className="auth-form" onSubmit={onSignIn}>
                  <div className="field">
                    <label htmlFor="email">Email address</label>
                    <input
                      className="input"
                      id="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="password">Password</label>
                    <input
                      className="input"
                      id="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </div>
                  <button className="button" type="submit" disabled={authBusy}>
                    {authBusy ? "Signing in…" : "Sign in"}
                  </button>
                  <button
                    type="button"
                    className="button button-ghost button-small"
                    onClick={() => {
                      setMode("forgot");
                      setError(null);
                    }}
                  >
                    Forgot password?
                  </button>
                </form>
              ) : null}

              {cognito ? (
                <div className="auth-divider">
                  <span>or</span>
                </div>
              ) : null}

              {cognito ? (
                <div className="stack">
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => void hostedSignIn("Google")}
                  >
                    Continue with Google
                  </button>
                  <button
                    type="button"
                    className="button button-ghost"
                    onClick={() => void hostedSignIn()}
                  >
                    More sign-in options
                  </button>
                </div>
              ) : null}

              {DEV_AUTH_ENABLED ? (
                <form className="auth-form" onSubmit={onDevSignIn}>
                  {cognito ? (
                    <div className="auth-divider">
                      <span>local development</span>
                    </div>
                  ) : null}
                  <div className="field">
                    <label htmlFor="dev-email">Development email</label>
                    <input
                      className="input"
                      id="dev-email"
                      type="email"
                      autoComplete="email"
                      required
                      placeholder="reader@example.com"
                      value={devEmail}
                      onChange={(event) => setDevEmail(event.target.value)}
                    />
                  </div>
                  <button className="button button-secondary" type="submit" disabled={authBusy}>
                    {authBusy ? "Opening…" : "Continue in development mode"}
                  </button>
                  <p className="subtle">
                    Local development only. The API must run with <code>AUTH_DEV_MODE=true</code>.
                  </p>
                </form>
              ) : null}

              {!cognito && !DEV_AUTH_ENABLED ? (
                <p className="form-error">
                  Sign-in is not configured. Set the Cognito environment variables for this build.
                </p>
              ) : null}
            </>
          ) : null}

          {mode === "register" ? (
            <form className="auth-form" onSubmit={onRegister}>
              <div className="field">
                <label htmlFor="name">Name (optional)</label>
                <input
                  className="input"
                  id="name"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="register-email">Email address</label>
                <input
                  className="input"
                  id="register-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="register-password">Password</label>
                <input
                  className="input"
                  id="register-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <span className="subtle">Use at least 12 characters.</span>
              </div>
              <div className="field">
                <label htmlFor="register-confirm">Confirm password</label>
                <input
                  className="input"
                  id="register-confirm"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </div>
              <button className="button" type="submit" disabled={authBusy}>
                Create account
              </button>
              <button
                type="button"
                className="button button-ghost"
                onClick={() => setMode("signin")}
              >
                Back to sign in
              </button>
            </form>
          ) : null}

          {mode === "confirm" ? (
            <form className="auth-form" onSubmit={onConfirm}>
              <div className="field">
                <label htmlFor="confirm-email">Email address</label>
                <input
                  className="input"
                  id="confirm-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="confirm-code">Confirmation code</label>
                <input
                  className="input"
                  id="confirm-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                />
              </div>
              <button className="button" type="submit" disabled={authBusy}>
                Confirm email
              </button>
              <button type="button" className="button button-secondary" onClick={onResend}>
                Resend code
              </button>
              <button
                type="button"
                className="button button-ghost"
                onClick={() => setMode("signin")}
              >
                Back to sign in
              </button>
            </form>
          ) : null}

          {mode === "forgot" ? (
            <form className="auth-form" onSubmit={onForgot}>
              <div className="field">
                <label htmlFor="forgot-email">Email address</label>
                <input
                  className="input"
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <button className="button" type="submit" disabled={authBusy}>
                Send reset code
              </button>
              <button
                type="button"
                className="button button-ghost"
                onClick={() => setMode("signin")}
              >
                Back to sign in
              </button>
            </form>
          ) : null}

          {mode === "reset" ? (
            <form className="auth-form" onSubmit={onReset}>
              <div className="field">
                <label htmlFor="reset-code">Reset code</label>
                <input
                  className="input"
                  id="reset-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="reset-password">New password</label>
                <input
                  className="input"
                  id="reset-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="reset-confirm">Confirm new password</label>
                <input
                  className="input"
                  id="reset-confirm"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </div>
              <button className="button" type="submit" disabled={authBusy}>
                Reset password
              </button>
            </form>
          ) : null}

          {mode === "new-password" ? (
            <form className="auth-form" onSubmit={onNewPassword}>
              <div className="field">
                <label htmlFor="new-password">New password</label>
                <input
                  className="input"
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="new-password-confirm">Confirm new password</label>
                <input
                  className="input"
                  id="new-password-confirm"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </div>
              <button className="button" type="submit" disabled={authBusy}>
                Set password and continue
              </button>
            </form>
          ) : null}

          <p className="auth-footnote">
            HolyWord only enables Bible versions that are public domain or covered by a confirmed
            publisher licence. The King James Version is public domain.
          </p>
        </div>
      </section>
    </div>
  );
}
