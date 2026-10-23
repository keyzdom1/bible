# HolyWord

Offline-first Bible app for web (PWA), Android and iOS, backed by AWS.
Tagline: **Read · Grow · Be Closer to God.**

This repository contains **all seven phases (Foundation, NestJS backend, content pipeline,
offline engine, web PWA and mobile app, Terraform + CI/CD, QA) of the build described in
[`docs/HolyWord-Build-Prompt.docx`](docs/HolyWord-Build-Prompt.docx) and the
[architecture infographic](docs/architecture-infographic.png).

## What works today

- **Monorepo** — pnpm workspaces + Turborepo, strict TypeScript, ESLint, Prettier.
- **`@holyword/core`** — the shared contract used by every client:
  - 66-book table with USFM codes, OSIS ids, aliases and chapter counts.
  - Verse IDs (`JHN.3.16`) and chapter/range helpers.
  - Reference parser for `John 3:16`, `Jn 3:16-18`, `Genesis 1:1-2:3`, `1 Cor 13`,
    `I John 2:3`, `Jude 3`, `John 3:16,18` and more, with typed errors.
  - Content package schemas (manifest, per-book verse files, versification).
  - Licence policy model and download/copy enforcement helpers.
  - Hybrid logical clock and sync protocol types (push/pull, idempotency, conflicts).
  - API types generated from `docs/openapi.yaml`.
- **`@holyword/db`** — 18-table PostgreSQL schema, generated migration, version catalog
  seed and a 21-day John reading plan.
- **`@holyword/content`** — the ingestion and publishing pipeline:
  - USFM, OSIS and JSON normalizers with canonical book resolution.
  - Duplicate, gap, empty-text, per-book and full-canon validation.
  - Immutable package builder, checksum verifier and deterministic ZIP writer.
  - Pinned public-domain KJV fetch (`ebible.org`, SHA-256 checked on every download).
  - S3 uploader and OpenSearch bulk indexer.
- **`@holyword/api`** — the NestJS 11 REST service:
  - Cognito/dev-token exchange for an httpOnly session cookie; bearer tokens for mobile.
  - Version catalog, checksummed chapter reads and online search.
  - Secure package delivery: short-lived local JWT tickets or CloudFront custom-policy
    signed URLs, gated by licence, entitlement, device limit and region checks.
  - Single-range `Range`/`206`/`416` resume support on package downloads.
  - Per-version deployment flags layered over the audited catalog enabled flag.
  - Bookmarks, highlights, notes (with preserved edit conflicts), folders, reading plans,
    plan progress, reading position and preferences.
  - Idempotent delta sync with HLC last-write-wins, tombstones and a monotonic cursor.
  - Account export and deletion, admin version enable/disable with an audit log.
- **`@holyword/offline`** — the shared offline engine for the web PWA and Expo app:
  - One versioned local schema (`LOCAL_SCHEMA_VERSION = 1`) implemented by Dexie/IndexedDB
    and SQLite/FTS5.
  - Resumable, checksum-verified package downloads with persisted chunks, progress, pause,
    retry, fresh tickets and `Range`/`If-Range`; verification covers every manifest and book
    SHA-256, totals, licence permissions and unsupported encryption.
  - Local word, exact-phrase and scripture-reference search, always scoped to one version.
  - Durable UUID + HLC sync queue with coalescing, idempotent pushes, per-device cursors,
    tombstones and preserved note conflicts.
  - A framework-neutral REST client shared by web and mobile.
- **`docs/openapi.yaml`** — the contract for auth, health, versions, reading, search,
  content delivery, study, sync, account and admin APIs.
- **`apps/web`** — the Next.js 16 PWA:
  - Installable, offline-capable service worker; WCAG AA contrast verified by tests.
  - Reader, library, study (bookmarks, highlights, notes, folders), plans and search,
    all driven by the shared offline engine (Dexie/IndexedDB).
  - Local-first reads: downloaded text is served even when the catalog disables the
    version; the server stays the final gate for anything new.
  - Background sync registration while operations are pending.
- **`apps/mobile`** — the Expo app:
  - SQLite/FTS5 adapter over the same offline engine; per-version attribution and
    licence rendering; WCAG AA contrast verified by tests.
- **`infra/`** — Terraform (pinned 1.9.8, AWS provider `~> 5.60`):
  - Bootstrap stack (state bucket, DynamoDB lock, KMS) plus reusable modules for VPC,
    RDS PostgreSQL, OpenSearch, Cognito, Elastic Beanstalk, S3 + CloudFront, WAF and
    monitoring/backup.
  - `dev` and `prod` environments; WAF in `us-east-1` via an aliased provider.
  - Written and validated only (`terraform validate` green); no `terraform apply` has
    been run and no AWS credentials are used in this repository.
- **`.github/workflows`** — `ci.yml` (verify + terraform validate on every push),
  `deploy.yml` (builds the EB bundles and deploys; fails fast until repository env vars
  are configured after the first apply) and `terraform.yml` (plan/apply with a
  reviewed plan).
- **`scripts/build-bundle.mjs`** — deterministic Elastic Beanstalk deploy bundles:
  - `api`: `pnpm deploy --prod` with a hoisted (junction-free) `node_modules`, pruned
    sources, a module-resolution smoke test and a start script.
  - `web`: Next.js `output: "standalone"` server plus `static/` and `public/`.
  - Zips with forward-slash entries on every platform (Windows' bsdtar, Linux `zip`).
- **QA** — automated multi-device/expiry/disabled-version coverage plus a manual
  device matrix in [`docs/qa-checklist.md`](docs/qa-checklist.md); a best-effort
  Lighthouse runner in `scripts/lighthouse.mjs`.
- **`content/packages/kjv/1`** — the generated public-domain KJV package: 66 books,
  1,189 chapters, 31,102 verses, with a checksummed manifest and versification map.
- **Fixtures** — a synthetic KJV-shaped package used by the older unit tests; no licensed
  text is committed.

**277 tests pass** — 86 core, 19 database, 23 content, 59 API, 52 offline-engine,
27 web and 11 mobile tests.

## Prerequisites

| Tool       | Version | Notes                     |
| ---------- | ------- | ------------------------- |
| Node.js    | 22+     | `node --version`          |
| pnpm       | 10.34.7 | `npm install -g pnpm@10`  |
| PostgreSQL | 16+     | Native install, no Docker |

On Windows the database can be installed with:

```powershell
winget install -e --id PostgreSQL.PostgreSQL.16
```

Then make sure `psql` is on `PATH` (usually
`C:\Program Files\PostgreSQL\16\bin`) and run:

```powershell
.\scripts\setup-db.ps1
```

The script creates the `holyword` role and database. It is safe to re-run.

## Quick start

```powershell
pnpm install
Copy-Item .env.example .env
pnpm build
pnpm db:migrate
pnpm db:seed
pnpm content:verify-kjv
pnpm check
```

`pnpm check` runs formatting, lint, typecheck and every test. It does not need a
database: API tests use in-process PGlite with the real migration SQL.

### Run the API

```powershell
pnpm --filter @holyword/api dev
```

The service listens on `http://localhost:4000` and exposes `GET /health`. With
`AUTH_DEV_MODE=true` (the local default in `.env.example`) you can sign in with a dev
identity instead of Cognito:

```powershell
$session = Invoke-RestMethod -Method Post http://localhost:4000/v1/auth/session `
  -ContentType 'application/json' -Body '{"idToken":"dev:reader@example.com"}' `
  -SessionVariable web
Invoke-RestMethod http://localhost:4000/v1/versions -WebSession $web
```

Equivalently with curl:

```bash
curl -c cookies.txt -H 'content-type: application/json' \
  -d '{"idToken":"dev:reader@example.com"}' \
  http://localhost:4000/v1/auth/session
curl -b cookies.txt http://localhost:4000/v1/versions
```

Mobile clients send `Authorization: Bearer <Cognito access token>` instead of a cookie.
In dev mode, `Bearer dev:reader@example.com` is accepted.

### Content pipeline

The committed KJV package is public-domain scripture. The source archive is pinned by
SHA-256, and a changed upstream download fails instead of silently changing the text.

```powershell
# Download, checksum and extract the pinned eBible.org KJV USFM archive.
pnpm content:fetch-kjv

# Build the immutable 66-book package under content/packages/kjv/1.
# The builder refuses to overwrite an existing version; bump versionCode for changes.
pnpm content:build-kjv

# Verify every manifest and book checksum and the per-chapter verse counts.
pnpm content:verify-kjv

# Ingest a licensed USFM/OSIS/JSON source using an operator-supplied metadata file.
pnpm content:ingest --source C:\path\to\source --metadata C:\path\to\metadata.json `
  --out content/packages --format usfm

# Publish a verified package to the private bucket and optionally index it.
pnpm content:publish --package content/packages/kjv/1 --bucket holyword-content `
  --region us-east-1 --prefix packages --opensearch-url https://search.example.com
```

A package is `manifest.json` + `versification.json` + one `books/*.ndjson` file per book.
The manifest records the licence policy, provenance, per-book byte sizes and SHA-256
digests. `package.zip` is generated from the verified files on demand, so it is never
committed.

`POST /v1/versions/{versionId}/download-ticket` performs the licence, entitlement, device
and region checks, then returns:

- with `CONTENT_DELIVERY_MODE=local`: short-lived JWT-ticket URLs under
  `/v1/content/packages/...`;
- with `CONTENT_DELIVERY_MODE=cloudfront`: signed CloudFront URLs for the private S3
  objects.

`VERSION_FLAGS=kjv` is an optional deployment allow-list. A version is visible only when
both its audited catalog row is enabled and its id appears in the list. Licensed versions
stay disabled and unlicensed until the publisher's files and written licence terms are
supplied.

## Commands

| Command                                | Purpose                                       |
| -------------------------------------- | --------------------------------------------- |
| `pnpm check`                           | format check + lint + typecheck + tests       |
| `pnpm test`                            | All tests through Turborepo                   |
| `pnpm build`                           | Build packages, apps and the API              |
| `pnpm --filter @holyword/api dev`      | Watch-mode API server                         |
| `pnpm --filter @holyword/api test`     | 59 API unit and end-to-end tests (PGlite)     |
| `pnpm --filter @holyword/offline test` | 52 offline-engine tests                       |
| `pnpm --filter @holyword/web test`     | 27 PWA tests (PWA, a11y, sync, catalog)       |
| `pnpm --filter @holyword/mobile test`  | 11 Expo tests (attribution, a11y)             |
| `pnpm gen:api`                         | Regenerate API types from `docs/openapi.yaml` |
| `pnpm content:fetch-kjv`               | Fetch and checksum the pinned KJV source      |
| `pnpm content:build-kjv`               | Build the immutable KJV package               |
| `pnpm content:verify-kjv`              | Verify the KJV package and totals             |
| `pnpm content:ingest -- ...`           | Normalize and build another version           |
| `pnpm content:verify -- ...`           | Verify any package directory                  |
| `pnpm content:publish -- ...`          | Upload to S3 and optionally index OpenSearch  |
| `pnpm db:migrate`                      | Apply migrations                              |
| `pnpm db:seed`                         | Seed the version catalog and reading plans    |
| `pnpm db:generate`                     | Generate a migration after editing the schema |
| `pnpm format`                          | Prettier                                      |
| `node scripts/build-bundle.mjs api`    | EB deploy bundle for the API (`build/*.zip`)  |
| `node scripts/build-bundle.mjs web`    | EB deploy bundle for the PWA (`build/*.zip`)  |
| `node scripts/lighthouse.mjs [url]`    | Best-effort Lighthouse scores (`--strict`)    |
| `.\scripts\validate-infra.ps1`         | fmt + init + validate every Terraform root    |

The API test script runs Jest with `--experimental-vm-modules` because PGlite loads its
WASM engine through a dynamic import. `pnpm check` invokes the same script.

## Repository layout

```
.
├─ apps/
│  ├─ api/                    # NestJS REST API + 59 unit/e2e tests
│  │  ├─ api/index.ts         # Vercel function entry (shares src/app-factory.ts)
│  │  └─ vercel.json          # function limits + bundled content packages
│  ├─ web/                    # Next.js 16 PWA + 27 tests
│  └─ mobile/                 # Expo app + 11 tests
├─ packages/
│  ├─ core/                   # shared types, parser, sync protocol, API types
│  │  ├─ src/api/schema.d.ts  # generated from docs/openapi.yaml
│  │  └─ test/                # 86 tests
│  ├─ content/                # USFM/OSIS/JSON ingestion, package builder, publish
│  │  └─ test/                # 23 tests
│  ├─ offline/                # Dexie/SQLite storage, search, downloads and sync
│  │  └─ test/                # 52 tests across both adapters
│  └─ db/                     # Drizzle schema, migration, seed
│     ├─ drizzle/             # generated SQL + snapshot/journal
│     └─ test/                # 19 tests, including WASM PostgreSQL migration
├─ infra/                     # Terraform: bootstrap, modules, dev + prod
├─ scripts/
│  ├─ build-bundle.mjs        # Elastic Beanstalk deploy bundles (api | web)
│  ├─ lighthouse.mjs          # best-effort Lighthouse scores
│  ├─ stage-vercel-content.mjs # copy content/packages for the Vercel bundle
│  ├─ validate-infra.ps1      # terraform fmt + init + validate
│  └─ setup-db.ps1            # local PostgreSQL role/database
├─ content/
│  ├─ packages/kjv/1/         # public-domain KJV package + checksums
│  └─ sources/kjv/            # pinned source metadata and provenance
├─ fixtures/synthetic/        # checksummed test package, not scripture
├─ docs/
│  ├─ openapi.yaml
│  ├─ adr/
│  ├─ infra.md                # environments, apply order, CI/CD setup
│  ├─ vercel.md               # Vercel + Neon + Cognito launch guide
│  ├─ runbook-restore.md      # RDS/PITR and content-bucket restore drills
│  ├─ qa-checklist.md         # automated coverage + manual device matrix
│  ├─ HolyWord-Build-Prompt.docx
│  └─ architecture-infographic.png
└─ .github/workflows/
   ├─ ci.yml                  # verify + terraform validate on every push
   ├─ deploy.yml              # build bundles and deploy to Elastic Beanstalk
   └─ terraform.yml           # plan/apply with a reviewed plan
```

## Infrastructure and deployment

Terraform (pinned 1.9.8, `hashicorp/aws ~> 5.60`) lives in `infra/`:

- `infra/bootstrap` — one-time per account/region: state S3 bucket, DynamoDB lock
  table and KMS key.
- `infra/modules` — VPC, RDS PostgreSQL (PITR + automated backups), OpenSearch with
  fine-grained access control, Cognito user pool, Elastic Beanstalk (Node.js 22 on
  AL2023), S3 + CloudFront for content delivery, WAF (us-east-1, aliased provider) and
  monitoring/alarms + AWS Backup.
- `infra/environments/dev` and `infra/environments/prod` — two Beanstalk environments
  (API and web PWA) behind one CloudFront distribution: `/v1*` and `/health*` route to
  the API, everything else to the web app.

Secrets are assembled at apply time from the (untracked) `terraform.tfvars` and injected
as Elastic Beanstalk environment variables — never committed. `docs/infra.md` documents
the apply order, the GitHub environment/variable mapping for `deploy.yml` and the
post-apply steps. `docs/runbook-restore.md` covers RDS point-in-time restore and
content-bucket recovery drills.

The stacks have been written and `terraform validate` is green for every root
(`.\scripts\validate-infra.ps1`); no `terraform apply` has been run from this
repository yet, so all AWS-side values (domain names, Cognito ids, CloudFront keys) are
placeholders until the first apply.

CI/CD: `ci.yml` runs format/lint/typecheck/tests plus `terraform validate` on every
push; `deploy.yml` builds both deploy bundles and deploys them to the Elastic Beanstalk
environments (triggered manually with `workflow_dispatch` until the first apply, and it
fails fast with a clear message until the repository environment
variables exist); `terraform.yml` runs a plan on demand and applies from `master` with a
manually reviewed plan.

## Deploy to Vercel

The quickest live launch, in parallel with (not instead of) the AWS path: web + API on
Vercel, PostgreSQL on Neon, sign-in on Cognito, content packages bundled straight into
the function. The complete step-by-step guide with every environment variable is
[`docs/vercel.md`](docs/vercel.md).

1. **Neon**: create a project, then apply the schema with `pnpm db:migrate` (use the
   direct endpoint) and seed with `pnpm db:seed`.
2. **Cognito**: create a user pool with a public app client that allows
   `ALLOW_USER_PASSWORD_AUTH` (no client secret, no hosted UI needed).
3. **Vercel**: import the repository twice — root directory `apps/web` (framework
   Next.js) and `apps/api` (framework Other). The API's `vercel-build` script builds the
   workspace packages and stages `content/packages` into the function bundle through
   `scripts/stage-vercel-content.mjs`; `apps/api/vercel.json` includes those files and
   caps a request at 30 s.
4. **Environment**: set the two tables from `docs/vercel.md` — API (`DATABASE_URL`,
   `SESSION_SECRET`, `DOWNLOAD_TOKEN_SECRET`, Cognito ids, `WEB_ORIGIN`,
   `CONTENT_BASE_URL`, `CONTENT_DELIVERY_MODE=local`, `CONTENT_PACKAGE_DIR=content/packages`,
   `VERSION_FLAGS=kjv`) and web (`NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_APP_URL`,
   `NEXT_PUBLIC_COGNITO_REGION`, `NEXT_PUBLIC_COGNITO_CLIENT_ID`) — then deploy `master`.
   Leave `AUTH_DEV_MODE` / `NEXT_PUBLIC_AUTH_DEV_MODE` unset.
5. **Verify**: `GET /health`, sign up and confirm an email, open a KJV chapter, create a
   note, download the package from the library.

## QA

Automated QA scenarios run in the suites themselves (two devices racing on one note,
expired bearer tokens/cookies, expired and cross-package download tickets, runtime
version disable/enable, device re-assignment, and a downloaded version that the catalog
disables). Everything that needs real hardware or a network is in
[`docs/qa-checklist.md`](docs/qa-checklist.md): airplane mode, kill-mid-download, low
storage, slow networks, licence spot checks, accessibility and the Lighthouse gate:

```powershell
node scripts/lighthouse.mjs http://localhost:3000            # advisory scores
node scripts/lighthouse.mjs https://<app_url> --strict       # fails below 80
```

## API overview

All routes are under `/v1` and require authentication except `POST /v1/auth/session`,
`DELETE /v1/auth/session`, `GET /health` and ticketed package downloads. The ticket in
the download URL is the credential; package objects are never public.

| Area     | Routes                                                                       |
| -------- | ---------------------------------------------------------------------------- |
| Auth     | `POST/GET/DELETE /v1/auth/session`                                           |
| Versions | `GET /v1/versions`, `GET /v1/versions/{id}`, chapter reads, download tickets |
| Content  | Signed `package.zip` and `manifest.json` downloads under `/v1/content`       |
| Search   | `GET /v1/search` (OpenSearch or local package fallback)                      |
| Study    | CRUD under `/v1/bookmarks`, `/v1/highlights`, `/v1/notes`, `/v1/folders`     |
| Plans    | `GET /v1/plans`, `/v1/plans/{id}`, `GET/PUT /v1/plans/{id}/progress`         |
| Progress | `GET/PUT /v1/reading-progress`, `GET/PUT /v1/preferences`                    |
| Sync     | `POST /v1/sync/push`, `GET /v1/sync/pull`                                    |
| Account  | `GET /v1/account/export`, `DELETE /v1/account`                               |
| Admin    | Enable/disable versions, `GET /v1/admin/audit-log`                           |
| Ops      | `GET /health`                                                                |

Study mutations accept an optional `x-device-id` header (UUID). The same writes also
flow through the sync engine, so REST and offline clients share the last-write-wins and
note-conflict rules.

### Sync semantics

- Every operation carries a client-generated `opId` and a fixed-width HLC.
- `opId` is unique per user; replays return the original `serverSeq` with status
  `duplicate`.
- Per-entity fields use last-write-wins on the HLC. Older writes are acknowledged but do
  not change the row.
- Deletes are tombstones; pull responses mark them with `tombstone: true` and
  `payload: null`.
- A note edited over REST with a stale `baseVersion` returns `409` and both versions are
  preserved in `note_conflicts`. In a sync push the same situation is reported as
  `status: "conflict"` with a `conflictId` while the newer HLC still wins last-write-wins;
  the conflict row keeps the losing payload verbatim for in-app resolution.
- Pull is ordered by the server sequence and reports `hasMore`.
- Entity ids identify the row: bookmarks/highlights/notes/folders use their UUID,
  reading progress uses the version id, plan progress uses its UUID with `planId` in the
  payload, and preferences use the literal id `preferences`.

## Environment variables

Copy `.env.example` to `.env`. Required for the API:

| Variable                     | Notes                                                                |
| ---------------------------- | -------------------------------------------------------------------- |
| `DATABASE_URL`               | PostgreSQL connection string                                         |
| `SESSION_SECRET`             | ≥32 chars; signs session cookies (required in production)            |
| `DOWNLOAD_TOKEN_SECRET`      | ≥32 chars; signs download tickets (required in production)           |
| `AUTH_DEV_MODE`              | `true` only for local dev; accepts `dev:<email>` tokens              |
| `COGNITO_REGION` etc.        | User pool/client; required in production                             |
| `ADMIN_EMAILS`               | Comma-separated admins allowed to call `/v1/admin`                   |
| `WEB_ORIGIN`                 | CORS origin for the web client                                       |
| `CONTENT_PACKAGE_DIR`        | Local mirror for reads/search; defaults to `<repo>/content/packages` |
| `CONTENT_BASE_URL`           | Local ticket base; must include `/v1/content`                        |
| `CONTENT_DELIVERY_MODE`      | `local` or `cloudfront` (cloudfront required in production)          |
| `CLOUDFRONT_CONTENT_URL`     | Distribution origin used for signed URLs                             |
| `CLOUDFRONT_KEY_PAIR_ID`     | CloudFront public key id                                             |
| `CLOUDFRONT_PRIVATE_KEY`     | Inline PEM (or use `CLOUDFRONT_PRIVATE_KEY_PATH`)                    |
| `VERSION_FLAGS`              | Optional comma-separated deployment allow-list                       |
| `OPENSEARCH_URL`             | Enables online search; unset uses local package scan                 |
| `OPENSEARCH_INDEX`           | Index name (default `holyword-verses`)                               |
| `OPENSEARCH_USERNAME`        | Optional basic-auth username                                         |
| `OPENSEARCH_PASSWORD`        | Optional basic-auth password                                         |
| `OPENSEARCH_TIMEOUT_MS`      | Search request timeout (default 2500)                                |
| `SESSION_TTL_SECONDS`        | Session lifetime (default 3600)                                      |
| `DOWNLOAD_TOKEN_TTL_SECONDS` | Ticket lifetime (default 300)                                        |

Production also requires Cognito configuration, both secrets, CloudFront signing
credentials and `CONTENT_DELIVERY_MODE=cloudfront`. Dev defaults exist for the secrets so
`pnpm check` works without a `.env`. The API loads the repo-root `.env` on startup and
treats empty placeholders as unset. Production must also mount or deploy a read-only
package mirror for online chapter reads and fallback search; CloudFront is used for
offline package and manifest downloads. When `CONTENT_PACKAGE_DIR` is set, use an absolute
path or a path relative to the API process working directory; leaving it unset uses the
committed local mirror.

## Architecture decisions

- **Bible text is not stored in PostgreSQL.** Ingested text is staged for validation,
  then frozen into an immutable, checksummed package in S3. Online and offline reads use
  the same artifact, so they cannot diverge. See
  [ADR 0002](docs/adr/0002-content-packages.md).
- **Packages are immutable and verified at every read.** `versionCode` never changes in
  place; the API checks the manifest and every book SHA-256 before serving or archiving it.
- **Delivery is short-lived and licensed.** The API issues local JWT tickets or CloudFront
  custom-policy URLs only after licence, entitlement, device and region checks. The S3
  bucket and package objects remain private.
- **Two flags gate a version.** The audited catalog `enabled` flag and the deployment
  `VERSION_FLAGS` allow-list must both allow a version before it is visible.
- **Search degrades safely.** OpenSearch is the online engine when configured; the API
  falls back to scanning verified local packages and reports which engine answered.
- **The API is contract-first.** `docs/openapi.yaml` is committed and types are generated.
  Changing a response shape requires changing the contract and re-running `pnpm gen:api`.
- **Licensing is enforced, not documented.** Every version has a policy; defaults deny
  offline access and the catalog ships every non-public-domain title disabled.
- **Sync is idempotent and replay-safe.** Clients queue operations with a UUID and an HLC;
  the server deduplicates by `opId` and assigns a monotonic `serverSeq` cursor.
  See [ADR 0003](docs/adr/0003-sync-protocol.md).
- **REST and sync share one write path.** Both call `applyChange` inside a transaction
  that also appends the change log, so a REST edit is immediately visible to other devices.
  See [ADR 0004](docs/adr/0004-api-architecture.md).
- **One local schema, two adapters.** Dexie and SQLite implement the same versioned
  snake_case schema and indexes. Shared queue, conflict and search rules are tested against
  both, so web and mobile cannot drift. See [ADR 0005](docs/adr/0005-offline-engine.md).
- **Offline installs are all-or-nothing for verified content.** A resumable downloader
  persists chunks and verifies the manifest and every book before the installer replaces
  the local version and marks its search index ready.
- **Search is local and version-scoped.** MiniSearch (web) and FTS5 (mobile) answer words,
  exact phrases and references without a network call; passing the version id on every
  query prevents cross-translation results.
- **The offline queue is durable.** Local row and queue write in one transaction. UUID
  operations, a persisted HLC and a per-device cursor make retries idempotent; failed rows
  stay visible until acknowledged, and note conflicts retain both versions.

## Licensing guardrails

- Only KJV (public domain in the US) is enabled in the seed catalog and has a committed
  package.
- NKJV, NIV, NLT, MSG, ESV, NASB, AMP, CSB and NRSV are present but `enabled = false`,
  `licenceStatus = unlicensed` and `offlineDownload = false`; no licensed text is present.
- No non-public-domain text may be committed to this repository.
- The Message is flagged as a paraphrase in its policy note and must be labelled as such
  in the UI when it is eventually enabled.
- Enabling a version is an audited admin action (`audit_log`); an unlicensed version
  cannot be enabled. A non-empty `VERSION_FLAGS` allow-list must also include it.
- Download tickets check enabled state, licence status, entitlement, offline permission,
  device limit and viewer region (`CloudFront-Viewer-Country`).
- The publisher refuses packages whose licence is unlicensed, whose licence forbids
  offline downloads, or whose policy requires unimplemented encryption.
- The KJV is public domain in the United States; Crown letters patent apply in the United
  Kingdom. This is a product guardrail, not legal advice.

## Current limitations

- The Expo SQLite path is exercised through the structural `SqliteDriver` backed by
  `node:sqlite`; `ExpoSqliteDriver` itself is a thin adapter and has not run on a physical
  iOS or Android device in this environment. The web PWA is exercised in browser-based
  tests, not on a device farm.
- Licensed NKJV, NIV, NLT and MSG files have not been supplied, and no licence terms have
  been confirmed. They remain disabled/unlicensed; catalog-only ESV, NASB, AMP, CSB and
  NRSV are likewise metadata only.
- Terraform is written and validated but **has not been applied**; no AWS account,
  credentials or real endpoints are involved yet. Domain names, Cognito ids and
  CloudFront key material are placeholders documented in `docs/infra.md`.
- AES package encryption and the separate licensed key-delivery flow are not implemented.
  A package manifest may declare encryption, but publishing or installing such a package
  is rejected.
- The local JWT-ticket route is the only delivery path exercised end-to-end, including
  byte-range resume. The CloudFront branch is unit-tested, not deployed. Production
  packaging must also mount or copy the read-only package mirror used by chapter reads and
  fallback search.
- Offline package tests build synthetic archives. The committed KJV files are verified by
  `pnpm content:verify-kjv`; `package.zip` is generated on demand and is not committed.
- No local PostgreSQL is required for tests; the API suite uses PGlite with the real
  migration. Native PostgreSQL remains the development/production target.
- Region checks trust the CloudFront header, which must be stripped from client requests
  at the edge in production.
- Lighthouse (`scripts/lighthouse.mjs`) is best-effort: without a local Chrome it reports
  the run as skipped; `--strict` is for environments where a score gate must fail.

## Phase status

| Phase                             | Status      |
| --------------------------------- | ----------- |
| 1. Foundation                     | ✅ complete |
| 2. Backend (NestJS)               | ✅ complete |
| 3. Content pipeline + KJV package | ✅ complete |
| 4. Offline engine                 | ✅ complete |
| 5. Web PWA, then Expo app         | ✅ complete |
| 6. Terraform + CI/CD              | ✅ complete |
| 7. QA and hardening               | ✅ complete |

## Phase 7 exit gate

- [x] Multi-device QA tests: two devices racing on one note keep both texts (stale base
      is flagged as a conflict, newest HLC wins, the loser's payload is preserved).
- [x] Expired bearer token, expired cookie, expired download ticket and a valid ticket
      presented for a different package are all rejected.
- [x] A version disabled at runtime disappears from the catalog, chapter reads 404,
      ticket issuance 403, and re-enabling restores it through the audited admin path.
- [x] A device registered to another account is refused (`device-not-owned`).
- [x] A downloaded version that the catalog disables keeps serving local text, fetches
      nothing new, and the server remains the final gate.
- [x] `docs/qa-checklist.md` covers the manual matrix (airplane mode, kill mid-download,
      two devices, expired tokens, low storage, slow networks, disabled after download),
      licence spot checks, accessibility and the release gate.
- [x] `scripts/lighthouse.mjs` reports scores and only fails with `--strict`.
- [x] 277 tests pass; `pnpm check` is green.

## Phase 6 exit gate

- [x] Terraform for dev and prod: bootstrap (state, lock, KMS), VPC, RDS with PITR,
      OpenSearch (FGAC), Cognito, Elastic Beanstalk (Node.js 22 on AL2023), S3 +
      CloudFront with OAC, WAF (us-east-1) and monitoring/backup modules.
- [x] Two Elastic Beanstalk environments (API, web) behind one CloudFront distribution
      with path-based routing; secrets injected at apply time, never committed.
- [x] `terraform fmt -check` and `terraform validate` green for every root
      (`.\scripts\validate-infra.ps1`).
- [x] Deterministic deploy bundles for both apps (`node scripts/build-bundle.mjs api|web`),
      verified locally: workspace dependencies resolve inside the API bundle and the web
      bundle starts `apps/web/server.js` with static and public assets merged; both zips
      use forward-slash entries so they extract correctly on Linux.
- [x] CI on `master`: verify + terraform validate; deploy workflow builds the bundles and
      deploys to Elastic Beanstalk; terraform workflow plans and applies with a reviewed
      plan.
- [x] `docs/infra.md` (environments, apply order, GitHub variable mapping) and
      `docs/runbook-restore.md` (PITR, content restore) written.

## Phase 5 exit gate

- [x] Next.js PWA: installable, offline-capable service worker, WCAG AA contrast tests,
      background sync while operations are pending.
- [x] Reader, library, study, plans and search drive the shared offline engine; local
      first reads, catalog-driven availability, licensed copy/share rules enforced.
- [x] Expo app on the same offline engine with SQLite/FTS5, per-version attribution and
      licence rendering, WCAG AA contrast tests.
- [x] Disabled-after-download behaviour: downloaded text stays readable locally, nothing
      new is fetched, the server answers for anything not on the device.
- [x] 277 tests pass (27 web, 11 mobile added); `pnpm build` and `pnpm check` are green.

## Phase 4 exit gate

- [x] Downloads report persisted progress and support pause, resume, retry and SHA-256
      verification; payload and manifest tampering is rejected.
- [x] Package delivery supports single-range `Range` requests with `206`, `Content-Range`,
      `Accept-Ranges` and `416`, so interrupted downloads continue from the last byte.
- [x] Dexie/IndexedDB and SQLite/FTS5 implement one versioned schema covering versions,
      books, chapters, verses, bookmarks, highlights, notes, folders, reading plans, plan
      progress, reading progress, preferences, sync queue, conflicts and downloads.
- [x] Local search finds words, exact phrases and references such as `John 3:16` and
      `Jn 3:16-18`, always scoped to one version.
- [x] Every local mutation writes a UUID + persisted-HLC queue record; edits coalesce,
      pushes are idempotent, failed rows remain visible and retryable.
- [x] Remote changes apply by HLC last-write-wins, deletes use tombstones, and note
      conflicts preserve both payloads with deterministic conflict ids.
- [x] Per-device pull cursors advance only after a page applies; failed pages replay safely.
- [x] 221 tests pass (49 offline-engine tests across both adapters); `pnpm build`,
      `pnpm content:verify-kjv` and `pnpm check` are green.

## Phase 3 exit gate

- [x] USFM, OSIS and JSON ingestion normalizes to one canonical verse shape and rejects
      duplicates, gaps, empty text and wrong per-book counts.
- [x] The pinned public-domain KJV source builds an immutable package with 66 books,
      1,189 chapters and 31,102 verses.
- [x] Manifest, versification and book SHA-256 checksums are verified before reads and
      archive generation; tampering is detected.
- [x] Packages can be published to a private S3 prefix with immutable cache headers and
      optionally bulk-indexed into OpenSearch.
- [x] Local delivery uses short-lived signed tickets; CloudFront custom-policy signing is
      implemented and unit-tested.
- [x] Per-version deployment flags layer over the audited catalog enabled flag.
- [x] Search uses OpenSearch when configured and falls back to verified local packages,
      exposing `engine: "opensearch" | "local"`.
- [x] Licensed versions remain disabled/unlicensed and encrypted or offline-forbidden
      packages cannot be published.
- [x] 167 tests pass; `pnpm content:verify-kjv` and `pnpm check` are green.
- [x] OpenAPI and operational documentation cover package delivery, flags and search.

## Phase 2 exit gate

- [x] NestJS API scaffolded with config validation, health check and consistent errors.
- [x] Web cookie sessions and mobile bearer authentication over a shared identity interface.
- [x] Version catalog, chapter reads from checksummed packages, and search fallback.
- [x] Study CRUD for bookmarks, highlights, notes, folders, plans, progress and preferences.
- [x] Idempotent sync with HLC last-write-wins, tombstones and preserved note conflicts.
- [x] Server-side licence, entitlement, device-limit and region enforcement for downloads.
- [x] Admin enable/disable with audit logging.
- [x] 52 API tests run against the real migration on PGlite; 167 tests total across the workspace.
- [x] OpenAPI updated for health, logout and download-region headers.

## Phase 1 exit gate

- [x] `pnpm install` succeeds from a clean checkout.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.
- [x] Migrations apply cleanly to a real PostgreSQL engine (verified in tests with PGlite).
- [x] Seed enables KJV only; every licensed title is disabled and unlicensed.
- [x] OpenAPI validates and every schema reference resolves.
- [x] The synthetic package validates against its manifest and checksum.
