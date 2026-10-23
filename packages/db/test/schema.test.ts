import { readFileSync } from "node:fs";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "../src/schema";

const EXPECTED_TABLES = [
  "users",
  "devices",
  "version_installs",
  "content_versions",
  "entitlements",
  "audit_log",
  "preferences",
  "bookmarks",
  "highlights",
  "folders",
  "notes",
  "note_conflicts",
  "reading_plans",
  "plan_progress",
  "reading_progress",
  "sync_operations",
  "ingest_runs",
  "ingest_verses",
];

describe("database schema", () => {
  it("defines every expected table", () => {
    const tables = Object.values(schema)
      .filter(
        (value) =>
          typeof value === "object" &&
          value !== null &&
          Symbol.for("drizzle:IsDrizzleTable") in value,
      )
      .map((table) => getTableConfig(table as never).name);
    expect(new Set(tables)).toEqual(new Set(EXPECTED_TABLES));
  });

  it("keeps sync columns on user-owned entities", () => {
    const syncTables = [
      schema.bookmarks,
      schema.highlights,
      schema.notes,
      schema.folders,
      schema.planProgress,
      schema.readingProgress,
      schema.preferences,
    ];
    for (const table of syncTables) {
      const columns = getTableConfig(table).columns.map((column) => column.name);
      expect(columns, getTableConfig(table).name).toContain("hlc");
      expect(columns, getTableConfig(table).name).toContain("server_version");
    }
  });

  it("uses client-generated UUIDs for syncable records", () => {
    for (const table of [schema.bookmarks, schema.highlights, schema.notes, schema.folders]) {
      const config = getTableConfig(table);
      const id = config.columns.find((column) => column.name === "id");
      expect(id?.primary, config.name).toBe(true);
      expect(id?.default, `${config.name} id must be supplied by the client`).toBeUndefined();
    }
  });

  it("de-duplicates sync operations by client op id and orders them by server sequence", () => {
    const config = getTableConfig(schema.syncOperations);
    expect(config.columns.find((column) => column.name === "op_id")?.primary).toBe(true);
    expect(config.columns.find((column) => column.name === "server_seq")?.isUnique).toBe(true);
  });

  it("enforces per-title device limits and entitlement uniqueness", () => {
    const installIndexes = getTableConfig(schema.versionInstalls).indexes;
    expect(installIndexes.some((entry) => entry.config.unique)).toBe(true);
    const entitlementIndexes = getTableConfig(schema.entitlements).indexes;
    expect(
      entitlementIndexes.some(
        (entry) =>
          entry.config.unique &&
          entry.config.columns.map((column) => ("name" in column ? column.name : "")).join(",") ===
            "user_id,version_id,kind",
      ),
    ).toBe(true);
  });

  it("preserves both sides of a note conflict", () => {
    const columns = getTableConfig(schema.noteConflicts).columns.map((column) => column.name);
    expect(columns).toEqual(
      expect.arrayContaining(["local_payload", "remote_payload", "local_hlc", "remote_hlc"]),
    );
  });

  it("ships a migration that creates every table", () => {
    const sql = readFileSync(new URL("../drizzle/0000_initial.sql", import.meta.url), "utf8");
    for (const table of EXPECTED_TABLES) {
      expect(sql, table).toContain(`CREATE TABLE "${table}"`);
    }
  });
});
