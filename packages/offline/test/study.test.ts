import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { compareHlc, parseHlc } from "@holyword/core";
import { PersistentHybridClock } from "../src/clock";
import { HolyWordDexie } from "../src/dexie";
import { LocalStudy } from "../src/study";

let sequence = 0;
function nextId(): string {
  sequence += 1;
  return `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
}

async function setup() {
  const db = new HolyWordDexie(`study-${nextId()}`);
  let now = Date.parse("2026-01-01T00:00:00.000Z");
  const clock = new PersistentHybridClock(db, "web", () => now);
  const study = new LocalStudy({
    store: db,
    clock,
    newId: nextId,
    now: () => new Date((now += 1)),
  });
  return { db, study, clock, advance: (ms: number) => (now += ms) };
}

const databases: HolyWordDexie[] = [];
afterEach(async () => {
  await Promise.all(
    databases.splice(0).map(async (db) => {
      db.close();
      await db.delete();
    }),
  );
});

describe("local study queue", () => {
  it("writes a local record and a queue operation in one transaction", async () => {
    const { db, study } = await setup();
    databases.push(db);
    const bookmark = await study.saveBookmark({
      id: "11111111-1111-4111-8111-111111111111",
      verseId: "JHN.3.16",
      versionId: "test",
      label: "Grace",
    });
    expect(bookmark.verse_id).toBe("JHN.3.16");
    expect(bookmark.deleted_at).toBeNull();
    expect(await db.bookmarks.get(bookmark.id)).toEqual(bookmark);
    const queue = await db.sync_queue.toArray();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      entity: "bookmark",
      entity_id: bookmark.id,
      op: "upsert",
      base_version: 0,
      status: "pending",
      revision: 1,
      payload: { verseId: "JHN.3.16", versionId: "test", label: "Grace" },
    });
    expect(queue[0]!.op_id).toMatch(/^00000000-/);
  });

  it("coalesces repeated offline edits without producing stale base versions", async () => {
    const { db, study, advance } = await setup();
    databases.push(db);
    const id = "22222222-2222-4222-8222-222222222222";
    const first = await study.saveNote({
      id,
      verseId: "GEN.1.1",
      reference: "Genesis 1:1",
      body: "First draft",
    });
    const firstQueue = (await db.sync_queue.toArray())[0]!;
    advance(5);
    const second = await study.saveNote({ id, body: "Second draft" });
    const queue = await db.sync_queue.toArray();
    expect(queue).toHaveLength(1);
    expect(queue[0]!.op_id).toBe(firstQueue.op_id);
    expect(queue[0]!.revision).toBe(2);
    expect(queue[0]!.payload).toMatchObject({ body: "Second draft" });
    expect(compareHlc(parseHlc(second.hlc), parseHlc(first.hlc))).toBeGreaterThan(0);
    expect(second.created_at).toBe(first.created_at);
    expect(second.verse_id).toBe("GEN.1.1");
  });

  it("uses the last acknowledged server version as baseVersion", async () => {
    const { db, study } = await setup();
    databases.push(db);
    const id = "33333333-3333-4333-8333-333333333333";
    const first = await study.saveBookmark({ id, verseId: "GEN.1.1", versionId: "test" });
    const firstQueue = (await db.sync_queue.toArray())[0]!;
    await db.sync_queue.delete(firstQueue.op_id);
    await db.updateRecordServerVersion("bookmark", first.id, 4);
    const second = await study.saveBookmark({
      id,
      verseId: "GEN.1.1",
      versionId: "test",
      label: "Updated",
    });
    expect(second.server_version).toBe(4);
    const queue = (await db.sync_queue.toArray())[0]!;
    expect(queue.base_version).toBe(4);
    expect(queue.op_id).not.toBe(firstQueue.op_id);
  });

  it("writes tombstones and delete queue operations", async () => {
    const { db, study } = await setup();
    databases.push(db);
    const only = await study.saveBookmark({
      id: "44444444-4444-4444-8444-444444444444",
      verseId: "GEN.1.2",
      versionId: "test",
    });
    await study.deleteBookmark(only.id);
    const row = await db.bookmarks.get(only.id);
    expect(row?.deleted_at).not.toBeNull();
    const queue = (await db.sync_queue.toArray())[0]!;
    expect(queue.op).toBe("delete");
    expect(queue.payload).toBeNull();
    expect(await study.listBookmarks()).toEqual([]);
    expect(await study.listBookmarks(true)).toHaveLength(1);
  });

  it("merges preference patches while preserving one pending operation", async () => {
    const { db, study } = await setup();
    databases.push(db);
    await study.savePreferences({ theme: "dark" });
    await study.savePreferences({
      readingTheme: "sepia",
      lastLocation: { versionId: "test", book: "JHN", chapter: 3, verse: 16 },
    });
    const queue = (await db.sync_queue.toArray())[0]!;
    expect(queue.payload).toMatchObject({
      theme: "dark",
      readingTheme: "sepia",
      lastLocation: { versionId: "test", book: "JHN", chapter: 3, verse: 16 },
    });
    const prefs = await study.getPreferences();
    expect(prefs).toMatchObject({
      id: "preferences",
      theme: "dark",
      reading_theme: "sepia",
      font_scale: 100,
    });
  });

  it("keys reading progress by version and sends no version in its payload", async () => {
    const { db, study } = await setup();
    databases.push(db);
    const progress = await study.saveReadingProgress({
      versionId: "test",
      book: "JHN",
      chapter: 3,
      verse: 16,
    });
    expect(progress.version_id).toBe("test");
    const queue = (await db.sync_queue.toArray())[0]!;
    expect(queue.entity_id).toBe("test");
    expect(queue.payload).toEqual({ book: "JHN", chapter: 3, verse: 16 });
  });
});
