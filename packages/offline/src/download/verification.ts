import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import {
  isVerseId,
  packageManifestSchema,
  packageVerseSchema,
  versificationMapSchema,
  type PackageManifest,
  type PackageVerse,
  type VersificationMap,
} from "@holyword/core";
import { unzipSync } from "fflate";

export type PackageVerificationCode =
  | "invalid-archive"
  | "manifest-missing"
  | "manifest-checksum"
  | "manifest-invalid"
  | "version-mismatch"
  | "licence-denied"
  | "encryption-unsupported"
  | "versification-invalid"
  | "book-missing"
  | "book-checksum"
  | "book-invalid"
  | "totals-mismatch"
  | "extra-file";

export class PackageVerificationError extends Error {
  constructor(
    readonly code: PackageVerificationCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "PackageVerificationError";
  }
}

export interface ExpectedPackage {
  readonly versionId: string;
  readonly versionCode?: number;
  /** SHA-256 of the raw `manifest.json` bytes returned by the ticket endpoint. */
  readonly checksum: string;
}

export interface VerifiedPackage {
  readonly manifest: PackageManifest;
  readonly manifest_sha256: string;
  readonly versification: VersificationMap;
  readonly verses: readonly PackageVerse[];
  readonly bytes: number;
}

export function sha256Hex(bytes: Uint8Array): string {
  return bytesToHex(sha256(bytes));
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function parseJson(bytes: Uint8Array, description: string): unknown {
  try {
    return JSON.parse(decode(bytes));
  } catch (error) {
    throw new PackageVerificationError("manifest-invalid", `${description} is not valid JSON`, {
      cause: error,
    });
  }
}

function parseVersification(bytes: Uint8Array): VersificationMap {
  try {
    return versificationMapSchema.parse(parseJson(bytes, "versification.json"));
  } catch (error) {
    if (error instanceof PackageVerificationError) throw error;
    throw new PackageVerificationError(
      "versification-invalid",
      "versification.json does not match the package schema",
      { cause: error },
    );
  }
}

function parseBook(bytes: Uint8Array, entry: PackageManifest["books"][number]): PackageVerse[] {
  const verses: PackageVerse[] = [];
  const ids = new Set<string>();
  const chapters = new Set<number>();
  let lineNumber = 0;

  for (const line of decode(bytes).split(/\r?\n/)) {
    lineNumber += 1;
    if (!line.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      throw new PackageVerificationError(
        "book-invalid",
        `${entry.file} line ${lineNumber} is not valid JSON`,
        { cause: error },
      );
    }
    const verse = packageVerseSchema.parse(parsed);
    if (verse.book !== entry.code) {
      throw new PackageVerificationError(
        "book-invalid",
        `${entry.file} contains a verse for ${verse.book}`,
      );
    }
    if (!isVerseId(verse.id) || verse.id !== `${verse.book}.${verse.chapter}.${verse.verse}`) {
      throw new PackageVerificationError(
        "book-invalid",
        `${entry.file} contains an invalid verse id "${verse.id}"`,
      );
    }
    if (ids.has(verse.id)) {
      throw new PackageVerificationError(
        "book-invalid",
        `${entry.file} contains duplicate verse ${verse.id}`,
      );
    }
    ids.add(verse.id);
    chapters.add(verse.chapter);
    verses.push(verse);
  }

  if (verses.length !== entry.verses || chapters.size !== entry.chapters) {
    throw new PackageVerificationError(
      "totals-mismatch",
      `${entry.code} has ${verses.length} verses in ${chapters.size} chapters; manifest expects ${entry.verses} in ${entry.chapters}`,
    );
  }
  return verses;
}

/**
 * Verifies an immutable package archive before anything is written to local
 * storage: ticket checksum, manifest, licence, versification and every book hash.
 */
export function verifyPackageArchive(
  archive: Uint8Array,
  expected: ExpectedPackage,
): VerifiedPackage {
  if (archive.byteLength === 0) {
    throw new PackageVerificationError("invalid-archive", "The package archive is empty");
  }

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(archive);
  } catch (error) {
    throw new PackageVerificationError("invalid-archive", "The package is not a valid ZIP", {
      cause: error,
    });
  }

  const manifestBytes = files["manifest.json"];
  if (!manifestBytes) {
    throw new PackageVerificationError(
      "manifest-missing",
      "The package does not contain manifest.json",
    );
  }
  const manifestSha = sha256Hex(manifestBytes);
  if (manifestSha !== expected.checksum.toLowerCase()) {
    throw new PackageVerificationError(
      "manifest-checksum",
      "The package manifest does not match the checksum in the download ticket",
    );
  }

  let manifest: PackageManifest;
  try {
    manifest = packageManifestSchema.parse(parseJson(manifestBytes, "manifest.json"));
  } catch (error) {
    if (error instanceof PackageVerificationError) throw error;
    throw new PackageVerificationError(
      "manifest-invalid",
      "manifest.json does not match the package schema",
      { cause: error },
    );
  }

  if (manifest.versionId !== expected.versionId) {
    throw new PackageVerificationError(
      "version-mismatch",
      `The package is ${manifest.versionId}, not ${expected.versionId}`,
    );
  }
  if (expected.versionCode !== undefined && manifest.versionCode !== expected.versionCode) {
    throw new PackageVerificationError(
      "version-mismatch",
      `The package version is ${manifest.versionCode}, not ${expected.versionCode}`,
    );
  }
  if (manifest.licence.status === "unlicensed" || !manifest.licence.offlineDownload) {
    throw new PackageVerificationError(
      "licence-denied",
      "The package licence does not permit offline download",
    );
  }
  if (manifest.licence.encryption !== "none") {
    throw new PackageVerificationError(
      "encryption-unsupported",
      "This build cannot open encrypted packages",
    );
  }

  const versificationFile = manifest.versification?.file ?? "versification.json";
  const versificationBytes = files[versificationFile];
  if (!versificationBytes) {
    throw new PackageVerificationError(
      "book-missing",
      `The package does not contain ${versificationFile}`,
    );
  }
  if (manifest.versification) {
    if (versificationBytes.byteLength !== manifest.versification.bytes) {
      throw new PackageVerificationError(
        "book-checksum",
        `${versificationFile} has an unexpected size`,
      );
    }
    if (sha256Hex(versificationBytes) !== manifest.versification.sha256) {
      throw new PackageVerificationError(
        "book-checksum",
        `${versificationFile} failed its SHA-256 check`,
      );
    }
  }
  const versification = parseVersification(versificationBytes);

  const allowed = new Set([
    "manifest.json",
    versificationFile,
    ...manifest.books.map((book) => book.file),
  ]);
  for (const name of Object.keys(files)) {
    if (!allowed.has(name)) {
      throw new PackageVerificationError(
        "extra-file",
        `The package contains an unexpected file: ${name}`,
      );
    }
  }

  const verses: PackageVerse[] = [];
  let chapterTotal = 0;
  for (const entry of manifest.books) {
    const bytes = files[entry.file];
    if (!bytes) {
      throw new PackageVerificationError(
        "book-missing",
        `The package does not contain ${entry.file}`,
      );
    }
    if (bytes.byteLength !== entry.bytes) {
      throw new PackageVerificationError(
        "book-checksum",
        `${entry.file} has ${bytes.byteLength} bytes; manifest expects ${entry.bytes}`,
      );
    }
    if (sha256Hex(bytes) !== entry.sha256) {
      throw new PackageVerificationError("book-checksum", `${entry.file} failed its SHA-256 check`);
    }
    const bookVerses = parseBook(bytes, entry);
    chapterTotal += entry.chapters;
    verses.push(...bookVerses);
  }

  if (
    manifest.totals.books !== manifest.books.length ||
    manifest.totals.chapters !== chapterTotal ||
    manifest.totals.verses !== verses.length
  ) {
    throw new PackageVerificationError(
      "totals-mismatch",
      "The manifest totals do not match the verified package contents",
    );
  }

  return {
    manifest,
    manifest_sha256: manifestSha,
    versification,
    verses,
    bytes: archive.byteLength,
  };
}

/** Fast check used by the download manager before the installer runs. */
export function verifyManifestChecksum(archive: Uint8Array, checksum: string): PackageManifest {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(archive);
  } catch (error) {
    throw new PackageVerificationError("invalid-archive", "The package is not a valid ZIP", {
      cause: error,
    });
  }
  const manifestBytes = files["manifest.json"];
  if (!manifestBytes) {
    throw new PackageVerificationError(
      "manifest-missing",
      "The package does not contain manifest.json",
    );
  }
  if (sha256Hex(manifestBytes) !== checksum.toLowerCase()) {
    throw new PackageVerificationError(
      "manifest-checksum",
      "The package manifest does not match the download ticket",
    );
  }
  try {
    return packageManifestSchema.parse(parseJson(manifestBytes, "manifest.json"));
  } catch (error) {
    if (error instanceof PackageVerificationError) throw error;
    throw new PackageVerificationError(
      "manifest-invalid",
      "manifest.json does not match the package schema",
      { cause: error },
    );
  }
}
