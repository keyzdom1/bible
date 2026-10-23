import { Controller, Get, Param, Query, Req, Res, StreamableFile } from "@nestjs/common";
import type { Request, Response } from "express";
import { Public } from "../auth/public.decorator";
import { ApiError } from "../common/api-error";
import { ContentService } from "./content.service";
import { PackageDeliveryService } from "./delivery.service";

interface ByteRange {
  readonly start: number;
  readonly end: number;
}

/**
 * Parses one HTTP byte range. Multi-range requests are rejected because package
 * downloads only resume from a single contiguous offset.
 */
function parseByteRange(raw: string | undefined, total: number): ByteRange | null {
  if (!raw) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(raw.trim());
  if (!match) return null;
  const [, rawStart = "", rawEnd = ""] = match;
  if (rawStart === "" && rawEnd === "") return null;

  let start: number;
  let end: number;
  if (rawStart === "") {
    const suffix = Number(rawEnd);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    start = Math.max(0, total - suffix);
    end = total - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? total - 1 : Number(rawEnd);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start) return null;
    end = Math.min(end, total - 1);
  }
  if (total === 0 || start >= total) return null;
  return { start, end };
}

function parseVersionCode(raw: string): number {
  if (!/^\d+$/.test(raw)) {
    throw ApiError.badRequest("invalid-version-code", "versionCode must be a positive integer");
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw ApiError.badRequest("invalid-version-code", "versionCode must be a positive integer");
  }
  return value;
}

/**
 * Local mirror of the private CloudFront objects. The route is public at the HTTP
 * layer because the short-lived signed ticket in the query string is the credential;
 * no package is served without a ticket issued after licence and device checks.
 */
@Controller("v1/content/packages")
@Public()
export class ContentDeliveryController {
  constructor(
    private readonly content: ContentService,
    private readonly delivery: PackageDeliveryService,
  ) {}

  @Get(":versionId/:versionCode/package.zip")
  async downloadPackage(
    @Param("versionId") versionId: string,
    @Param("versionCode") rawVersionCode: string,
    @Query("ticket") ticket: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const versionCode = parseVersionCode(rawVersionCode);
    await this.delivery.verifyLocalTicket(ticket, versionId, versionCode);
    const archive = await this.content.archiveFor(versionId, versionCode);
    const total = archive.byteLength;
    response.setHeader("Content-Type", "application/zip");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${versionId}-${versionCode}.zip"`,
    );
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("Accept-Ranges", "bytes");

    const range = parseByteRange(request.headers.range, total);
    if (request.headers.range && !range) {
      response.status(416);
      response.setHeader("Content-Range", `bytes */${total}`);
      response.setHeader("Content-Length", "0");
      return new StreamableFile(new Uint8Array(0));
    }
    if (range) {
      const bytes = archive.subarray(range.start, range.end + 1);
      response.status(206);
      response.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${total}`);
      response.setHeader("Content-Length", String(bytes.byteLength));
      return new StreamableFile(bytes);
    }

    response.setHeader("Content-Length", String(total));
    return new StreamableFile(archive);
  }

  @Get(":versionId/:versionCode/manifest.json")
  async downloadManifest(
    @Param("versionId") versionId: string,
    @Param("versionCode") rawVersionCode: string,
    @Query("ticket") ticket: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const versionCode = parseVersionCode(rawVersionCode);
    await this.delivery.verifyLocalTicket(ticket, versionId, versionCode);
    const manifest = await this.content.manifestFileFor(versionId, versionCode);
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Content-Length", String(manifest.bytes.byteLength));
    response.setHeader("X-Checksum-Sha256", manifest.checksum);
    response.setHeader("Cache-Control", "private, no-store");
    return new StreamableFile(manifest.bytes);
  }
}
