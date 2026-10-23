import { Inject, Injectable } from "@nestjs/common";
import { jwtVerify, SignJWT } from "jose";
import { ApiError } from "../common/api-error";
import { APP_CONFIG, type AppConfig } from "../config";
import { CloudFrontSigner } from "./cloudfront-signer";

export interface DeliveryUrls {
  readonly url: string;
  readonly manifestUrl: string;
}

const TICKET_ISSUER = "holyword-api";
const TICKET_AUDIENCE = "content-download";

@Injectable()
export class PackageDeliveryService {
  private readonly key: Uint8Array;
  private readonly cloudFront: CloudFrontSigner | undefined;
  private readonly localBaseUrl: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.key = new TextEncoder().encode(config.downloadTokenSecret);
    this.localBaseUrl = config.contentBaseUrl;
    this.cloudFront = config.cloudFront
      ? new CloudFrontSigner({
          baseUrl: config.cloudFront.baseUrl,
          keyPairId: config.cloudFront.keyPairId,
          privateKeyPem: config.cloudFront.privateKeyPem,
        })
      : undefined;
  }

  async issue(
    userId: string,
    versionId: string,
    versionCode: number,
    expiresAt: Date,
  ): Promise<DeliveryUrls> {
    if (this.cloudFront) {
      return {
        url: this.cloudFront.sign(
          `packages/${encodeURIComponent(versionId)}/${versionCode}/package.zip`,
          expiresAt,
        ),
        manifestUrl: this.cloudFront.sign(
          `packages/${encodeURIComponent(versionId)}/${versionCode}/manifest.json`,
          expiresAt,
        ),
      };
    }

    const token = await new SignJWT({ versionId, versionCode })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setIssuer(TICKET_ISSUER)
      .setAudience(TICKET_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(this.key);

    const base = `${this.localBaseUrl}/packages/${encodeURIComponent(versionId)}/${versionCode}`;
    const query = `?ticket=${encodeURIComponent(token)}`;
    return {
      url: `${base}/package.zip${query}`,
      manifestUrl: `${base}/manifest.json${query}`,
    };
  }

  async verifyLocalTicket(
    ticket: string | undefined,
    versionId: string,
    versionCode: number,
  ): Promise<void> {
    if (!ticket) {
      throw ApiError.forbidden("invalid-download-ticket", "A download ticket is required");
    }
    try {
      const verified = await jwtVerify(ticket, this.key, {
        algorithms: ["HS256"],
        issuer: TICKET_ISSUER,
        audience: TICKET_AUDIENCE,
      });
      if (
        verified.payload.versionId !== versionId ||
        verified.payload.versionCode !== versionCode
      ) {
        throw new Error("Ticket does not match the requested package");
      }
    } catch {
      throw ApiError.forbidden(
        "invalid-download-ticket",
        "Download ticket is invalid, expired or belongs to another package",
      );
    }
  }
}
