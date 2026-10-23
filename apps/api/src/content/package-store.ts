import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import {
  packageManifestSchema,
  packageVerseSchema,
  type PackageBook,
  type PackageManifest,
  type PackageVerse,
} from "@holyword/core";
import { zipSync } from "fflate";

export class PackageUnavailableError extends Error {
  constructor(versionId: string) {
    super(`No content package is published for version "${versionId}"`);
    this.name = "PackageUnavailableError";
  }
}

export class PackageIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PackageIntegrityError";
  }
}

interface PackageHandle {
  readonly directory: string;
  readonly manifest: PackageManifest;
  readonly manifestChecksum: string;
  readonly rawManifest: Buffer;
}

interface BookCache {
  readonly verses: readonly PackageVerse[];
  readonly byChapter: ReadonlyMap<number, readonly PackageVerse[]>;
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}

async function readManifestFile(directory: string): Promise<PackageHandle> {
  const file = join(directory, "manifest.json");
  let raw: Buffer;
  try {
    raw = await readFile(file);
  } catch (error) {
    if (isMissing(error)) throw new PackageUnavailableError(directory);
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new PackageIntegrityError(`Package manifest at ${file} is not valid JSON`);
  }
  const manifest = packageManifestSchema.parse(parsed);
  return {
    directory,
    manifest,
    manifestChecksum: createHash("sha256").update(raw).digest("hex"),
    rawManifest: raw,
  };
}

function safePackagePath(directory: string, file: string): string {
  const root = resolve(directory);
  const target = resolve(root, file);
  if (!target.startsWith(`${root}${sep}`)) {
    throw new PackageIntegrityError(`Package path escapes its directory: ${file}`);
  }
  return target;
}

/**
 * Reads immutable content packages from disk. Each package directory contains a
 * `manifest.json`, a checksummed versification file and one NDJSON file per book.
 *
 * Production packages are published to S3/CloudFront by the content pipeline; this
 * store is the local mirror used by development, tests and the local delivery route.
 */
export class PackageStore {
  private readonly manifests = new Map<string, Promise<PackageHandle>>();
  private readonly books = new Map<string, Promise<BookCache>>();
  private readonly archives = new Map<string, Promise<Buffer>>();
  private scanned = false;
  private readonly directories = new Map<string, string>();

  constructor(private readonly root: string) {}

  async manifestFor(versionId: string): Promise<{
    manifest: PackageManifest;
    checksum: string;
  }> {
    const handle = await this.handleFor(versionId);
    return { manifest: handle.manifest, checksum: handle.manifestChecksum };
  }

  async manifestFile(
    versionId: string,
    versionCode: number,
  ): Promise<{ bytes: Buffer; checksum: string }> {
    const handle = await this.handleFor(versionId);
    if (handle.manifest.versionCode !== versionCode) {
      throw new PackageUnavailableError(`${versionId}/${versionCode}`);
    }
    return { bytes: handle.rawManifest, checksum: handle.manifestChecksum };
  }

  async archiveFor(versionId: string, versionCode: number): Promise<Buffer> {
    const key = `${versionId}:${versionCode}`;
    let pending = this.archives.get(key);
    if (!pending) {
      pending = this.buildArchive(versionId, versionCode);
      this.archives.set(key, pending);
    }
    try {
      return await pending;
    } catch (error) {
      this.archives.delete(key);
      throw error;
    }
  }

  async readChapter(versionId: string, book: string, chapter: number): Promise<PackageVerse[]> {
    const cache = await this.bookFor(versionId, book);
    return [...(cache.byChapter.get(chapter) ?? [])];
  }

  async readBook(versionId: string, book: string): Promise<readonly PackageVerse[]> {
    const cache = await this.bookFor(versionId, book);
    return cache.verses;
  }

  async search(versionId: string, query: string, limit: number): Promise<PackageVerse[]> {
    const handle = await this.handleFor(versionId);
    const needle = query.toLocaleLowerCase();
    const hits: PackageVerse[] = [];
    for (const book of handle.manifest.books) {
      const cache = await this.bookFor(versionId, book.code);
      for (const verse of cache.verses) {
        if (verse.text.toLocaleLowerCase().includes(needle)) {
          hits.push(verse);
          if (hits.length >= limit) return hits;
        }
      }
    }
    return hits;
  }

  private async buildArchive(versionId: string, versionCode: number): Promise<Buffer> {
    const handle = await this.handleFor(versionId);
    if (handle.manifest.versionCode !== versionCode) {
      throw new PackageUnavailableError(`${versionId}/${versionCode}`);
    }

    const files: Record<string, Uint8Array> = {
      "manifest.json": handle.rawManifest,
    };
    if (handle.manifest.versification) {
      const descriptor = handle.manifest.versification;
      const bytes = await readFile(safePackagePath(handle.directory, descriptor.file));
      if (bytes.byteLength !== descriptor.bytes) {
        throw new PackageIntegrityError(
          `${descriptor.file} has ${bytes.byteLength} bytes; manifest expects ${descriptor.bytes}`,
        );
      }
      if (createHash("sha256").update(bytes).digest("hex") !== descriptor.sha256) {
        throw new PackageIntegrityError(`${descriptor.file} failed its SHA-256 check`);
      }
      files[descriptor.file] = bytes;
    } else {
      try {
        files["versification.json"] = await readFile(join(handle.directory, "versification.json"));
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
    }

    for (const book of handle.manifest.books) {
      files[book.file] = await this.readVerifiedBookBytes(handle, book);
    }
    return Buffer.from(zipSync(files, { level: 6, mtime: "1980-01-01T00:00:00Z" }));
  }

  private async handleFor(versionId: string): Promise<PackageHandle> {
    let pending = this.manifests.get(versionId);
    if (!pending) {
      pending = this.locate(versionId);
      this.manifests.set(versionId, pending);
    }
    try {
      return await pending;
    } catch (error) {
      this.manifests.delete(versionId);
      throw error;
    }
  }

  private async locate(versionId: string): Promise<PackageHandle> {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(versionId)) {
      throw new PackageUnavailableError(versionId);
    }

    const direct = await this.readIfMatches(this.root, versionId);
    if (direct) return direct;

    const nested = await this.readIfMatches(join(this.root, versionId), versionId);
    if (nested) return nested;

    if (!this.scanned) {
      this.scanned = true;
      await this.scanRoot();
    }
    const directory = this.directories.get(versionId);
    if (!directory) throw new PackageUnavailableError(versionId);
    return this.readIfMatches(directory, versionId).then((handle) => {
      if (!handle) throw new PackageUnavailableError(versionId);
      return handle;
    });
  }

  private async scanRoot(): Promise<void> {
    const scan = async (directory: string, depth: number): Promise<void> => {
      let entries;
      try {
        entries = await readdir(directory, { withFileTypes: true });
      } catch (error) {
        if (isMissing(error)) return;
        throw error;
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const child = join(directory, entry.name);
        try {
          const handle = await readManifestFile(child);
          this.directories.set(handle.manifest.versionId, child);
        } catch {
          if (depth > 0) await scan(child, depth - 1);
        }
      }
    };
    // `root/{versionId}` and `root/{versionId}/{versionCode}` are both supported.
    await scan(this.root, 1);
  }

  private async readIfMatches(
    directory: string,
    versionId: string,
  ): Promise<PackageHandle | undefined> {
    try {
      const handle = await readManifestFile(directory);
      if (handle.manifest.versionId !== versionId) return undefined;
      return handle;
    } catch (error) {
      if (error instanceof PackageUnavailableError) return undefined;
      throw error;
    }
  }

  private async bookFor(versionId: string, book: string): Promise<BookCache> {
    const key = `${versionId}:${book}`;
    let pending = this.books.get(key);
    if (!pending) {
      pending = this.loadBook(versionId, book);
      this.books.set(key, pending);
    }
    try {
      return await pending;
    } catch (error) {
      this.books.delete(key);
      throw error;
    }
  }

  private async loadBook(versionId: string, book: string): Promise<BookCache> {
    const handle = await this.handleFor(versionId);
    const entry = handle.manifest.books.find((candidate) => candidate.code === book);
    if (!entry) {
      throw new PackageUnavailableError(`${versionId}/${book}`);
    }
    const raw = await this.readVerifiedBookBytes(handle, entry);
    const verses: PackageVerse[] = [];
    const byChapter = new Map<number, PackageVerse[]>();
    for (const line of raw.toString("utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        throw new PackageIntegrityError(`Book ${book} in ${versionId} contains invalid JSON`);
      }
      const verse = packageVerseSchema.parse(parsed);
      if (verse.book !== book) {
        throw new PackageIntegrityError(
          `Book ${book} in ${versionId} contains a verse for ${verse.book}`,
        );
      }
      verses.push(verse);
      const chapter = byChapter.get(verse.chapter) ?? [];
      chapter.push(verse);
      byChapter.set(verse.chapter, chapter);
    }
    return { verses, byChapter };
  }

  private async readVerifiedBookBytes(handle: PackageHandle, entry: PackageBook): Promise<Buffer> {
    const file = safePackagePath(handle.directory, entry.file);
    let raw: Buffer;
    try {
      raw = await readFile(file);
    } catch (error) {
      if (isMissing(error)) throw new PackageUnavailableError(handle.manifest.versionId);
      throw error;
    }
    const fileStat = await stat(file);
    if (fileStat.size !== entry.bytes) {
      throw new PackageIntegrityError(
        `Book ${entry.code} in ${handle.manifest.versionId} has ${fileStat.size} bytes; manifest expects ${entry.bytes}`,
      );
    }
    if (createHash("sha256").update(raw).digest("hex") !== entry.sha256) {
      throw new PackageIntegrityError(
        `Book ${entry.code} in ${handle.manifest.versionId} failed its SHA-256 check`,
      );
    }
    return raw;
  }
}
