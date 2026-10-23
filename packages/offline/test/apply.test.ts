import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import type { ChangeEnvelope } from "@holyword/core";
import { HolyWordDexie } from "../src/dexie";
import { applyRemoteChange } from "../src/sync/apply";
import type { LocalBookmark, LocalNote, LocalPreferences, SyncQueueRecord } from "../src/types";

let sequence = 0;
const databases: HolyWordDexie[] = [];

async function setup() {
  sequence += 1;
  const db = new HolyWordDexie(`apply-${sequence}`);
  databases.push(db);
  return db;
}

afterEach(async () => {
  await Promise.all(
    databases.splice(0).map(async (db) => {
      db.close();
      await db.delete();
    }),
  );
});

const OLD = "0000000001000:000000:test";
const NEW = "0000000002000:000000:test";
const NEWER = "0000000003000:000000:test";
const NOW = "2026-01-01T00:00:00.000Z";

function note(overrides: Partial<LocalNote> = {}): LocalNote {
  return {
    id: "note-1",
    verse_id: "JHN.3.16",
    reference: "John 3:16",
    title: null,
    body: "Local body",
    folder_id: null,
    hlc: OLD,
    server_version: 1,
    deleted_at: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function noteChange(overrides: Partial<ChangeEnvelope> = {}): ChangeEnvelope {
  return {
    serverSeq: 1,
    entity: "note",
    entityId: "note-1",
    op: "upsert",
    payload: {
      verseId: "JHN.3.16",
      reference: "John 3:16",
      title: null,
      body: "Remote body",
      folderId: null,
    },
    hlc: NEW,
    serverVersion: 2,
    tombstone: false,
    ...overrides,
  };
}

function pending(entity: SyncQueueRecord["entity"], entityId: string): SyncQueueRecord {
  return {
    op_id: "op-1",
    entity,
    entity_id: entityId,
    op: "upsert",
    payload: {},
    hlc: OLD,
    base_version: 1,
    status: "pending",
    attempts: 0,
    last_error: null,
    revision: 1,
    created_at: NOW,
    updated_at: NOW,
  };
}

describe("remote conflict application", () => {
  it("ignores an older remote change", async () => {
    const db = await setup();
    await db.putRemoteRecord("note", note({ hlc: NEW }));
    const result = await applyRemoteChange(db, noteChange({ hlc: OLD, serverVersion: 9 }));
    expect(result.applied).toBe(false);
    expect((await db.getLocalRecord("note", "note-1")) as LocalNote).toMatchObject({
      body: "Local body",
      hlc: NEW,
      server_version: 1,
    });
  });

  it("applies a newer remote change and clears a local tombstone", async () => {
    const db = await setup();
    await db.putRemoteRecord("note", note({ hlc: OLD, deleted_at: NOW, server_version: 3 }));
    const result = await applyRemoteChange(db, noteChange({ hlc: NEW }));
    expect(result.applied).toBe(true);
    expect((await db.getLocalRecord("note", "note-1")) as LocalNote).toMatchObject({
      body: "Remote body",
      deleted_at: null,
      hlc: NEW,
      server_version: 2,
    });
  });

  it("stores missing remote deletes as tombstones and ignores unknown deletes", async () => {
    const db = await setup();
    const bookmark: LocalBookmark = {
      id: "bookmark-1",
      verse_id: "JHN.3.16",
      version_id: "test",
      label: null,
      hlc: OLD,
      server_version: 1,
      deleted_at: null,
      created_at: NOW,
      updated_at: NOW,
    };
    await db.putRemoteRecord("bookmark", bookmark);
    const result = await applyRemoteChange(db, {
      serverSeq: 2,
      entity: "bookmark",
      entityId: "bookmark-1",
      op: "delete",
      payload: null,
      hlc: NEW,
      serverVersion: 2,
      tombstone: true,
    });
    expect(result.applied).toBe(true);
    expect((await db.getLocalRecord("bookmark", "bookmark-1"))?.deleted_at).not.toBeNull();

    const missing = await applyRemoteChange(db, {
      serverSeq: 3,
      entity: "bookmark",
      entityId: "missing",
      op: "delete",
      payload: null,
      hlc: NEW,
      serverVersion: 1,
      tombstone: true,
    });
    expect(missing.applied).toBe(false);
    expect(await db.getLocalRecord("bookmark", "missing")).toBeUndefined();
  });

  it("merges partial preference payloads", async () => {
    const db = await setup();
    const preferences: LocalPreferences = {
      id: "preferences",
      theme: "dark",
      reading_theme: "light",
      font_scale: 100,
      active_version_id: "test",
      last_location: null,
      hlc: OLD,
      server_version: 1,
      deleted_at: null,
      created_at: NOW,
      updated_at: NOW,
    };
    await db.putRemoteRecord("preference", preferences);
    await applyRemoteChange(db, {
      serverSeq: 2,
      entity: "preference",
      entityId: "preferences",
      op: "upsert",
      payload: { fontScale: 140, readingTheme: "sepia" },
      hlc: NEW,
      serverVersion: 2,
      tombstone: false,
    });
    expect(
      (await db.getLocalRecord("preference", "preferences")) as LocalPreferences,
    ).toMatchObject({
      theme: "dark",
      reading_theme: "sepia",
      font_scale: 140,
      active_version_id: "test",
    });
  });

  it("preserves both sides when a pending local note races with a newer remote edit", async () => {
    const db = await setup();
    await db.putRemoteRecord("note", note({ hlc: OLD, body: "Local body" }));
    const queue = pending("note", "note-1");
    const result = await applyRemoteChange(db, noteChange({ hlc: NEW }), {
      localPending: queue,
      now: () => new Date(NOW),
    });
    expect(result.applied).toBe(true);
    expect(result.conflict).toBeDefined();
    expect((await db.getLocalRecord("note", "note-1")) as LocalNote).toMatchObject({
      body: "Remote body",
      hlc: NEW,
    });
    const conflicts = await db.listNoteConflicts();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      note_id: "note-1",
      local_hlc: OLD,
      remote_hlc: NEW,
      local_payload: { body: "Local body" },
      remote_payload: { body: "Remote body" },
    });
  });

  it("preserves a newer local note and still flags the remote edit", async () => {
    const db = await setup();
    await db.putRemoteRecord("note", note({ hlc: NEWER, body: "Local body" }));
    const result = await applyRemoteChange(db, noteChange({ hlc: NEW }), {
      localPending: pending("note", "note-1"),
    });
    expect(result.applied).toBe(false);
    expect(result.conflict).toBeDefined();
    expect((await db.getLocalRecord("note", "note-1")) as LocalNote).toMatchObject({
      body: "Local body",
      hlc: NEWER,
    });
    expect(await db.listNoteConflicts()).toHaveLength(1);
  });

  it("uses a deterministic conflict id so pull retries do not duplicate it", async () => {
    const db = await setup();
    await db.putRemoteRecord("note", note({ hlc: NEWER }));
    const first = await applyRemoteChange(db, noteChange({ hlc: NEW }), {
      localPending: pending("note", "note-1"),
    });
    const second = await applyRemoteChange(db, noteChange({ hlc: NEW }), {
      localPending: pending("note", "note-1"),
    });
    expect(second.conflict?.id).toBe(first.conflict?.id);
    expect(await db.listNoteConflicts()).toHaveLength(1);
  });

  it("does not flag an ordinary remote note update when nothing is pending", async () => {
    const db = await setup();
    await db.putRemoteRecord("note", note({ hlc: OLD }));
    const result = await applyRemoteChange(db, noteChange({ hlc: NEW }));
    expect(result.conflict).toBeUndefined();
    expect(await db.listNoteConflicts()).toEqual([]);
  });
});
