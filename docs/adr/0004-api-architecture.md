# ADR 0004 — NestJS API architecture

- Status: accepted
- Date: 2026-10-20

## Context

Phase 2 turns the Phase 1 contract and schema into a running API: Cognito-backed
authentication, the version catalog and online reading, study data, offline sync,
licensing enforcement and administrative controls. The service must run on Elastic
Beanstalk's Node.js platform without containers and stay testable without a local
PostgreSQL server.

## Runtime and framework

- NestJS 11 on CommonJS/Node 22, Express adapter.
- **NestJS 12 is deliberately not used.** Its packages are ESM-only, while this service
  is built as CommonJS for Elastic Beanstalk. `jose` is likewise pinned to v5, the last
  dual CJS/ESM release. Moving to Nest 12 would require an ESM migration of the API,
  tests and build pipeline.
- Configuration is parsed once at startup with Zod (`loadConfig`) and injected through the
  `APP_CONFIG` token. Invalid configuration fails fast. Production requires Cognito and
  both signing secrets.
- `main.ts` enables Helmet, credentialed CORS for `WEB_ORIGIN`, a 2 MB JSON limit,
  cookie parsing and proxy trust (needed for secure cookies behind CloudFront/ALB).

## Request pipeline

- **Validation:** Zod schemas at every boundary (`ZodBody`, `ZodValidationPipe`), sharing
  the same shapes as `@holyword/core` where possible. No class-validator DTO duplication.
- **Errors:** `ApiExceptionFilter` maps `ApiError`, validation failures, Nest HTTP errors
  and unexpected errors to `{ code, message }`. Note conflicts use a dedicated body with
  `conflictId` to match the OpenAPI `Conflict` schema.
- **Throttling:** a global throttler allows 300 requests/minute per client. Health and
  authentication remain cheap; production can move the limit to config later.
- **Auth:** a global `AuthGuard` accepts an httpOnly session cookie (web) or a bearer token
  (mobile). Both paths resolve to a database user; missing/deleted users get 401.
- **Admin:** `AdminGuard` runs after authentication and accepts a Cognito group or an
  email in `ADMIN_EMAILS`.

## Identity abstraction

`TokenVerifier` has two implementations:

- `CognitoTokenVerifier` verifies Cognito ID/access tokens against the pool's JWKS with
  `jose`;
- `DevTokenVerifier` accepts `dev:<email>` and is available only outside production when
  `AUTH_DEV_MODE=true`.

Web sessions are stateless HS256 JWTs stored in an httpOnly, SameSite=Lax cookie. The
cookie contains the user id, email and groups; the guard still reloads the user row so
account deletion takes effect immediately. Mobile clients do not use cookies.

## Content reads

`ContentService` reads catalog/licence state from PostgreSQL and verse text from
`PackageStore`, which mirrors the immutable package layout from ADR 0002:

- one directory per version (or a single package root), located lazily;
- SHA-256 and byte-size verification of every book file on first read;
- NDJSON parsing with schema validation and an in-process cache;
- no Bible text in PostgreSQL.

Chapter endpoints block disabled/unlicensed versions. Search currently scans the cached
package text. It is explicitly a Phase 2 fallback; Phase 3 replaces the implementation
behind the same endpoint with OpenSearch.

## Write path and sync

REST mutations and `POST /v1/sync/push` share `applyChange`:

1. lock the user's row for the entity (when it exists);
2. validate the payload with the entity schema;
3. enforce ownership and referential rules (folder ownership, plan existence);
4. compare the incoming HLC with the stored HLC and apply last-write-wins;
5. write the entity and append an immutable `sync_operations` row in the same transaction.

The change log is the source of truth for pull and provides `serverSeq` ordering. Because
both paths use it, a bookmark created in the web UI is delivered to a mobile device on its
next pull. `opId` is unique, so retries are idempotent; a concurrent duplicate insert is
detected through the unique index and reported as `duplicate`.

Notes maintain a `serverVersion`. A write carrying a stale `baseVersion` still applies
(last-write-wins) but first inserts both payloads into `note_conflicts` and reports a
conflict to the caller. The offline engine preserves both versions; the resolution UI
arrives with the Phase 5 clients. The server never discards either version.

## Download tickets

`POST /v1/versions/{id}/download-ticket` currently issues a short-lived HS256 JWT bound to
the user, version and package version, and returns URLs rooted at `CONTENT_BASE_URL`. Before
signing it checks:

- version enabled and licence status;
- offline permission;
- entitlement for licensed versions;
- maximum devices (counting other devices with an install);
- viewer region from `CloudFront-Viewer-Country`.

Phase 3 replaces the HMAC ticket with CloudFront signed URLs/cookies and publishes the
actual packages. The policy checks and response shape stay unchanged, so clients do not
need to care which delivery mechanism is active. Until a package exists, the endpoint
returns `503 content-unavailable` rather than a broken URL.

## Account deletion

`DELETE /v1/account` deletes the `users` row; every user-owned table cascades. Cognito
identity deletion requires the admin API and is deferred to the Phase 6 account workflow.
Sessions become unusable immediately because the guard reloads the user.

## Consequences

- API tests run the real migration against PGlite and a temporary on-disk KJV-shaped
  package; no external services are required. Jest needs `--experimental-vm-modules` for
  PGlite's WASM loader.
- Search is functional but local; Phase 3 must preserve the response schema when adding
  OpenSearch.
- The API remains CommonJS until a dedicated ESM migration; do not upgrade to Nest 12 or
  `jose` 6 independently.
- Region enforcement is only trustworthy when CloudFront strips the viewer-country header
  from client requests and injects its own.
