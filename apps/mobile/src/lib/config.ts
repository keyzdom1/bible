import type { CognitoConfig } from "@holyword/core";

export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:4000"
).replace(/\/+$/, "");

export const APP_URL = process.env.EXPO_PUBLIC_APP_URL ?? "holyword://auth";

export const COGNITO_CONFIG: CognitoConfig | null = (() => {
  const region = process.env.EXPO_PUBLIC_COGNITO_REGION?.trim();
  const clientId = process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID?.trim();
  if (!region || !clientId) return null;
  return {
    region,
    clientId,
    domain: process.env.EXPO_PUBLIC_COGNITO_DOMAIN?.trim() || undefined,
    redirectUri: process.env.EXPO_PUBLIC_COGNITO_REDIRECT_URI?.trim() || APP_URL,
  };
})();

export const DEV_AUTH_ENABLED =
  process.env.EXPO_PUBLIC_AUTH_DEV_MODE === "true" || (__DEV__ && COGNITO_CONFIG === null);

export const BRAND = {
  royalBlue: "#123B8F",
  royalRed: "#C9182B",
  gold: "#F4B942",
  cyan: "#00B8D9",
  purple: "#6C3FC5",
  emerald: "#16A085",
  navy: "#081B3A",
  lightGray: "#F4F7FB",
  white: "#FFFFFF",
} as const;
