import type { CognitoConfig } from "@holyword/core";

export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000"
).replace(/\/+$/, "");

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const COGNITO_CONFIG: CognitoConfig | null = (() => {
  const region = process.env.NEXT_PUBLIC_COGNITO_REGION?.trim();
  const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID?.trim();
  if (!region || !clientId) return null;
  return {
    region,
    clientId,
    domain: process.env.NEXT_PUBLIC_COGNITO_DOMAIN?.trim() || undefined,
    redirectUri: process.env.NEXT_PUBLIC_COGNITO_REDIRECT_URI?.trim() || `${APP_URL}/login`,
  };
})();

/**
 * Development sign-in is on by default only while running `next dev` without a
 * configured user pool. Production builds require an explicit opt-in env flag.
 */
export const DEV_AUTH_ENABLED =
  process.env.NEXT_PUBLIC_AUTH_DEV_MODE === "true" ||
  (process.env.NODE_ENV !== "production" && COGNITO_CONFIG === null);

export const APP_NAME = "HolyWord";
export const APP_TAGLINE = "Read. Grow. Be Closer to God.";
