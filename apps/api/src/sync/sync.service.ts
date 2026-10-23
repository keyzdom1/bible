import { Injectable } from "@nestjs/common";
import { and, asc, eq, gt } from "drizzle-orm";
import type { ChangeEnvelope, PushRequest, PushResult } from "@holyword/core";
import { syncOperations } from "@holyword/db";
import { DatabaseService } from "../database/database.service";
import { applyChange, ChangeRejectedError, validatePayload } from "../study/apply-change";
import { appendChangeLog, currentCursor, normalizeDeviceId } from "../study/change-log";

export interface PullResult {
  readonly changes: readonly ChangeEnvelope[];
  readonly cursor: string;
  readonly hasMore: boolean;
}

function violationCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  if ("code" in error && typeof (error as { code?: unknown }).code === "string") {
    return (error as { code: string }).code;
  }
  if ("cause" in error) return violationCode((error as { cause?: unknown }).cause);
  return undefined;
}

@Injectable()
export class SyncService {
  constructor(private readonly database: DatabaseService) {}

  async push(
    userId: string,
    request: PushRequest,
  ): Promise<{ results: PushResult[]; cursor: string }> {
    const results: PushResult[] = [];
    const deviceId = normalizeDeviceId(request.deviceId);

    for (const op of request.ops) {
      const change = {
        entity: op.entity,
        entityId: op.entityId,
        op: op.op,
        payload: op.payload ?? null,
        hlc: op.hlc,
        baseVersion: op.baseVersion,
      };

      try {
        validatePayload(op.entity, op.payload, op.op);
      } catch {
        results.push({
          opId: op.opId,
          status: "rejected",
          reason: "invalid-payload",
        });
        continue;
      }

      const [existing] = await this.database.db
        .select()
        .from(syncOperations)
        .where(eq(syncOperations.opId, op.opId))
        .limit(1);
      if (existing) {
        results.push(this.duplicateOrRejected(op.opId, existing, userId));
        continue;
      }

      try {
        const applied = await this.database.db.transaction(async (tx) => {
          const outcome = await applyChange(tx, userId, change);
          const serverSeq = await appendChangeLog(tx, {
            userId,
            opId: op.opId,
            deviceId,
            change,
            serverVersion: outcome.serverVersion,
            conflictId: outcome.conflictId,
          });
          return { outcome, serverSeq };
        });
        results.push({
          opId: op.opId,
          status: applied.outcome.conflictId ? "conflict" : "applied",
          serverSeq: applied.serverSeq,
          serverVersion: applied.outcome.serverVersion,
          ...(applied.outcome.conflictId ? { conflictId: applied.outcome.conflictId } : {}),
        });
      } catch (error) {
        if (violationCode(error) === "23505") {
          const [row] = await this.database.db
            .select()
            .from(syncOperations)
            .where(eq(syncOperations.opId, op.opId))
            .limit(1);
          results.push(
            row
              ? this.duplicateOrRejected(op.opId, row, userId)
              : { opId: op.opId, status: "rejected", reason: "duplicate-op" },
          );
          continue;
        }
        if (error instanceof ChangeRejectedError) {
          results.push({
            opId: op.opId,
            status: "rejected",
            reason: error.code,
          });
          continue;
        }
        throw error;
      }
    }

    return { results, cursor: await currentCursor(this.database.db, userId) };
  }

  async pull(userId: string, cursor: number, limit: number): Promise<PullResult> {
    const rows = await this.database.db
      .select()
      .from(syncOperations)
      .where(and(eq(syncOperations.userId, userId), gt(syncOperations.serverSeq, cursor)))
      .orderBy(asc(syncOperations.serverSeq))
      .limit(limit);

    const changes: ChangeEnvelope[] = rows.map((row) => ({
      serverSeq: Number(row.serverSeq),
      entity: row.entity,
      entityId: row.entityId,
      op: row.op,
      payload: row.payload,
      hlc: row.hlc,
      serverVersion: row.serverVersion,
      tombstone: row.op === "delete",
    }));

    const last = rows.at(-1);
    return {
      changes,
      cursor: last ? String(last.serverSeq) : String(cursor),
      hasMore: rows.length === limit,
    };
  }

  private duplicateOrRejected(
    opId: string,
    row: typeof syncOperations.$inferSelect,
    userId: string,
  ): PushResult {
    if (row.userId !== userId) {
      return { opId, status: "rejected", reason: "op-id-conflict" };
    }
    return {
      opId,
      status: "duplicate",
      serverSeq: Number(row.serverSeq),
      serverVersion: row.serverVersion,
    };
  }
}
