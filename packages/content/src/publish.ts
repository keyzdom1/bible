import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { PackageManifest } from "@holyword/core";
import { buildArchive, verifyPackage } from "./package-builder";
import { ContentToolError } from "./types";

export interface PublishTarget {
  readonly bucket: string;
  readonly region: string;
  readonly prefix?: string;
}

export interface S3PutClient {
  send(command: unknown): Promise<unknown>;
}

export interface PublishedObject {
  readonly key: string;
  readonly bytes: number;
  readonly contentType: string;
}

function packagePrefix(target: PublishTarget): string {
  const prefix = (target.prefix ?? "packages").replace(/^\/+|\/+$/g, "");
  return prefix ? `${prefix}/` : "";
}

function contentLength(bytes: Uint8Array): number {
  return bytes.byteLength;
}

/**
 * Publishing is the last point at which an operator can accidentally expose a
 * translation that is not cleared for distribution. Keep this gate deliberately
 * conservative: unlicensed and offline-disabled versions never reach S3.
 */
function assertPublishable(manifest: PackageManifest): void {
  if (manifest.licence.status === "unlicensed") {
    throw new ContentToolError(
      "unlicensed-package",
      "Refusing to publish a package whose licence status is unlicensed",
    );
  }
  if (!manifest.licence.offlineDownload) {
    throw new ContentToolError(
      "offline-not-permitted",
      "Refusing to publish an offline package whose licence forbids offline downloads",
    );
  }
  if (manifest.licence.encryption !== "none") {
    throw new ContentToolError(
      "encryption-not-implemented",
      "Encrypted packages require the licensed key-delivery flow; this pipeline version only publishes unencrypted packages",
    );
  }
}

/**
 * Uploads a verified package to a private S3 bucket. Objects are immutable and
 * addressed by version id + version code; CloudFront signs reads separately.
 */
export async function publishPackage(
  packageDirectory: string,
  target: PublishTarget,
  options: { readonly client?: S3PutClient } = {},
): Promise<readonly PublishedObject[]> {
  const verified = await verifyPackage(packageDirectory);
  assertPublishable(verified.manifest);
  const prefix = packagePrefix(target);
  const base = `${prefix}${encodeURIComponent(verified.manifest.versionId)}/${verified.manifest.versionCode}`;
  const client: S3PutClient =
    options.client ?? (new S3Client({ region: target.region }) as unknown as S3PutClient);

  const objects: Array<{
    key: string;
    body: Uint8Array;
    contentType: string;
    cacheControl?: string;
  }> = [];

  for (const book of verified.manifest.books) {
    objects.push({
      key: `${base}/${book.file}`,
      body: await readFile(join(verified.directory, book.file)),
      contentType: "application/x-ndjson; charset=utf-8",
      cacheControl: "public, max-age=31536000, immutable",
    });
  }
  const versificationFile = verified.manifest.versification?.file ?? "versification.json";
  objects.push({
    key: `${base}/${versificationFile}`,
    body: await readFile(join(verified.directory, versificationFile)),
    contentType: "application/json; charset=utf-8",
    cacheControl: "public, max-age=31536000, immutable",
  });
  objects.push({
    key: `${base}/manifest.json`,
    body: verified.manifestBytes,
    contentType: "application/json; charset=utf-8",
    cacheControl: "public, max-age=31536000, immutable",
  });
  const archive = await buildArchive(verified.directory);
  objects.push({
    key: `${base}/package.zip`,
    body: archive,
    contentType: "application/zip",
    cacheControl: "public, max-age=31536000, immutable",
  });

  const published: PublishedObject[] = [];
  for (const object of objects) {
    await client.send(
      new PutObjectCommand({
        Bucket: target.bucket,
        Key: object.key,
        Body: object.body,
        ContentType: object.contentType,
        CacheControl: object.cacheControl,
        ServerSideEncryption: "AES256",
        ContentLength: contentLength(object.body),
      }),
    );
    published.push({
      key: object.key,
      bytes: object.body.byteLength,
      contentType: object.contentType,
    });
  }

  return published;
}

export async function readPackageManifest(directory: string) {
  const verified = await verifyPackage(directory);
  assertPublishable(verified.manifest);
  return verified;
}
