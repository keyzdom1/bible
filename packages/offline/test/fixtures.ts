import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import {
  packageManifestSchema,
  type PackageManifest,
  type PackageVerse,
  type VersificationMap,
} from "@holyword/core";
import { strToU8, zipSync } from "fflate";
import type {
  DownloadCheckpoint,
  DownloadChunk,
  DownloadStore,
  InstallableContent,
} from "../src/types";

export const TEST_VERSES: readonly PackageVerse[] = [
  {
    id: "GEN.1.1",
    book: "GEN",
    chapter: 1,
    verse: 1,
    text: "In the beginning God created the heaven and the earth.",
  },
  {
    id: "GEN.1.2",
    book: "GEN",
    chapter: 1,
    verse: 2,
    text: "And the earth was without form, and void.",
  },
  {
    id: "GEN.1.3",
    book: "GEN",
    chapter: 1,
    verse: 3,
    text: "And God said, Let there be light: and there was light.",
  },
  {
    id: "JHN.3.16",
    book: "JHN",
    chapter: 3,
    verse: 16,
    text: "For God so loved the world, that he gave his only begotten Son.",
  },
  {
    id: "JHN.3.17",
    book: "JHN",
    chapter: 3,
    verse: 17,
    text: "For God sent not his Son into the world to condemn the world.",
  },
  {
    id: "JHN.3.18",
    book: "JHN",
    chapter: 3,
    verse: 18,
    text: "He that believeth on him is not condemned.",
  },
];

export interface TestPackage {
  readonly archive: Uint8Array;
  readonly manifest: PackageManifest;
  readonly checksum: string;
  readonly files: Record<string, Uint8Array>;
}

function ndjson(verses: readonly PackageVerse[]): string {
  return `${verses.map((verse) => JSON.stringify(verse)).join("\n")}\n`;
}

export function buildTestPackage(
  options: {
    readonly versionId?: string;
    readonly versionCode?: number;
    readonly verses?: readonly PackageVerse[];
    readonly offlineDownload?: boolean;
    readonly encryption?: "none" | "aes-256-gcm";
    readonly extraFiles?: Record<string, Uint8Array>;
  } = {},
): TestPackage {
  const versionId = options.versionId ?? "test";
  const versionCode = options.versionCode ?? 1;
  const verses = options.verses ?? TEST_VERSES;
  const byBook = new Map<string, PackageVerse[]>();
  for (const verse of verses) {
    const group = byBook.get(verse.book) ?? [];
    group.push(verse);
    byBook.set(verse.book, group);
  }
  const files: Record<string, Uint8Array> = {};
  const books: PackageManifest["books"] = [];
  for (const [code, bookVerses] of byBook) {
    const chapters = new Set(bookVerses.map((verse) => verse.chapter)).size;
    const bytes = strToU8(ndjson(bookVerses));
    const file = `books/${code}.ndjson`;
    files[file] = bytes;
    books.push({
      code: code as PackageManifest["books"][number]["code"],
      name: code,
      chapters,
      verses: bookVerses.length,
      file,
      bytes: bytes.byteLength,
      sha256: bytesToHex(sha256(bytes)),
    });
  }

  const versification: VersificationMap = {
    schemaVersion: 1,
    id: versionId,
    baseVersionId: versionId,
    description: "Test versification",
    books: {
      GEN: [3],
      JHN: [0, 0, 3],
    },
    crossVersion: [],
  };
  const versificationBytes = strToU8(JSON.stringify(versification));
  files["versification.json"] = versificationBytes;

  const manifest: PackageManifest = packageManifestSchema.parse({
    schemaVersion: 1,
    versionId,
    versionCode,
    name: "Test Version",
    abbreviation: "TST",
    language: "en",
    languageName: "English",
    direction: "ltr",
    licence: {
      status: "public-domain",
      offlineDownload: options.offlineDownload ?? true,
      maxDevices: null,
      maxVersesPerCopy: null,
      maxVersesPerShare: null,
      encryption: options.encryption ?? "none",
      regions: null,
      copyright: "Public domain test fixture.",
      attribution: "Test Version",
      licenceNote: "Synthetic package used by unit tests.",
    },
    versificationId: versionId,
    versification: {
      file: "versification.json",
      bytes: versificationBytes.byteLength,
      sha256: bytesToHex(sha256(versificationBytes)),
    },
    books,
    totals: {
      books: books.length,
      chapters: books.reduce((total, book) => total + book.chapters, 0),
      verses: verses.length,
    },
    builtAt: "2026-01-01T00:00:00.000Z",
    builderVersion: "test",
    source: {
      name: "Test",
      licenceNote: "Public domain test fixture.",
    },
  });

  const manifestBytes = strToU8(JSON.stringify(manifest, null, 2));
  files["manifest.json"] = manifestBytes;
  Object.assign(files, options.extraFiles ?? {});
  return {
    archive: zipSync(files),
    manifest,
    checksum: bytesToHex(sha256(manifestBytes)),
    files,
  };
}

export function installableFrom(
  pkg: TestPackage,
  installedAt = "2026-01-01T00:00:00.000Z",
): InstallableContent {
  return {
    manifest: pkg.manifest,
    manifest_sha256: pkg.checksum,
    versification: {
      schemaVersion: 1,
      id: pkg.manifest.versionId,
      baseVersionId: pkg.manifest.versionId,
      description: "Test versification",
      books: { GEN: [3], JHN: [0, 0, 3] },
      crossVersion: [],
    },
    verses: TEST_VERSES,
    archive_bytes: pkg.archive.byteLength,
    installed_at: installedAt,
  };
}

/** In-memory checkpoint/chunk persistence used only by download-manager tests. */
export class MemoryDownloadStore implements DownloadStore {
  readonly checkpoints = new Map<string, DownloadCheckpoint>();
  readonly chunks = new Map<string, Map<number, Uint8Array>>();

  async getDownload(versionId: string): Promise<DownloadCheckpoint | undefined> {
    return this.checkpoints.get(versionId);
  }

  async putDownload(checkpoint: DownloadCheckpoint): Promise<void> {
    this.checkpoints.set(checkpoint.version_id, checkpoint);
  }

  async deleteDownload(versionId: string): Promise<void> {
    this.checkpoints.delete(versionId);
  }

  async listChunks(versionId: string): Promise<DownloadChunk[]> {
    const entries = [...(this.chunks.get(versionId)?.entries() ?? [])]
      .sort(([a], [b]) => a - b)
      .map(([offset, bytes]) => ({ version_id: versionId, offset, bytes }));
    return entries;
  }

  async putChunk(chunk: DownloadChunk): Promise<void> {
    const map = this.chunks.get(chunk.version_id) ?? new Map<number, Uint8Array>();
    map.set(chunk.offset, chunk.bytes);
    this.chunks.set(chunk.version_id, map);
  }

  async deleteChunks(versionId: string): Promise<void> {
    this.chunks.delete(versionId);
  }
}
