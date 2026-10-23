import { Injectable } from "@nestjs/common";
import { desc, eq } from "drizzle-orm";
import type { LicencePolicy } from "@holyword/core";
import { auditLog, contentVersions } from "@holyword/db";
import { ApiError } from "../common/api-error";
import { ContentService, type VersionDto } from "../content/content.service";
import { DatabaseService } from "../database/database.service";
import type { AuthedUser } from "../auth/auth.types";

export interface AuditEntryDto {
  id: string;
  actorEmail: string | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

@Injectable()
export class AdminService {
  constructor(
    private readonly database: DatabaseService,
    private readonly content: ContentService,
  ) {}

  async enableVersion(
    versionId: string,
    input: {
      versionCode: number;
      packageKey?: string;
      checksum?: string;
      policy: LicencePolicy;
    },
    actor: AuthedUser,
  ): Promise<VersionDto> {
    const [row] = await this.database.db
      .select()
      .from(contentVersions)
      .where(eq(contentVersions.versionId, versionId))
      .limit(1);
    if (!row) throw ApiError.notFound(`Bible version "${versionId}" was not found`);
    if (input.policy.status === "unlicensed") {
      throw ApiError.badRequest(
        "unlicensed-version",
        "A version cannot be enabled while its licence is unlicensed",
      );
    }
    const now = new Date();
    const [updated] = await this.database.db
      .update(contentVersions)
      .set({
        versionCode: input.versionCode,
        enabled: true,
        licenceStatus: input.policy.status,
        policy: input.policy,
        packageKey: input.packageKey ?? row.packageKey,
        checksum: input.checksum ?? row.checksum,
        enabledAt: now,
        enabledBy: actor.email,
        updatedAt: now,
      })
      .where(eq(contentVersions.versionId, versionId))
      .returning();
    if (!updated) throw ApiError.notFound(`Bible version "${versionId}" was not found`);
    await this.audit(actor, "version.enabled", versionId, {
      versionCode: input.versionCode,
      licenceStatus: input.policy.status,
      packageKey: input.packageKey ?? row.packageKey,
    });
    return this.content.toDto(updated);
  }

  async disableVersion(versionId: string, actor: AuthedUser): Promise<VersionDto> {
    const [row] = await this.database.db
      .select()
      .from(contentVersions)
      .where(eq(contentVersions.versionId, versionId))
      .limit(1);
    if (!row) throw ApiError.notFound(`Bible version "${versionId}" was not found`);
    const [updated] = await this.database.db
      .update(contentVersions)
      .set({ enabled: false, updatedAt: new Date() })
      .where(eq(contentVersions.versionId, versionId))
      .returning();
    if (!updated) throw ApiError.notFound(`Bible version "${versionId}" was not found`);
    await this.audit(actor, "version.disabled", versionId, {
      previousLicenceStatus: row.licenceStatus,
    });
    return this.content.toDto(updated);
  }

  async listAuditLog(limit: number): Promise<AuditEntryDto[]> {
    const rows = await this.database.db
      .select()
      .from(auditLog)
      .orderBy(desc(auditLog.createdAt))
      .limit(limit);
    return rows.map((row) => ({
      id: row.id,
      actorEmail: row.actorEmail,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      metadata: row.metadata ?? null,
      createdAt: row.createdAt,
    }));
  }

  private async audit(
    actor: AuthedUser,
    action: string,
    targetId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.database.db.insert(auditLog).values({
      actorId: actor.id,
      actorEmail: actor.email,
      action,
      targetType: "content_version",
      targetId,
      metadata,
    });
  }
}
