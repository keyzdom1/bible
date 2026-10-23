import { createPrivateKey, sign, type KeyObject } from "node:crypto";

export interface CloudFrontSignerOptions {
  readonly baseUrl: string;
  readonly keyPairId: string;
  readonly privateKeyPem: string;
}

export class CloudFrontSigner {
  private readonly baseUrl: string;
  private readonly keyPairId: string;
  private readonly key: KeyObject;

  constructor(options: CloudFrontSignerOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.keyPairId = options.keyPairId;
    this.key = createPrivateKey(options.privateKeyPem);
  }

  /**
   * Produces a CloudFront custom-policy signed URL. The returned URL authorises
   * exactly one object until the supplied expiry, which is why callers must only
   * issue it after the API has checked licence, entitlement and device limits.
   */
  sign(resourcePath: string, expiresAt: Date): string {
    const resource = `${this.baseUrl}/${resourcePath.replace(/^\/+/, "")}`;
    const expires = Math.floor(expiresAt.getTime() / 1000);
    const policy = JSON.stringify({
      Statement: [
        {
          Resource: resource,
          Condition: { DateLessThan: { "AWS:EpochTime": expires } },
        },
      ],
    });
    const encodedPolicy = cloudFrontBase64(Buffer.from(policy, "utf8"));
    const signature = cloudFrontBase64(sign("RSA-SHA1", Buffer.from(policy), this.key));
    const url = new URL(resource);
    url.searchParams.set("Policy", encodedPolicy);
    url.searchParams.set("Signature", signature);
    url.searchParams.set("Key-Pair-Id", this.keyPairId);
    return url.toString();
  }
}

/** CloudFront uses an RFC-4648-like alphabet with `-`, `_` and `~`. */
export function cloudFrontBase64(value: Uint8Array): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/=/g, "_")
    .replace(/\//g, "~");
}

export function decodeCloudFrontBase64(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "=").replace(/~/g, "/"), "base64");
}
