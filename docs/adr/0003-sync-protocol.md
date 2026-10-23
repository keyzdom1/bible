# ADR 0003 — Sync protocol

- Status: accepted
- Date: 2026-10-20

## Context

Every user feature must work offline first, and changes must converge across devices
without duplicates. The spec fixes the broad shape: a local queue with UUID + hybrid
logical clock, idempotent pushes, per-device cursors, last-write-wins per field, tombstones,
and preserved note conflicts.

## Operation envelope

```ts
interface SyncOperation {
  opId: string; // client UUID, the idempotency key
  entity: SyncEntity; // bookmark | highlight | note | folder | ...
  entityId: string;
  op: "upsert" | "delete";
  payload: Record<string, unknown> | null;
  hlc: string; // 13-digit wall time : 6-digit counter : node id
  baseVersion?: number;
}
```

Clients push batches of at most 500 operations to `POST /v1/sync/push`. The server:

1. Looks up `opId` in `sync_operations`. If present, returns `duplicate` with the original
   `serverSeq` and does not re-apply the change.
2. Applies the operation to the entity table, incrementing the row's `serverVersion`.
3. Allocates a monotonic `serverSeq` and records the operation in `sync_operations`.
4. Returns a per-operation result: `applied`, `duplicate`, `conflict` or `rejected`, plus
   the new cursor.

`sync_operations.op_id` is the primary key, so a retried batch is safe even if the first
response was lost.

## Pulling

`GET /v1/sync/pull?cursor=N` returns changes with `serverSeq > N` in order, up to the page
limit. Each device stores its own `pullCursor` (`devices.pull_cursor`). Changes include
tombstones (`deletedAt` set) so deletes propagate. The cursor is the decimal `serverSeq`;
it is opaque to clients.

## Conflict policy

- **Last write wins per field**, ordered by HLC (`wallTime`, then `counter`, then node id).
  Two independent clocks cannot collide because the node id breaks ties.
- **Deletes are tombstones.** A delete is an update with `deletedAt` set; the row is
  retained so other devices can observe the deletion.
- **Notes keep both versions.** If an incoming note update carries a `baseVersion` lower
  than the stored `serverVersion` and both payloads differ, the server applies LWW to the
  live row and writes a `note_conflicts` row containing both payloads and HLCs. The API
  returns `409` with a `conflictId`; the client surfaces a resolution UI (keep local, keep
  remote, or merge). No note content is ever discarded silently.

Highlights and bookmarks are single-field-dominant, so LWW is sufficient. Folders and
reading progress follow the same rule.

## Offline behaviour

- Local writes go to the client database and to a persisted queue in the same transaction.
- Sync runs on reconnect, on foreground, and periodically in the background where the OS
  permits it. iOS background execution is best-effort; the foreground sync is the
  guarantee.
- A cached session keeps the app usable offline. An expired token produces a
  `SyncStatus: "error"` state and leaves the queue intact for retry after re-auth.
- The UI has four explicit states: offline, syncing, synced, error.

## Alternatives rejected

- **CRDTs for note text.** Higher implementation and storage complexity than the spec
  requires; the spec explicitly asks for LWW plus preserved conflicts.
- **Timestamps only.** Wall clocks drift; an HLC keeps causality without assuming
  synchronised clocks.
- **Server-side sequence assigned at push time without an op log.** Loses idempotency when
  responses are dropped, and cannot serve stable cursors.
