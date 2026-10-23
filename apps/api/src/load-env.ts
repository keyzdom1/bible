import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadDotEnv } from "dotenv";

/**
 * Loads the repo-root `.env` for local development. Nest does not load dotenv by
 * default, and the API is started from either `apps/api` (pnpm) or the repo root
 * (compiled `dist/main.js`), so probe both source and build-relative paths.
 * Real deployments provide environment variables directly.
 */
export function loadEnvironment(): void {
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(__dirname, "../../../.env"),
    resolve(__dirname, "../../../../.env"),
  ];
  const path = [...new Set(candidates)].find((candidate) => existsSync(candidate));
  if (!path) return;

  const result = loadDotEnv({ path, quiet: true });
  if (result.error) throw result.error;

  // `.env.example` intentionally contains empty placeholders for optional vars.
  // Treat those as unset so Zod defaults and the "required in production" checks
  // behave the same as when the variable is absent.
  for (const [key, value] of Object.entries(result.parsed ?? {})) {
    if (value === "" && process.env[key] === "") delete process.env[key];
  }
}
