import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import {
  formatHlc,
  type ChangeEnvelope,
  type PushRequest,
  type PushResponse,
  type PullResponse,
  type PushResult,
} from "@holyword/core";
import { PersistentHybridClock } from "../src/clock";
import { HolyWordDexie } from "../src/dexie";
import { LocalStudy } from "../src/study";
import { SyncClient } from "../src/sync/client";
import type { LocalNote, SyncTransport } from "../src/types";

const DEVICE_ID = "11111111-1111-4111-8111-111111111111";
const NOW = "2026-01-01T00:00:00.000Z";

class FakeServer implements SyncTransport {
  readonly changes: ChangeEnvelope[] = [];
  readonly applied = new Set<string>();
  readonly pushes: PushRequest[] = [];
  readonly pulls: { cursor: number; limit: number }[] = [];
  conflictOpId: string | undefined;
  conflictId: string | undefined;

  async push(request: PushRequest): Promise<PushResponse> {
    this.pushes.push(request);
    const results: PushResult[] = request.ops.map((op) => {
      if (this.conflictOpId === op.opId) {
        return {
          opId: op.opId,
          status: "conflict",
          serverVersion: 2,
          conflictId: this.conflictId ?? "server-conflict",
        };
      }
      const duplicate = this.applied.has(op.opId);
      this.applied.add(op.opId);
      return {
        opId: op.opId,
        status: duplicate ? "duplicate" : "applied",
        serverVersion: duplicate ? 2 : 1,
      };
    });
    return { results, cursor: String(this.changes.length) };
  }

  async pull(cursor: number, limit: number): Promise<PullResponse> {
    this.pulls.push({ cursor, limit });
    const remaining = this.changes
      .filter((change) => change.serverSeq > cursor)
      .sort((a, b) => a.serverSeq - b.serverSeq);
    const page = remaining.slice(0, limit);
    return {
      changes: page,
      cursor: String(page.at(-1)?.serverSeq ?? cursor),
      hasMore: remaining.length > page.length,
    };
  }
}

let sequence = 0;
const databases: HolyWordDexie[] = [];

async function setup() {
  sequence += 1;
  const db = new HolyWordDexie(`sync-${sequence}`);
  databases.push(db);
  const clock = new PersistentHybridClock(db, "web", () => Date.now());
  const study = new LocalStudy({ store: db, clock, now: () => new Date(NOW) });
  const server = new FakeServer();
  const client = new SyncClient({
    store: db,
    transport: server,
    deviceId: DEVICE_ID,
    clock,
    now: () => new Date(NOW),
    pullPageSize: 2,
  });
  return { db, clock, study, server, client };
}

afterEach(async () => {
  await Promise.all(
    databases.splice(0).map(async (db) => {
      db.close();
      await db.delete();
    }),
  );
});

describe("SyncClient", () => {
  it("pushes pending records, updates server versions and advances the cursor", async () => {
    const { db, study, server, client } = await setup();
    const bookmark = await study.saveBookmark({
      id: "22222222-2222-4222-8222-222222222222",
      verseId: "JHN.3.16",
      versionId: "test",
    });
    const summary = await client.sync();
    expect(summary).toMatchObject({ pushed: 1, pulled: 0, pending: 0 });
    expect(server.pushes).toHaveLength(1);
    expect(server.pushes[0]!.ops[0]).toMatchObject({
      opId: expect.any(String),
      entity: "bookmark",
      entityId: bookmark.id,
      baseVersion: 0,
    });
    expect(await db.countQueue()).toBe(0);
    expect((await db.getLocalRecord("bookmark", bookmark.id))?.server_version).toBe(1);
    expect(await db.getState(`cursor:${DEVICE_ID}`)).toBe("0");
  });

  it("resends the same op id after a failed acknowledgement and receives duplicate", async () => {
    const { db, study, server, client } = await setup();
    await study.saveBookmark({
      id: "33333333-3333-4333-8333-333333333333",
      verseId: "GEN.1.1",
      versionId: "test",
    });
    const originalDelete = db.deleteQueue.bind(db);
    let failOnce = true;
    db.deleteQueue = async (opId: string) => {
      if (failOnce) {
        failOnce = false;
        throw new Error("simulated crash after server commit");
      }
      await originalDelete(opId);
    };

    await expect(client.sync()).rejects.toThrow("simulated crash");
    expect(await db.countQueue()).toBe(1);
    db.deleteQueue = originalDelete;
    const summary = await client.sync();
    expect(summary.pushed).toBe(1);
    expect(server.pushes).toHaveLength(2);
    expect(server.pushes[0]!.ops[0]!.opId).toBe(server.pushes[1]!.ops[0]!.opId);
    expect(server.applied.size).toBe(1);
    expect(await db.countQueue()).toBe(0);
  });

  it("applies pulled tombstones and pages through the cursor", async () => {
    const { db, client, server } = await setup();
    server.changes.push(
      {
        serverSeq: 1,
        entity: "note",
        entityId: "remote-note",
        op: "upsert",
        payload: {
          verseId: "JHN.3.16",
          reference: "John 3:16",
          title: null,
          body: "Remote note",
          folderId: null,
        },
        hlc: "0000000002000:000000:remote",
        serverVersion: 1,
        tombstone: false,
      },
      {
        serverSeq: 2,
        entity: "note",
        entityId: "remote-note",
        op: "delete",
        payload: null,
        hlc: "0000000003000:000000:remote",
        serverVersion: 2,
        tombstone: true,
      },
      {
        serverSeq: 3,
        entity: "bookmark",
        entityId: "remote-bookmark",
        op: "upsert",
        payload: { verseId: "GEN.1.1", versionId: "test", label: null },
        hlc: "0000000004000:000000:remote",
        serverVersion: 1,
        tombstone: false,
      },
    );
    const summary = await client.sync();
    expect(summary.pulled).toBe(3);
    expect(server.pulls).toEqual([
      { cursor: 0, limit: 2 },
      { cursor: 2, limit: 2 },
    ]);
    expect(await db.getState(`cursor:${DEVICE_ID}`)).toBe("3");
    expect(await db.getLocalRecord("note", "remote-note")).toMatchObject({
      deleted_at: expect.any(String),
      server_version: 2,
    });
    expect(await db.getLocalRecord("bookmark", "remote-bookmark")).toMatchObject({
      verse_id: "GEN.1.1",
    });
  });

  it("turns a push conflict into a preserved local/remote note conflict", async () => {
    const { db, study, server, client } = await setup();
    const note = await study.saveNote({
      id: "44444444-4444-4444-8444-444444444444",
      verseId: "JHN.3.16",
      reference: "John 3:16",
      body: "Local body",
    });
    const queue = (await db.listQueue(10))[0]!;
    server.conflictOpId = queue.op_id;
    server.conflictId = "55555555-5555-4555-8555-555555555555";
    server.changes.push({
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
      hlc: formatHlc({ wallTime: Date.now() + 60_000, counter: 0, nodeId: "remote" }),
      serverVersion: 2,
      tombstone: false,
    });
    const summary = await client.sync();
    expect(summary.conflicts).toBe(1);
    expect(await db.countQueue()).toBe(0);
    expect(((await db.getLocalRecord("note", note.id)) as LocalNote).body).toBe("Remote body");
    const conflicts = await db.listNoteConflicts();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      note_id: note.id,
      server_conflict_id: "55555555-5555-4555-8555-555555555555",
      local_payload: { body: "Local body" },
      remote_payload: { body: "Remote body" },
    });
    expect(await db.getState(`conflict:${note.id}`)).toBe("");
  });

  it("keeps rejected queue rows visible and can retry them", async () => {
    const { db, study, client } = await setup();
    await study.saveNote({ id: "66666666-6666-4666-8666-666666666666", body: "Rejected" });
    const failing: SyncTransport = {
      push: async (request) =>
        Promise.resolve({
          results: request.ops.map((op) => ({
            opId: op.opId,
            status: "rejected" as const,
            reason: "invalid-payload",
          })),
          cursor: "0",
        }),
      pull: async (cursor) => ({ changes: [], cursor: String(cursor), hasMore: false }),
    };
    const rejectingClient = new SyncClient({
      store: db,
      transport: failing,
      deviceId: DEVICE_ID,
      clock: new PersistentHybridClock(db, "web"),
      now: () => new Date(NOW),
    });
    const summary = await rejectingClient.sync();
    expect(summary.pending).toBe(1);
    expect(await db.countQueue()).toBe(1);
    const failed = await db.sync_queue.where("status").equals("failed").toArray();
    expect(failed[0]).toMatchObject({ last_error: "invalid-payload", attempts: 1 });
    await client.retryFailed();
    expect(await db.countQueue()).toBe(1);
    expect(await db.sync_queue.where("status").equals("pending").count()).toBe(1);
  });
});
