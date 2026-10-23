import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../src/client";
import * as schema from "../src/schema";
import { seedCatalog } from "../src/seed-data";

const migration = readFileSync(new URL("../drizzle/0000_initial.sql", import.meta.url), "utf8");
const HLC = "1792506623752:000000:test-node";

/**
 * Applies the generated migration to a real PostgreSQL engine compiled to WASM.
 * This catches SQL-level mistakes without requiring a local server or Docker.
 */
describe("initial migration", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(migration);
  }, 60_000);

  afterAll(async () => {
    await db.close();
  });

  it("creates all tables and enum types", async () => {
    const tables = await db.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE'`,
    );
    const names = tables.rows.map((row) => row.table_name);
    expect(names).toEqual(
      expect.arrayContaining([
        "users",
        "content_versions",
        "sync_operations",
        "note_conflicts",
        "ingest_verses",
      ]),
    );

    const enums = await db.query<{ typname: string }>(
      `select typname from pg_type where typtype = 'e'`,
    );
    const enumNames = enums.rows.map((row) => row.typname);
    expect(enumNames).toEqual(expect.arrayContaining(["licence_status", "sync_entity", "sync_op"]));
  });

  it("generates UUID defaults and enforces the licence enum", async () => {
    await db.exec(`insert into users (cognito_sub, email) values ('sub-1', 'reader@example.com')`);
    const user = await db.query<{ id: string }>(`select id from users where cognito_sub = 'sub-1'`);
    expect(user.rows[0]?.id).toMatch(/^[0-9a-f-]{36}$/);

    await expect(
      db.exec(
        `insert into content_versions
           (version_id, version_code, name, abbreviation, language, language_name, licence_status, policy)
         values ('bad', 99, 'Bad', 'BAD', 'en', 'English', 'nonsense', '{}'::jsonb)`,
      ),
    ).rejects.toThrow();
  });

  it("supports the sync idempotency invariants", async () => {
    const user = await db.query<{ id: string }>(`select id from users where cognito_sub = 'sub-1'`);
    const userId = user.rows[0]!.id;

    await db.exec(
      `insert into sync_operations (op_id, user_id, device_id, entity, entity_id, op, hlc)
       values ('11111111-1111-4111-8111-111111111111', '${userId}',
               '22222222-2222-4222-8222-222222222222', 'bookmark', 'bm-1', 'upsert', '${HLC}')`,
    );

    await expect(
      db.exec(
        `insert into sync_operations (op_id, user_id, device_id, entity, entity_id, op, hlc)
         values ('11111111-1111-4111-8111-111111111111', '${userId}',
                 '22222222-2222-4222-8222-222222222222', 'bookmark', 'bm-1', 'upsert', '${HLC}')`,
      ),
    ).rejects.toThrow(/duplicate key/);

    const seq = await db.query<{ server_seq: number }>(
      `select server_seq from sync_operations where op_id = '11111111-1111-4111-8111-111111111111'`,
    );
    expect(Number(seq.rows[0]?.server_seq)).toBe(1);
  });

  it("stores client-generated study records with sync columns and tombstones", async () => {
    const user = await db.query<{ id: string }>(`select id from users where cognito_sub = 'sub-1'`);
    const userId = user.rows[0]!.id;

    await db.exec(
      `insert into bookmarks (id, user_id, verse_id, version_id, label, hlc)
       values ('33333333-3333-4333-8333-333333333333', '${userId}', 'JHN.3.16', 'kjv', 'Promise', '${HLC}')`,
    );
    const bookmark = await db.query<{ server_version: number; deleted_at: string | null }>(
      `select server_version, deleted_at from bookmarks
       where id = '33333333-3333-4333-8333-333333333333'`,
    );
    expect(bookmark.rows[0]?.server_version).toBe(1);
    expect(bookmark.rows[0]?.deleted_at).toBeNull();
  });

  it("cascades user deletion to study data", async () => {
    await db.exec(`delete from users where cognito_sub = 'sub-1'`);
    const remaining = await db.query<{ count: number }>(
      `select count(*)::int as count from bookmarks`,
    );
    expect(remaining.rows[0]?.count).toBe(0);
  });

  it("seeds the catalog idempotently and enables KJV only", async () => {
    const orm = drizzle(db, { schema });
    await seedCatalog(orm as unknown as Database);
    await seedCatalog(orm as unknown as Database);

    const versions = await db.query<{
      version_id: string;
      enabled: boolean;
      licence_status: string;
    }>(`select version_id, enabled, licence_status from content_versions order by version_code`);

    expect(versions.rows).toHaveLength(10);
    const enabled = versions.rows.filter((row) => row.enabled);
    expect(enabled.map((row) => row.version_id)).toEqual(["kjv"]);
    expect(enabled[0]?.licence_status).toBe("public-domain");
    for (const row of versions.rows.filter((entry) => entry.version_id !== "kjv")) {
      expect(row.enabled, row.version_id).toBe(false);
      expect(row.licence_status, row.version_id).toBe("unlicensed");
    }

    const plans = await db.query<{ slug: string; day_count: number }>(
      `select slug, day_count from reading_plans`,
    );
    expect(plans.rows).toEqual([{ slug: "john-in-21-days", day_count: 21 }]);
  });
});
