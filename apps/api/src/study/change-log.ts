import { randomUUID } from "node:crypto";
import { createClock, formatHlc } from "@holyword/core";
import type { Database, DbTransaction } from "@holyword/db";
import { max, eq } from "drizzle-orm";
import { syncOperations } from "@holyword/db";
import type { ChangeInput } from "./apply-change";

export const NIL_DEVICE_ID = "00000000-0000-0000-0000-000000000000";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeDeviceId(value: string | undefined): string {
  return value && UUID_PATTERN.test(value) ? value : NIL_DEVICE_ID;
}

export function serverHlc(): string {
  return formatHlc(createClock("server"));
}

export function newOpId(): string {
  return randomUUID();
}

export async function appendChangeLog(
  tx: DbTransaction,
  entry: {
    userId: string;
    opId: string;
    deviceId: string;
    change: ChangeInput;
    serverVersion: number;
    conflictId?: string;
  },
): Promise<number> {
  const [row] = await tx
    .insert(syncOperations)
    .values({
      opId: entry.opId,
      userId: entry.userId,
      deviceId: entry.deviceId,
      entity: entry.change.entity,
      entityId: entry.change.entityId,
      op: entry.change.op,
      payload: entry.change.op === "upsert" ? entry.change.payload : null,
      hlc: entry.change.hlc,
      serverVersion: entry.serverVersion,
      conflictId: entry.conflictId ?? null,
    })
    .returning({ serverSeq: syncOperations.serverSeq });
  if (!row) throw new Error("Failed to append the sync change log");
  return Number(row.serverSeq);
}

export async function currentCursor(db: Database, userId: string): Promise<string> {
  const [row] = await db
    .select({ value: max(syncOperations.serverSeq) })
    .from(syncOperations)
    .where(eq(syncOperations.userId, userId));
  return String(row?.value ?? 0);
}
