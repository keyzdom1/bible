import {
  type ChangeEnvelope,
  type PushRequest,
  type PushResponse,
  type PullResponse,
  type PushResult,
  type SyncOperation,
  type SyncStatus,
} from "@holyword/core";
import type { HolyWordApiClient } from "@holyword/core";
import { randomUuid, type IdGenerator, type PersistentHybridClock } from "../clock";
import { PREFERENCES_ID, toSyncPayload } from "../records";
import type {
  LocalNote,
  LocalNoteConflict,
  StudyStore,
  SyncQueueRecord,
  SyncTransport,
} from "../types";
import { applyRemoteChange, type ConflictHint } from "./apply";

export interface ApiSyncTransportOptions {
  readonly client: HolyWordApiClient;
}

/** Adapts the shared REST client to the transport the sync engine expects. */
export class ApiSyncTransport implements SyncTransport {
  constructor(private readonly client: HolyWordApiClient) {}

  push(request: PushRequest): Promise<PushResponse> {
    return this.client.push(request.deviceId, request.ops);
  }

  pull(cursor: number, limit: number): Promise<PullResponse> {
    return this.client.pull(cursor, limit);
  }
}

export interface SyncStateView {
  readonly status: SyncStatus;
  readonly pending: number;
  readonly lastSyncedAt: string | null;
  readonly lastError: string | null;
}

export interface SyncSummary {
  readonly pushed: number;
  readonly pulled: number;
  readonly conflicts: number;
  readonly pending: number;
}

export interface SyncClientOptions {
  readonly store: StudyStore;
  readonly transport: SyncTransport;
  readonly deviceId: string;
  readonly clock: PersistentHybridClock;
  readonly pushBatchSize?: number;
  readonly pullPageSize?: number;
  readonly newId?: IdGenerator;
  readonly now?: () => Date;
  readonly onState?: (state: SyncStateView) => void;
}

const CONFLICT_PREFIX = "conflict:";

function cursorKey(deviceId: string): string {
  return `cursor:${deviceId}`;
}

function queueOperation(op: SyncQueueRecord): SyncOperation {
  return {
    opId: op.op_id,
    entity: op.entity,
    entityId: op.entity_id,
    op: op.op,
    payload: op.payload,
    hlc: op.hlc,
    baseVersion: op.base_version,
  };
}

function parseCursor(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value)) return 0;
  const cursor = Number(value);
  return Number.isSafeInteger(cursor) ? cursor : 0;
}

function parseConflictHint(value: string | undefined): ConflictHint | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as ConflictHint;
    return typeof parsed.noteId === "string" && typeof parsed.localHlc === "string"
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Pushes the local queue and pulls by per-device cursor. A failed page never
 * advances the cursor, so a retry re-applies the same changes idempotently.
 */
export class SyncClient {
  private readonly store: StudyStore;
  private readonly transport: SyncTransport;
  private readonly deviceId: string;
  private readonly clock: PersistentHybridClock;
  private readonly pushBatchSize: number;
  private readonly pullPageSize: number;
  private readonly newId: IdGenerator;
  private readonly now: () => Date;
  private readonly onState: ((state: SyncStateView) => void) | undefined;
  private state: SyncStateView = {
    status: "offline",
    pending: 0,
    lastSyncedAt: null,
    lastError: null,
  };
  private inFlight: Promise<SyncSummary> | undefined;

  constructor(options: SyncClientOptions) {
    this.store = options.store;
    this.transport = options.transport;
    this.deviceId = options.deviceId;
    this.clock = options.clock;
    this.pushBatchSize = options.pushBatchSize ?? 500;
    this.pullPageSize = options.pullPageSize ?? 200;
    this.newId = options.newId ?? randomUuid;
    this.now = options.now ?? (() => new Date());
    this.onState = options.onState;
  }

  getState(): SyncStateView {
    return this.state;
  }

  async sync(): Promise<SyncSummary> {
    if (this.inFlight) return this.inFlight;
    const run = this.run().finally(() => {
      this.inFlight = undefined;
    });
    this.inFlight = run;
    return run;
  }

  async retryFailed(): Promise<void> {
    await this.store.retryFailedQueue();
    await this.emit(this.state.status, null);
  }

  async listConflicts(): Promise<LocalNoteConflict[]> {
    return this.store.listNoteConflicts();
  }

  private async run(): Promise<SyncSummary> {
    await this.emit("syncing", null);
    try {
      const push = await this.pushAll();
      const pull = await this.pullAll();
      const pending = await this.store.countQueue();
      const state: SyncStateView = {
        status: "synced",
        pending,
        lastSyncedAt: this.now().toISOString(),
        lastError: null,
      };
      this.state = state;
      this.onState?.(state);
      return {
        pushed: push.pushed,
        pulled: pull.pulled,
        conflicts: pull.conflicts,
        pending,
      };
    } catch (error) {
      const online = (globalThis as { navigator?: { onLine?: boolean } }).navigator?.onLine;
      const status: SyncStatus = online === false ? "offline" : "error";
      const message = error instanceof Error ? error.message : String(error);
      const pending = await this.store.countQueue().catch(() => this.state.pending);
      const state: SyncStateView = {
        status,
        pending,
        lastSyncedAt: this.state.lastSyncedAt,
        lastError: message,
      };
      this.state = state;
      this.onState?.(state);
      throw error;
    }
  }

  private async pushAll(): Promise<{ pushed: number; conflicts: number }> {
    let pushed = 0;
    let conflicts = 0;
    const seen = new Set<string>();

    while (true) {
      const queue = await this.store.listQueue(this.pushBatchSize);
      if (queue.length === 0) break;
      const fresh = queue.filter((op) => !seen.has(op.op_id));
      if (fresh.length === 0) {
        throw new Error("The sync queue did not advance; refusing to loop");
      }
      for (const op of fresh) seen.add(op.op_id);

      const response = await this.transport.push({
        deviceId: this.deviceId,
        ops: fresh.map(queueOperation),
      });
      const byId = new Map(response.results.map((result) => [result.opId, result]));
      for (const op of fresh) {
        const result = byId.get(op.op_id);
        if (!result) throw new Error(`The server did not return a result for ${op.op_id}`);
        await this.handlePushResult(op, result);
        if (result.status === "applied" || result.status === "duplicate") pushed += 1;
        if (result.status === "conflict") {
          pushed += 1;
          conflicts += 1;
        }
      }
    }
    return { pushed, conflicts };
  }

  private async handlePushResult(op: SyncQueueRecord, result: PushResult): Promise<void> {
    if (result.status === "rejected") {
      await this.store.failQueue(op.op_id, result.reason ?? "rejected");
      return;
    }

    if (result.serverVersion !== undefined) {
      await this.store.updateRecordServerVersion(op.entity, op.entity_id, result.serverVersion);
    }

    if (result.status === "conflict" && op.entity === "note") {
      const note = (await this.store.getLocalRecord("note", op.entity_id)) as LocalNote | undefined;
      if (note) {
        const hint: ConflictHint = {
          noteId: note.id,
          localPayload: toSyncPayload("note", note) as unknown as Record<string, unknown>,
          localHlc: note.hlc,
          serverConflictId: result.conflictId ?? null,
          createdAt: this.now().toISOString(),
        };
        await this.store.setState(`${CONFLICT_PREFIX}${note.id}`, JSON.stringify(hint));
      }
    }

    await this.store.deleteQueue(op.op_id);
  }

  private async pullAll(): Promise<{ pulled: number; conflicts: number }> {
    let cursor = parseCursor(await this.store.getState(cursorKey(this.deviceId)));
    let pulled = 0;
    let conflicts = 0;

    while (true) {
      const page = await this.transport.pull(cursor, this.pullPageSize);
      for (const change of page.changes) {
        const outcome = await this.applyChange(change);
        pulled += 1;
        if (outcome.conflict) conflicts += 1;
        await this.clock.observe(change.hlc);
      }
      const next = parseCursor(page.cursor);
      if (next < cursor) throw new Error("The server returned a backwards sync cursor");
      cursor = next;
      await this.store.setState(cursorKey(this.deviceId), String(cursor));
      if (!page.hasMore) break;
    }
    return { pulled, conflicts };
  }

  private async applyChange(
    change: ChangeEnvelope,
  ): Promise<{ applied: boolean; conflict?: LocalNoteConflict }> {
    const localPending = await this.store.getQueueForEntity(change.entity, change.entityId);
    const hint =
      change.entity === "note"
        ? parseConflictHint(await this.store.getState(`${CONFLICT_PREFIX}${change.entityId}`))
        : undefined;
    const outcome = await applyRemoteChange(this.store, change, {
      ...(localPending ? { localPending } : {}),
      ...(hint ? { conflictHint: hint } : {}),
      now: this.now,
      newId: this.newId,
    });
    if (hint) {
      await this.store.setState(`${CONFLICT_PREFIX}${change.entityId}`, "");
    }
    return outcome;
  }

  private async emit(status: SyncStatus, error: string | null): Promise<void> {
    const pending = await this.store.countQueue();
    this.state = {
      ...this.state,
      status,
      pending,
      lastError: error,
    };
    this.onState?.(this.state);
  }
}

export { PREFERENCES_ID };
