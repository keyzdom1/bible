# ADR 0001 — Foundation stack and repository shape

- Status: accepted
- Date: 2026-10-20

## Context

HolyWord must ship a web PWA and an Expo app that share reading, reference parsing and
sync behaviour, with a NestJS API and AWS infrastructure. The spec fixes the major
choices (React/Next.js, Expo, NestJS, PostgreSQL, S3, Terraform or CDK) but leaves the
monorepo tooling, ORM and schema boundaries open.

## Decisions

1. **pnpm workspaces + Turborepo.** One lockfile, cached `build`/`lint`/`typecheck`/`test`
   tasks, and workspace packages consumed by both clients.
2. **`@holyword/core` is the only shared contract.** It owns book data, verse IDs,
   reference parsing, package schemas, licence policy, the sync protocol and generated
   API types. It has no platform dependencies (no React, no fs), so Metro and Next can
   both consume it.
3. **`@holyword/db` owns Drizzle schema and migrations.** Drizzle is SQL-first, produces
   ordinary `.sql` migrations, and has no engine binary — useful for Elastic Beanstalk
   zip deploys where bundle size matters. TypeORM/Prisma were rejected: one hides SQL
   behind decorators, the other adds a Rust engine to the deploy artifact.
4. **Contract-first API.** `docs/openapi.yaml` is the source of truth; `pnpm gen:api`
   produces `packages/core/src/api/schema.d.ts`. A Vitest test fails if a path, operation
   id or `$ref` is missing.
5. **Zod at the boundaries.** Package manifests, sync operations and licence policies are
   validated with zod so malformed content and client payloads are rejected before they
   reach the database.
6. **TypeScript 5.9, ESM source, dual ESM/CJS builds (tsup).** NestJS can consume CommonJS
   while Next and Metro use ESM, without extension gymnastics in source files.
7. **Terraform** for infrastructure (spec offered Terraform or CDK) with `envs/dev` and
   `envs/prod`.
8. **No containers for local development or deployment.** PostgreSQL runs natively; the
   API deploys to Elastic Beanstalk's Node.js platform.

## Consequences

- Adding a shared type means changing `core` first, then regenerating API types.
- The API must keep `docs/openapi.yaml` and runtime validation in sync; a contract test
  catches structural drift, integration tests catch semantic drift.
- Drizzle migrations are checked in and reviewed like application code.
- CI uses a PostgreSQL service container. That is a CI convenience, not a product
  dependency; local development remains native.
