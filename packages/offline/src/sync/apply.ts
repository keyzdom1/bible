import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { compareHlc, parseHlc, type ChangeEnvelope } from "@holyword/core";
import { randomUuid } from "../clock";
import { PREFERENCES_ID, payloadToRecord, toSyncPayload, type RecordMeta } from "../records";
import type {
  LocalEntityRecord,
  LocalNote,
  LocalNoteConflict,
  StudyStore,
  SyncQueueRecord,
} from "../types";

export interface ConflictHint {
  readonly noteId: string;
  readonly localPayload: Record<string, unknown>;
  readonly localHlc: string;
  readonly serverConflictId: string | null;
  readonly createdAt: string;
}

export interface ApplyOptions {
  readonly localPending?: SyncQueueRecord;
  readonly conflictHint?: ConflictHint;
  readonly now?: () => Date;
  readonly newId?: () => string;
}

export interface ApplyResult {
  readonly applied: boolean;
  readonly conflict?: LocalNoteConflict;
}

type ApplyStore = Pick<StudyStore, "getLocalRecord" | "putRemoteRecord" | "putNoteConflict">;

function isNewerOrEqual(incoming: string, current: string): boolean {
  return compareHlc(parseHlc(incoming), parseHlc(current)) >= 0;
}

function noteFields(payload: Record<string, unknown> | null): Record<string, unknown> {
  if (!payload) return {};
  return {
    verseId: payload.verseId ?? null,
    reference: payload.reference ?? null,
    title: payload.title ?? null,
    body: payload.body,
    folderId: payload.folderId ?? null,
  };
}

function sameNote(local: Record<string, unknown>, remote: Record<string, unknown> | null): boolean {
  return JSON.stringify(noteFields(local)) === JSON.stringify(noteFields(remote));
}

/** Stable id makes a retried pull idempotent: the same two versions map to one conflict. */
export function noteConflictId(noteId: string, localHlc: string, remoteHlc: string): string {
  const hex = bytesToHex(sha256(`${noteId}\u0000${localHlc}\u0000${remoteHlc}`));
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function makeConflict(
  noteId: string,
  localPayload: Record<string, unknown>,
  remotePayload: Record<string, unknown> | null,
  localHlc: string,
  remoteHlc: string,
  options: ApplyOptions,
): LocalNoteConflict {
  return {
    id: options.conflictHint?.serverConflictId ?? noteConflictId(noteId, localHlc, remoteHlc),
    note_id: noteId,
    local_payload: localPayload,
    remote_payload: noteFields(remotePayload),
    local_hlc: localHlc,
    remote_hlc: remoteHlc,
    server_conflict_id: options.conflictHint?.serverConflictId ?? null,
    resolution: null,
    resolved_at: null,
    created_at: (options.now ?? (() => new Date()))().toISOString(),
  };
}

/**
 * Applies one server change with last-write-wins and local tombstones. Note edits
 * that race with a pending local edit preserve both payloads in note_conflicts.
 */
export async function applyRemoteChange(
  store: ApplyStore,
  change: ChangeEnvelope,
  options: ApplyOptions = {},
): Promise<ApplyResult> {
  const now = (options.now ?? (() => new Date()))().toISOString();
  const newId = options.newId ?? randomUuid;
  const current = await store.getLocalRecord(change.entity, change.entityId);

  let conflict: LocalNoteConflict | undefined;
  if (
    change.entity === "note" &&
    change.op === "upsert" &&
    change.payload &&
    current &&
    (options.localPending !== undefined || options.conflictHint !== undefined) &&
    !sameNote(
      toSyncPayload("note", current as LocalNote) as unknown as Record<string, unknown>,
      change.payload,
    )
  ) {
    const localPayload =
      (options.conflictHint?.localPayload as Record<string, unknown> | undefined) ??
      (toSyncPayload("note", current as LocalNote) as unknown as Record<string, unknown>);
    const localHlc = options.conflictHint?.localHlc ?? current.hlc;
    conflict = makeConflict(change.entityId, localPayload, change.payload, localHlc, change.hlc, {
      ...options,
      newId,
    });
    await store.putNoteConflict(conflict);
  }

  if (!current) {
    if (change.tombstone || change.op === "delete") return { applied: false, conflict };
    const meta: RecordMeta = {
      hlc: change.hlc,
      server_version: change.serverVersion,
      deleted_at: null,
      created_at: now,
      updated_at: now,
    };
    const record: LocalEntityRecord = payloadToRecord(
      change.entity,
      change.entityId,
      change.payload,
      meta,
    );
    await store.putRemoteRecord(change.entity, record);
    return { applied: true, conflict };
  }

  if (!isNewerOrEqual(change.hlc, current.hlc)) {
    return { applied: false, conflict };
  }

  if (change.tombstone || change.op === "delete") {
    const tombstone = {
      ...current,
      hlc: change.hlc,
      server_version: change.serverVersion,
      deleted_at: now,
      updated_at: now,
    } as LocalEntityRecord;
    await store.putRemoteRecord(change.entity, tombstone);
    return { applied: true, conflict };
  }

  const meta: RecordMeta = {
    hlc: change.hlc,
    server_version: change.serverVersion,
    deleted_at: null,
    created_at: current.created_at,
    updated_at: now,
  };
  const record = payloadToRecord(change.entity, change.entityId, change.payload, meta, current);
  await store.putRemoteRecord(change.entity, record);
  return { applied: true, conflict };
}

export function isPreferencesId(entityId: string): boolean {
  return entityId === PREFERENCES_ID;
}
