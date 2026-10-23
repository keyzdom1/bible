import { afterEach, describe, expect, it } from "vitest";
import { PersistentHybridClock } from "../src/clock";
import { SqliteOfflineDatabase, SqliteSearchEngine } from "../src/sqlite";
import { LocalStudy } from "../src/study";
import { applyRemoteChange } from "../src/sync/apply";
import { LOCAL_SCHEMA, LOCAL_SCHEMA_VERSION } from "../src/types";
import { buildTestPackage, installableFrom } from "./fixtures";
import { NodeSqliteDriver } from "./node-sqlite";
import type { LocalNote } from "../src/types";

const drivers: NodeSqliteDriver[] = [];

async function setup() {
  const driver = new NodeSqliteDriver();
  drivers.push(driver);
  const db = new SqliteOfflineDatabase(driver);
  await db.initialize();
  return { driver, db };
}

afterEach(() => {
  for (const driver of drivers.splice(0)) driver.close();
});

describe("SQLite local database", () => {
  it("creates the shared logical schema plus FTS5", async () => {
    const { driver } = await setup();
    for (const table of LOCAL_SCHEMA) {
      const row = await driver.get<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
        [table.name],
      );
      expect(row?.name, `missing table ${table.name}`).toBe(table.name);
    }
    const version = await driver.get<{ user_version: number }>("PRAGMA user_version");
    expect(version?.user_version).toBe(LOCAL_SCHEMA_VERSION);
    const fts = await driver.get<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'verses_fts'",
    );
    expect(fts?.name).toBe("verses_fts");
  });

  it("installs, replaces and reads package content", async () => {
    const { db } = await setup();
    const pkg = buildTestPackage();
    await db.installContent(installableFrom(pkg));
    await db.installContent(installableFrom(pkg));
    const version = await db.getVersion("test");
    expect(version).toMatchObject({
      version_id: "test",
      name: "Test Version",
      verse_count: 6,
      search_ready: false,
    });
    expect(await db.countVerses("test")).toBe(6);
    expect(await db.listBooks("test")).toHaveLength(2);
    const chapter = await db.getChapter("test", "JHN", 3);
    expect(chapter.map((verse) => verse.id)).toEqual(["JHN.3.16", "JHN.3.17", "JHN.3.18"]);
    expect((await db.getVerse("test", "GEN.1.1"))?.text).toContain("beginning");
    expect(
      (
        await db.queryVerses("test", {
          book: "JHN",
          startChapter: 3,
          startVerse: 17,
          endChapter: 3,
          endVerse: 18,
          limit: 10,
        })
      ).map((verse) => verse.id),
    ).toEqual(["JHN.3.17", "JHN.3.18"]);
    await db.markSearchReady("test", true);
    expect((await db.getVersion("test"))?.search_ready).toBe(true);
  });

  it("stores reading plans and their published schedule", async () => {
    const { db } = await setup();
    const plan = {
      id: "11111111-1111-4111-8111-111111111111",
      slug: "john-21",
      title: "21 Days in John",
      description: "Walk through the Gospel of John.",
      day_count: 21,
      schedule: [{ day: 1, title: "The Word", references: ["John 1:1-18"] }],
      is_published: true,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    await db.putReadingPlan(plan);
    await db.putReadingPlan({ ...plan, title: "Updated title" });
    expect(await db.listReadingPlans()).toMatchObject([
      {
        id: plan.id,
        title: "Updated title",
        schedule: plan.schedule,
        is_published: true,
      },
    ]);
    await db.deleteReadingPlan(plan.id);
    expect(await db.listReadingPlans()).toEqual([]);
  });

  it("searches words, exact phrases and references with FTS5", async () => {
    const { db, driver } = await setup();
    await db.installContent(installableFrom(buildTestPackage()));
    const search = new SqliteSearchEngine(db, driver);
    await search.indexVersion("test");
    expect((await search.search("test", "beginning")).map((row) => row.verseId)).toEqual([
      "GEN.1.1",
    ]);
    expect((await search.search("test", "God created")).map((row) => row.verseId)).toEqual([
      "GEN.1.1",
    ]);
    expect((await search.search("test", "God loved")).map((row) => row.verseId)).toEqual([]);
    expect((await search.search("test", "John 3:16")).map((row) => row.verseId)).toEqual([
      "JHN.3.16",
    ]);
    expect((await search.search("test", "Jn 3:16-18")).map((row) => row.verseId)).toEqual([
      "JHN.3.16",
      "JHN.3.17",
      "JHN.3.18",
    ]);
  });

  it("isolates search by version and removes its FTS rows on delete", async () => {
    const { db, driver } = await setup();
    await db.installContent(installableFrom(buildTestPackage()));
    await db.installContent(
      installableFrom(buildTestPackage({ versionId: "other", versionCode: 1 })),
    );
    const search = new SqliteSearchEngine(db, driver);
    await search.indexVersion("test");
    await search.indexVersion("other");
    expect((await search.search("test", "beginning")).map((row) => row.versionId)).toEqual([
      "test",
    ]);
    expect((await search.search("other", "beginning")).map((row) => row.versionId)).toEqual([
      "other",
    ]);
    await db.deleteVersion("test");
    expect(await search.search("test", "beginning")).toEqual([]);
    expect((await search.search("other", "beginning")).length).toBe(1);
  });

  it("persists local queue operations and note conflicts", async () => {
    const { db } = await setup();
    const clock = new PersistentHybridClock(db, "mobile");
    const study = new LocalStudy({ store: db, clock });
    const note = await study.saveNote({
      id: "77777777-7777-4777-8777-777777777777",
      body: "Local body",
      reference: "John 3:16",
      verseId: "JHN.3.16",
    });
    await study.saveNote({ id: note.id, body: "Local body edited" });
    const queue = await db.listQueue(10);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ entity: "note", revision: 2, base_version: 0 });
    expect(((await db.getLocalRecord("note", note.id)) as LocalNote).body).toBe(
      "Local body edited",
    );

    const result = await applyRemoteChange(
      db,
      {
        serverSeq: 1,
        entity: "note",
        entityId: note.id,
        op: "upsert",
        payload: {
          verseId: "JHN.3.16",
          reference: "John 3:16",
          title: null,
          body: "Remote body",
          folderId: null,
        },
        hlc: "9999999999999:000000:remote",
        serverVersion: 2,
        tombstone: false,
      },
      { localPending: queue[0] },
    );
    expect(result.applied).toBe(true);
    expect(result.conflict).toBeDefined();
    expect(await db.listNoteConflicts()).toHaveLength(1);
    expect(((await db.getLocalRecord("note", note.id)) as LocalNote).body).toBe("Remote body");
  });

  it("round-trips download chunks as BLOBs", async () => {
    const { db } = await setup();
    await db.putChunk({ version_id: "test", offset: 0, bytes: new Uint8Array([1, 2, 3]) });
    await db.putChunk({ version_id: "test", offset: 3, bytes: new Uint8Array([4, 5]) });
    const chunks = await db.listChunks("test");
    expect(chunks.map((chunk) => [...chunk.bytes])).toEqual([
      [1, 2, 3],
      [4, 5],
    ]);
    await db.deleteChunks("test");
    expect(await db.listChunks("test")).toEqual([]);
  });

  it("persists preferences and reading progress", async () => {
    const { db } = await setup();
    const clock = new PersistentHybridClock(db, "mobile");
    const study = new LocalStudy({ store: db, clock });
    await study.savePreferences({ theme: "dark" });
    await study.savePreferences({ fontScale: 125 });
    expect(await study.getPreferences()).toMatchObject({
      theme: "dark",
      font_scale: 125,
    });
    await study.saveReadingProgress({ versionId: "test", book: "JHN", chapter: 3, verse: 16 });
    expect(await study.getReadingProgress("test")).toMatchObject({
      book: "JHN",
      chapter: 3,
      verse: 16,
    });
  });
});
