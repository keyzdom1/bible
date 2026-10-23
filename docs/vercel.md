# Deploying to Vercel

Launch guide for hosting the HolyWord web PWA and REST API on Vercel, with
Neon for PostgreSQL and Amazon Cognito for sign-in. The AWS path
([`docs/infra.md`](infra.md)) stays valid and untouched; nothing here deletes or
contradicts it.

## What runs where

| Piece                | On Vercel                                                       |
| -------------------- | --------------------------------------------------------------- |
| Web PWA (`apps/web`) | Native Next.js project                                          |
| API (`apps/api`)     | One serverless function (`api/index.ts`) wrapping the Nest app  |
| Database             | Neon (any Postgres works; the URL is all the API needs)         |
| Content packages     | Bundled into the function (5.9 MB KJV); served with JWT tickets |
| Sign-in              | Amazon Cognito (hosted AWS service, independent of any server)  |
| Search               | The API's local package-scan fallback (`OPENSEARCH_*` unset)    |

Not used on this path: S3, CloudFront, OpenSearch, RDS, Elastic Beanstalk and
the WAF. `CONTENT_DELIVERY_MODE=local` serves the committed, checksummed KJV
package from inside the function; the licence guardrails are unchanged (KJV
public domain, every other version stays disabled and unlicensed).

## Step 1 — Neon (database)

1. Create a project at <https://neon.tech>. Pick a region close to your Vercel
   region.
2. From the connection details dialog collect **two** strings:
   - the **pooled** endpoint (transaction mode) — runtime `DATABASE_URL`;
   - the **direct** endpoint — used once, for migrations.
3. Apply the schema and seed from this repository:

   ```powershell
   $env:DATABASE_URL = "<direct endpoint, includes /neondb>"
   pnpm db:migrate
   pnpm db:seed
   ```

   `db:seed` is idempotent and also seeds the 21-day John reading plan.

## Step 2 — Cognito (sign-in)

The web app talks to the user pool directly (`amazon-cognito-identity-js`
style calls); no hosted UI is required.

1. AWS Console → **Cognito** → **Create user pool**:
   - Sign-in options: **Email** (no username, no phone).
   - Required standard attribute: **email**.
   - Self-service sign-up: **enabled** (the login page offers sign-up, confirm
     code and forgot-password).
   - MFA: none for launch (enable TOTP later if desired).
   - Password: minimum 12 characters, require at least one symbol.
2. Add an **app client**:
   - Client type: **Public client** — no client secret.
   - Name it `holyword-web`.
   - Auth flows: enable **`ALLOW_USER_PASSWORD_AUTH`** (the app's client uses
     `USER_PASSWORD_AUTH`; nothing else beyond the standard refresh flow is
     needed).
3. Copy from the pool overview: **User pool ID** (`us-east-1_…`) and the
   **App client ID**.
4. Your own address becomes the first admin (`ADMIN_EMAILS`) — admins can
   enable/disable versions through `/v1/admin`.

## Step 3 — Vercel projects

Import this repository twice (Vercel → Add New → Project):

| Project        | Root Directory | Framework preset         |
| -------------- | -------------- | ------------------------ |
| `holyword-web` | `apps/web`     | Next.js (auto)           |
| `holyword-api` | `apps/api`     | Other (uses vercel.json) |

Create the **API project first** — its production URL
(`https://holyword-api-<you>.vercel.app`) is needed on the web project.

The API project's build command comes from the `vercel-build` script in
`apps/api/package.json`: it builds the workspace packages (`@holyword/core`,
`@holyword/db`) and stages `content/packages` under `apps/api/content/`, where
`vercel.json` includes it into the function bundle. `scripts/stage-vercel-content.mjs`
does the copying; the staged directory is gitignored.

### Environment variables — API project

| Variable                | Value                                         |
| ----------------------- | --------------------------------------------- |
| `DATABASE_URL`          | Neon **pooled** endpoint                      |
| `SESSION_SECRET`        | `openssl rand -hex 32` (32+ chars)            |
| `DOWNLOAD_TOKEN_SECRET` | `openssl rand -hex 32` (different value)      |
| `COGNITO_REGION`        | Pool region, e.g. `us-east-1`                 |
| `COGNITO_USER_POOL_ID`  | From Step 2                                   |
| `COGNITO_CLIENT_ID`     | From Step 2                                   |
| `ADMIN_EMAILS`          | Your address (comma-separated for several)    |
| `WEB_ORIGIN`            | `https://<web-project>.vercel.app`            |
| `CONTENT_BASE_URL`      | `https://<api-project>.vercel.app/v1/content` |
| `CONTENT_DELIVERY_MODE` | `local`                                       |
| `CONTENT_PACKAGE_DIR`   | `content/packages`                            |
| `VERSION_FLAGS`         | `kjv`                                         |

Notes:

- `NODE_ENV=production` is set by the function runtime. In production the API
  requires Cognito and both secrets, and it refuses `AUTH_DEV_MODE=true` —
  leave that variable unset.
- `CONTENT_DELIVERY_MODE=local` is accepted in production **only** with an
  explicit `CONTENT_PACKAGE_DIR`, which is exactly the bundled-packages case
  (see the guard in `apps/api/src/config.ts`).

### Environment variables — Web project

| Variable                        | Value                              |
| ------------------------------- | ---------------------------------- |
| `NEXT_PUBLIC_API_BASE_URL`      | `https://<api-project>.vercel.app` |
| `NEXT_PUBLIC_APP_URL`           | `https://<web-project>.vercel.app` |
| `NEXT_PUBLIC_COGNITO_REGION`    | Pool region                        |
| `NEXT_PUBLIC_COGNITO_CLIENT_ID` | App client ID                      |

`NEXT_PUBLIC_*` values are inlined at build time — change one and **redeploy**.
Leave `NEXT_PUBLIC_AUTH_DEV_MODE` unset: with a configured pool the production
build disables dev sign-in automatically.

## Step 4 — Deploy and verify

Connect both projects to the `master` branch (auto-deploy on push), or run
`vercel --prod` from each app directory. Then smoke-test:

1. `GET https://<api-project>.vercel.app/health` → `{"status":"ok"}`.
2. Open the web app → sign up with an email → confirm the code → sign in.
3. The catalog lists KJV only; open a chapter (served online from the bundle).
4. Create a note, reload, verify it persists (Neon round-trip).
5. Library → download KJV: the ticket URL points at the API project and the
   package verifies before install.

## Operational notes

- **Cookies**: the session cookie is `httpOnly`, `SameSite=Lax` and secure in
  production. Both apps on `*.vercel.app` are same-site, so this works as
  deployed. If you later map custom domains, keep both under one registrable
  domain (e.g. `holyword.app` and `api.holyword.app`).
- **Plan limits**: Vercel Hobby is free but non-commercial; the API function
  allows 30 s per request (`maxDuration` in `apps/api/vercel.json`), which
  covers the 5.9 MB package download with room to spare. Commercial use needs
  Vercel Pro; Neon's free tier covers a launch-scale database.
- **Search** answers from the verified local package scan. Adding OpenSearch
  later is configuration only (`OPENSEARCH_URL` and friends).
- **Moving back to AWS delivery**: set `CONTENT_DELIVERY_MODE=cloudfront` with
  the three `CLOUDFRONT_*` variables and publish the packages with
  `pnpm content:publish`; the code paths are already built and tested.
- **Expo app**: point it at the same API URL; no code changes are required.
