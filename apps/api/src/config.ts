import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1).optional(),
  SESSION_SECRET: z.string().min(32).optional(),
  SESSION_COOKIE_NAME: z.string().min(1).default("holyword_session"),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  AUTH_DEV_MODE: z.enum(["true", "false"]).optional(),
  ADMIN_EMAILS: z.string().default(""),
  COGNITO_REGION: z.string().min(1).optional(),
  COGNITO_USER_POOL_ID: z.string().min(1).optional(),
  COGNITO_CLIENT_ID: z.string().min(1).optional(),
  CONTENT_PACKAGE_DIR: z.string().min(1).optional(),
  CONTENT_BASE_URL: z.string().url().default("http://localhost:4000/v1/content"),
  CONTENT_DELIVERY_MODE: z.enum(["local", "cloudfront"]).default("local"),
  CLOUDFRONT_CONTENT_URL: z.string().url().optional(),
  CLOUDFRONT_KEY_PAIR_ID: z.string().min(1).optional(),
  CLOUDFRONT_PRIVATE_KEY_PATH: z.string().min(1).optional(),
  CLOUDFRONT_PRIVATE_KEY: z.string().min(1).optional(),
  VERSION_FLAGS: z.string().optional(),
  DOWNLOAD_TOKEN_SECRET: z.string().min(32).optional(),
  DOWNLOAD_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  OPENSEARCH_URL: z.string().url().optional(),
  OPENSEARCH_INDEX: z
    .string()
    .regex(/^[a-z0-9][a-z0-9_-]*$/)
    .default("holyword-verses"),
  OPENSEARCH_USERNAME: z.string().min(1).optional(),
  OPENSEARCH_PASSWORD: z.string().optional(),
  OPENSEARCH_TIMEOUT_MS: z.coerce.number().int().positive().max(30_000).default(2500),
});

export interface CognitoConfig {
  readonly region: string;
  readonly userPoolId: string;
  readonly clientId: string;
}

export interface CloudFrontConfig {
  readonly baseUrl: string;
  readonly keyPairId: string;
  readonly privateKeyPem: string;
}

export interface OpenSearchConfig {
  readonly url: string;
  readonly index: string;
  readonly username?: string;
  readonly password?: string;
  readonly timeoutMs: number;
}

export type ContentDeliveryMode = "local" | "cloudfront";

export interface AppConfig {
  readonly nodeEnv: "development" | "test" | "production";
  readonly port: number;
  readonly databaseUrl: string | undefined;
  readonly sessionSecret: string;
  readonly sessionCookieName: string;
  readonly sessionTtlSeconds: number;
  readonly webOrigin: string;
  readonly devAuth: boolean;
  readonly adminEmails: readonly string[];
  readonly cognito: CognitoConfig | undefined;
  readonly contentPackageDir: string;
  readonly contentBaseUrl: string;
  readonly contentDeliveryMode: ContentDeliveryMode;
  readonly cloudFront: CloudFrontConfig | undefined;
  /** When present, only these version ids pass the feature-flag gate. */
  readonly versionFlags: ReadonlySet<string> | undefined;
  readonly downloadTokenSecret: string;
  readonly downloadTokenTtlSeconds: number;
  readonly openSearch: OpenSearchConfig | undefined;
}

const DEV_SESSION_SECRET = "dev-only-session-secret-change-before-deploying";
const DEV_DOWNLOAD_SECRET = "dev-only-download-secret-change-before-deploying";
const VERSION_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Parses `VERSION_FLAGS=kjv,niv`. An empty value means "use the catalog's enabled
 * flag"; a non-empty value is an allow-list, so a version is only live when both
 * its audited catalog flag and this deployment flag are on.
 */
export function parseVersionFlags(raw: string | undefined): ReadonlySet<string> | undefined {
  const values = (raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (values.length === 0) return undefined;
  for (const value of values) {
    if (!VERSION_ID_PATTERN.test(value)) {
      throw new Error(`Invalid version id in VERSION_FLAGS: "${value}"`);
    }
  }
  return new Set(values);
}

function privateKeyFromEnv(raw: z.infer<typeof envSchema>): string | undefined {
  if (raw.CLOUDFRONT_PRIVATE_KEY) {
    return raw.CLOUDFRONT_PRIVATE_KEY.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
  }
  if (raw.CLOUDFRONT_PRIVATE_KEY_PATH) {
    return readFileSync(resolve(raw.CLOUDFRONT_PRIVATE_KEY_PATH), "utf8");
  }
  return undefined;
}

/**
 * The API runs from both `apps/api/src` (ts-jest/tsx) and `apps/api/dist/src`
 * (compiled Nest). Walk up to the pnpm workspace root so the default content
 * mirror is the same in both cases instead of depending on the current cwd.
 */
function workspaceRoot(start: string): string {
  let current = resolve(start);
  for (;;) {
    if (
      existsSync(join(current, "pnpm-workspace.yaml")) ||
      existsSync(join(current, "content", "packages"))
    ) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) return resolve(start);
    current = parent;
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  const raw = parsed.data;
  const isProduction = raw.NODE_ENV === "production";
  const devAuth = raw.AUTH_DEV_MODE === "true" || raw.NODE_ENV === "test";

  if (isProduction && raw.AUTH_DEV_MODE === "true") {
    throw new Error("AUTH_DEV_MODE cannot be enabled in production");
  }

  const sessionSecret = raw.SESSION_SECRET ?? (isProduction ? undefined : DEV_SESSION_SECRET);
  if (!sessionSecret) {
    throw new Error("SESSION_SECRET is required in production (minimum 32 characters)");
  }
  const downloadTokenSecret =
    raw.DOWNLOAD_TOKEN_SECRET ?? (isProduction ? undefined : DEV_DOWNLOAD_SECRET);
  if (!downloadTokenSecret) {
    throw new Error("DOWNLOAD_TOKEN_SECRET is required in production (minimum 32 characters)");
  }

  const cognito =
    raw.COGNITO_REGION && raw.COGNITO_USER_POOL_ID && raw.COGNITO_CLIENT_ID
      ? {
          region: raw.COGNITO_REGION,
          userPoolId: raw.COGNITO_USER_POOL_ID,
          clientId: raw.COGNITO_CLIENT_ID,
        }
      : undefined;

  if (isProduction && !cognito) {
    throw new Error("Cognito configuration is required in production");
  }
  if (!isProduction && !cognito && !devAuth) {
    throw new Error("Either Cognito configuration or AUTH_DEV_MODE=true is required");
  }

  // Production normally serves packages through CloudFront. Local delivery is
  // accepted only when the package directory is stated explicitly — the
  // serverless case, where verified packages are bundled into the function
  // itself (e.g. Vercel). An accidental local-mode production deploy with no
  // deliberate directory is still rejected.
  if (isProduction && raw.CONTENT_DELIVERY_MODE !== "cloudfront" && !raw.CONTENT_PACKAGE_DIR) {
    throw new Error(
      "CONTENT_DELIVERY_MODE=cloudfront is required in production unless CONTENT_PACKAGE_DIR is set explicitly",
    );
  }

  let cloudFront: CloudFrontConfig | undefined;
  if (raw.CONTENT_DELIVERY_MODE === "cloudfront") {
    const privateKeyPem = privateKeyFromEnv(raw);
    if (!raw.CLOUDFRONT_CONTENT_URL || !raw.CLOUDFRONT_KEY_PAIR_ID || !privateKeyPem) {
      throw new Error(
        "CloudFront delivery requires CLOUDFRONT_CONTENT_URL, CLOUDFRONT_KEY_PAIR_ID and either CLOUDFRONT_PRIVATE_KEY or CLOUDFRONT_PRIVATE_KEY_PATH",
      );
    }
    cloudFront = {
      baseUrl: raw.CLOUDFRONT_CONTENT_URL.replace(/\/+$/, ""),
      keyPairId: raw.CLOUDFRONT_KEY_PAIR_ID,
      privateKeyPem,
    };
  }

  const versionFlags = parseVersionFlags(raw.VERSION_FLAGS);

  const openSearch = raw.OPENSEARCH_URL
    ? {
        url: raw.OPENSEARCH_URL.replace(/\/+$/, ""),
        index: raw.OPENSEARCH_INDEX,
        username: raw.OPENSEARCH_USERNAME,
        password: raw.OPENSEARCH_PASSWORD,
        timeoutMs: raw.OPENSEARCH_TIMEOUT_MS,
      }
    : undefined;

  return {
    nodeEnv: raw.NODE_ENV,
    port: raw.PORT,
    databaseUrl: raw.DATABASE_URL,
    sessionSecret,
    sessionCookieName: raw.SESSION_COOKIE_NAME,
    sessionTtlSeconds: raw.SESSION_TTL_SECONDS,
    webOrigin: raw.WEB_ORIGIN,
    devAuth,
    adminEmails: raw.ADMIN_EMAILS.split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
    cognito,
    contentPackageDir: resolve(
      raw.CONTENT_PACKAGE_DIR ?? join(workspaceRoot(__dirname), "content", "packages"),
    ),
    contentBaseUrl: raw.CONTENT_BASE_URL.replace(/\/+$/, ""),
    contentDeliveryMode: raw.CONTENT_DELIVERY_MODE,
    cloudFront,
    versionFlags,
    downloadTokenSecret,
    downloadTokenTtlSeconds: raw.DOWNLOAD_TOKEN_TTL_SECONDS,
    openSearch,
  };
}

export const APP_CONFIG = Symbol("APP_CONFIG");
