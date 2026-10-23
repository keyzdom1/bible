import { z } from "zod";

/** Fixed-width, lexicographically sortable hybrid logical clock. */
export interface HybridLogicalClock {
  readonly wallTime: number;
  readonly counter: number;
  readonly nodeId: string;
}

const HLC_PATTERN = /^(\d{13}):(\d{6}):([A-Za-z0-9_-]{1,32})$/;
const NODE_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

export function formatHlc(clock: HybridLogicalClock): string {
  if (!Number.isSafeInteger(clock.wallTime) || clock.wallTime < 0) {
    throw new RangeError(`Invalid HLC wall time: ${clock.wallTime}`);
  }
  if (!Number.isInteger(clock.counter) || clock.counter < 0 || clock.counter > 999_999) {
    throw new RangeError(`Invalid HLC counter: ${clock.counter}`);
  }
  if (!NODE_ID_PATTERN.test(clock.nodeId)) {
    throw new RangeError(`Invalid HLC node id: ${clock.nodeId}`);
  }
  return `${String(clock.wallTime).padStart(13, "0")}:${String(clock.counter).padStart(6, "0")}:${clock.nodeId}`;
}

export function parseHlc(value: string): HybridLogicalClock {
  const match = HLC_PATTERN.exec(value);
  if (!match) throw new Error(`Invalid HLC value: "${value}"`);
  return {
    wallTime: Number(match[1]),
    counter: Number(match[2]),
    nodeId: match[3]!,
  };
}

export function compareHlc(a: HybridLogicalClock, b: HybridLogicalClock): number {
  return (
    a.wallTime - b.wallTime ||
    a.counter - b.counter ||
    (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0)
  );
}

export function createClock(nodeId: string, now: number = Date.now()): HybridLogicalClock {
  if (!NODE_ID_PATTERN.test(nodeId)) throw new RangeError(`Invalid HLC node id: ${nodeId}`);
  return { wallTime: now, counter: 0, nodeId };
}

/** Advances the local clock for a local event. */
export function tick(clock: HybridLogicalClock, now: number = Date.now()): HybridLogicalClock {
  if (now > clock.wallTime) {
    return { wallTime: now, counter: 0, nodeId: clock.nodeId };
  }
  return { wallTime: clock.wallTime, counter: clock.counter + 1, nodeId: clock.nodeId };
}

/** Merges a remote clock into the local clock (used when applying pulled changes). */
export function receive(
  clock: HybridLogicalClock,
  remote: HybridLogicalClock,
  now: number = Date.now(),
): HybridLogicalClock {
  const wallTime = Math.max(now, clock.wallTime, remote.wallTime);
  let counter: number;
  if (wallTime === clock.wallTime && wallTime === remote.wallTime) {
    counter = Math.max(clock.counter, remote.counter) + 1;
  } else if (wallTime === clock.wallTime) {
    counter = clock.counter + 1;
  } else if (wallTime === remote.wallTime) {
    counter = remote.counter + 1;
  } else {
    counter = 0;
  }
  return { wallTime, counter, nodeId: clock.nodeId };
}

export function maxClock(a: HybridLogicalClock, b: HybridLogicalClock): HybridLogicalClock {
  return compareHlc(a, b) >= 0 ? a : b;
}

export function hlcMillis(value: string): number {
  return parseHlc(value).wallTime;
}

export const syncEntitySchema = z.enum([
  "bookmark",
  "highlight",
  "note",
  "folder",
  "reading-plan-progress",
  "reading-progress",
  "preference",
]);
export type SyncEntity = z.infer<typeof syncEntitySchema>;

export const syncOperationSchema = z.object({
  opId: z.uuid(),
  entity: syncEntitySchema,
  entityId: z.string().min(1).max(200),
  op: z.enum(["upsert", "delete"]),
  payload: z.record(z.string(), z.unknown()).nullable().optional(),
  hlc: z.string().regex(HLC_PATTERN, "Expected a formatted HLC"),
  /** Client-known server version of the record, used to detect conflicts. */
  baseVersion: z.number().int().nonnegative().optional(),
});
export type SyncOperation = z.infer<typeof syncOperationSchema>;

export const pushRequestSchema = z.object({
  deviceId: z.uuid(),
  ops: z.array(syncOperationSchema).max(500),
});
export type PushRequest = z.infer<typeof pushRequestSchema>;

export interface PushResult {
  readonly opId: string;
  readonly status: "applied" | "duplicate" | "conflict" | "rejected";
  readonly serverSeq?: number;
  readonly serverVersion?: number;
  readonly reason?: string;
  readonly conflictId?: string;
}

export interface PushResponse {
  readonly results: readonly PushResult[];
  readonly cursor: string;
}

export interface SyncCursor {
  /** Monotonic per-user sequence assigned by the server on apply. */
  readonly serverSeq: number;
}

export interface ChangeEnvelope {
  readonly serverSeq: number;
  readonly entity: SyncEntity;
  readonly entityId: string;
  readonly op: "upsert" | "delete";
  readonly payload: Record<string, unknown> | null;
  readonly hlc: string;
  readonly serverVersion: number;
  readonly tombstone: boolean;
}

export interface PullResponse {
  readonly changes: readonly ChangeEnvelope[];
  readonly cursor: string;
  readonly hasMore: boolean;
}

export const changeEnvelopeSchema = z.object({
  serverSeq: z.number().int().nonnegative(),
  entity: syncEntitySchema,
  entityId: z.string().min(1),
  op: z.enum(["upsert", "delete"]),
  payload: z.record(z.string(), z.unknown()).nullable(),
  hlc: z.string().regex(HLC_PATTERN),
  serverVersion: z.number().int().nonnegative(),
  tombstone: z.boolean(),
});

export const pullResponseSchema = z.object({
  changes: z.array(changeEnvelopeSchema),
  cursor: z.string(),
  hasMore: z.boolean(),
});

export interface NoteConflict {
  readonly id: string;
  readonly noteId: string;
  readonly localPayload: Record<string, unknown>;
  readonly remotePayload: Record<string, unknown>;
  readonly localHlc: string;
  readonly remoteHlc: string;
  readonly createdAt: string;
}

export type SyncStatus = "offline" | "syncing" | "synced" | "error";
