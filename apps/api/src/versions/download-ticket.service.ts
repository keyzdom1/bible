import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { and, count, eq, ne } from "drizzle-orm";
import { checkDownloadAllowed } from "@holyword/core";
import { devices, entitlements, versionInstalls } from "@holyword/db";
import { ApiError } from "../common/api-error";
import { APP_CONFIG, type AppConfig } from "../config";
import { ContentService } from "../content/content.service";
import { PackageDeliveryService } from "../content/delivery.service";
import { DatabaseService } from "../database/database.service";

export type DevicePlatform = "web" | "ios" | "android";

export interface DownloadTicketInput {
  readonly deviceId: string;
  readonly platform?: DevicePlatform;
  /** Viewer country supplied by CloudFront (`CloudFront-Viewer-Country`). */
  readonly region?: string;
}

export interface DownloadTicketDto {
  readonly url: string;
  readonly manifestUrl: string;
  readonly expiresAt: string;
  readonly packageVersion: number;
  readonly checksum: string;
}

@Injectable()
export class DownloadTicketService {
  constructor(
    private readonly database: DatabaseService,
    private readonly content: ContentService,
    private readonly delivery: PackageDeliveryService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async issue(
    userId: string,
    versionId: string,
    input: DownloadTicketInput,
  ): Promise<DownloadTicketDto> {
    const version = await this.content.getVersionRow(versionId);
    if (!version) throw ApiError.notFound(`Bible version "${versionId}" was not found`);

    const now = new Date();
    const [entitlement] = await this.database.db
      .select({ id: entitlements.id, expiresAt: entitlements.expiresAt })
      .from(entitlements)
      .where(
        and(
          eq(entitlements.userId, userId),
          eq(entitlements.versionId, versionId),
          eq(entitlements.kind, "offline"),
        ),
      )
      .limit(1);
    const hasEntitlement =
      entitlement !== undefined && (entitlement.expiresAt === null || entitlement.expiresAt > now);

    await this.database.db
      .insert(devices)
      .values({
        id: input.deviceId,
        userId,
        platform: input.platform ?? "web",
        lastSeenAt: now,
      })
      .onConflictDoNothing({ target: devices.id });
    const [device] = await this.database.db
      .select({ id: devices.id, userId: devices.userId })
      .from(devices)
      .where(eq(devices.id, input.deviceId))
      .limit(1);
    if (!device || device.userId !== userId) {
      throw ApiError.forbidden("device-not-owned", "This device is registered to another account");
    }
    await this.database.db
      .update(devices)
      .set({ lastSeenAt: now })
      .where(eq(devices.id, input.deviceId));

    const [installs] = await this.database.db
      .select({ value: count() })
      .from(versionInstalls)
      .where(
        and(
          eq(versionInstalls.userId, userId),
          eq(versionInstalls.versionId, versionId),
          ne(versionInstalls.deviceId, input.deviceId),
        ),
      );

    const decision = checkDownloadAllowed(
      {
        enabled: this.content.isVersionEnabled(version),
        licenceStatus: version.licenceStatus,
        policy: version.policy,
      },
      {
        hasEntitlement,
        activeDeviceCount: Number(installs?.value ?? 0),
        region: input.region?.toUpperCase() ?? null,
      },
    );
    if (!decision.allowed) {
      throw new ApiError(HttpStatus.FORBIDDEN, decision.reason, decision.message);
    }

    const { manifest, checksum } = await this.content.manifestFor(versionId);
    const expiresAt = new Date(now.getTime() + this.config.downloadTokenTtlSeconds * 1000);
    const urls = await this.delivery.issue(userId, versionId, manifest.versionCode, expiresAt);

    await this.database.db
      .insert(versionInstalls)
      .values({ userId, deviceId: input.deviceId, versionId, lastSeenAt: now })
      .onConflictDoUpdate({
        target: [versionInstalls.userId, versionInstalls.versionId, versionInstalls.deviceId],
        set: { lastSeenAt: now },
      });

    return {
      url: urls.url,
      manifestUrl: urls.manifestUrl,
      expiresAt: expiresAt.toISOString(),
      packageVersion: manifest.versionCode,
      checksum,
    };
  }
}
