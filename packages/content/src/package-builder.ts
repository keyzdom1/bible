import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  BOOKS,
  packageManifestSchema,
  packageVerseSchema,
  versificationMapSchema,
  type BookCode,
  type PackageBook,
  type PackageManifest,
  type PackageVerse,
  type VersificationMap,
} from "@holyword/core";
import { zipSync } from "fflate";
import { buildVersification, readSource, validateContent, type ValidatedContent } from "./validate";
import {
  ContentToolError,
  type SourceFormat,
  type SourceMetadata,
  type SourceVerse,
} from "./types";

export const BUILDER_VERSION = "0.1.0";

export interface BuildPackageOptions {
  readonly sourcePath: string;
  readonly format?: SourceFormat;
  readonly metadata: SourceMetadata;
  readonly outRoot: string;
  readonly builtAt?: string;
  readonly writeArchive?: boolean;
}

export interface BuiltPackage {
  readonly directory: string;
  readonly manifest: PackageManifest;
  readonly manifestChecksum: string;
  readonly archive?: Uint8Array;
}

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function toBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function sortVerses(verses: readonly SourceVerse[]): SourceVerse[] {
  const order = new Map<BookCode, number>(BOOKS.map((book) => [book.code, book.order]));
  return [...verses].sort(
    (a, b) =>
      (order.get(a.book) ?? 999) - (order.get(b.book) ?? 999) ||
      a.chapter - b.chapter ||
      a.verse - b.verse,
  );
}

function ndjson(verses: readonly SourceVerse[]): Uint8Array {
  const lines = verses.map((verse) =>
    JSON.stringify({
      id: `${verse.book}.${verse.chapter}.${verse.verse}`,
      book: verse.book,
      chapter: verse.chapter,
      verse: verse.verse,
      text: verse.text,
    }),
  );
  return toBytes(`${lines.join("\n")}\n`);
}

function jsonFile(value: unknown): Uint8Array {
  return toBytes(`${JSON.stringify(value, null, 2)}\n`);
}

function bookName(code: BookCode): string {
  return BOOKS.find((book) => book.code === code)?.name ?? code;
}

function manifestFor(
  metadata: SourceMetadata,
  content: ValidatedContent,
  files: readonly {
    readonly code: BookCode;
    readonly bytes: Uint8Array;
    readonly chapters: number;
    readonly verses: number;
  }[],
  versificationBytes: Uint8Array,
  builtAt: string,
): PackageManifest {
  const books: PackageBook[] = files.map((file) => ({
    code: file.code,
    name: bookName(file.code),
    chapters: file.chapters,
    verses: file.verses,
    file: `books/${file.code}.ndjson`,
    bytes: file.bytes.byteLength,
    sha256: sha256(file.bytes),
  }));

  const manifest: PackageManifest = {
    schemaVersion: 1,
    versionId: metadata.versionId,
    versionCode: metadata.versionCode,
    name: metadata.name,
    abbreviation: metadata.abbreviation,
    language: metadata.language,
    languageName: metadata.languageName,
    direction: metadata.direction,
    licence: metadata.licence,
    versificationId: metadata.versificationId,
    versification: {
      file: "versification.json",
      bytes: versificationBytes.byteLength,
      sha256: sha256(versificationBytes),
    },
    books,
    totals: content.totals,
    builtAt,
    builderVersion: metadata.builderVersion ?? BUILDER_VERSION,
    source: metadata.source,
  };
  return packageManifestSchema.parse(manifest);
}

function describeValidationError(error: unknown): never {
  if (error instanceof ContentToolError) throw error;
  throw error;
}

/**
 * Builds a complete package in a staging directory, validates the manifest it just
 * wrote, and only then renames the directory into its immutable final location.
 * Existing version directories are never overwritten.
 */
export async function buildPackage(options: BuildPackageOptions): Promise<BuiltPackage> {
  let verses: SourceVerse[] = [];
  try {
    verses = [...(await readSource({ path: options.sourcePath, format: options.format }))];
  } catch (error) {
    describeValidationError(error);
  }

  const content = validateContent(verses, { metadata: options.metadata });

  const suppliedMap = options.metadata.versification;
  const versification = buildVersification(content, {
    id: options.metadata.versificationId,
    baseVersionId: suppliedMap?.baseVersionId ?? "kjv",
    description: suppliedMap?.description ?? `Verse counts for ${options.metadata.name}`,
    supplied: suppliedMap,
  });
  const versificationBytes = jsonFile(versification);

  const sorted = sortVerses(content.verses);
  const files: {
    code: BookCode;
    bytes: Uint8Array;
    chapters: number;
    verses: number;
  }[] = [];
  for (const book of content.books) {
    const bookVerses = sorted.filter((verse) => verse.book === book);
    const bytes = ndjson(bookVerses);
    const chapters = content.chapterCounts.get(book)?.length ?? 0;
    files.push({ code: book, bytes, chapters, verses: bookVerses.length });
  }

  const builtAt = options.builtAt ?? options.metadata.builtAt ?? new Date().toISOString();
  const manifest = manifestFor(options.metadata, content, files, versificationBytes, builtAt);

  const outRoot = resolve(options.outRoot);
  const finalDirectory = join(outRoot, manifest.versionId, String(manifest.versionCode));
  const staging = `${finalDirectory}.staging-${randomUUID()}`;

  try {
    await mkdir(staging, { recursive: true });
    await mkdir(join(staging, "books"), { recursive: true });
    for (const file of files) {
      await writeFile(join(staging, "books", `${file.code}.ndjson`), file.bytes);
    }
    await writeFile(join(staging, "versification.json"), versificationBytes);
    const manifestBytes = jsonFile(manifest);
    await writeFile(join(staging, "manifest.json"), manifestBytes);

    let archive: Uint8Array | undefined;
    if (options.writeArchive) {
      archive = buildArchiveBytes(staging, manifest, versification);
      await writeFile(join(staging, "package.zip"), archive);
    }

    try {
      await stat(finalDirectory);
      throw new ContentToolError(
        "immutable-package-exists",
        `Refusing to overwrite existing package ${finalDirectory}; increment versionCode instead`,
      );
    } catch (error) {
      if (!(
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "ENOENT"
      )) {
        throw error;
      }
    }

    await mkdir(dirname(finalDirectory), { recursive: true });
    await rename(staging, finalDirectory);
    return {
      directory: finalDirectory,
      manifest,
      manifestChecksum: sha256(manifestBytes),
      ...(archive ? { archive } : {}),
    };
  } catch (error) {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

export interface VerifiedPackage {
  readonly directory: string;
  readonly manifest: PackageManifest;
  readonly manifestChecksum: string;
  readonly manifestBytes: Uint8Array;
  readonly versification: VersificationMap;
  readonly verses: readonly PackageVerse[];
}

/**
 * Verifies every size and SHA-256 in a package, then re-validates the verse data
 * against the manifest. This is the gate used by publishing and by `content:verify`.
 */
export async function verifyPackage(directory: string): Promise<VerifiedPackage> {
  const root = resolve(directory);
  const manifestBytes = await readFile(join(root, "manifest.json"));
  let manifest: PackageManifest;
  try {
    manifest = packageManifestSchema.parse(JSON.parse(manifestBytes.toString("utf8")));
  } catch (error) {
    throw new ContentToolError("invalid-manifest", `Invalid manifest in ${root}`, { cause: error });
  }

  let versification: VersificationMap;
  if (manifest.versification) {
    const descriptor = manifest.versification;
    const bytes = await readFile(join(root, descriptor.file));
    if (bytes.byteLength !== descriptor.bytes) {
      throw new ContentToolError(
        "checksum-mismatch",
        `${descriptor.file} has ${bytes.byteLength} bytes; manifest expects ${descriptor.bytes}`,
      );
    }
    if (sha256(bytes) !== descriptor.sha256) {
      throw new ContentToolError(
        "checksum-mismatch",
        `${descriptor.file} failed its SHA-256 check`,
      );
    }
    try {
      versification = versificationMapSchema.parse(JSON.parse(bytes.toString("utf8")));
    } catch (error) {
      throw new ContentToolError("invalid-versification", `Invalid versification in ${root}`, {
        cause: error,
      });
    }
  } else {
    const bytes = await readFile(join(root, "versification.json"));
    try {
      versification = versificationMapSchema.parse(JSON.parse(bytes.toString("utf8")));
    } catch (error) {
      throw new ContentToolError("invalid-versification", `Invalid versification in ${root}`, {
        cause: error,
      });
    }
  }
  if (versification.id !== manifest.versificationId) {
    throw new ContentToolError(
      "invalid-versification",
      `Manifest versificationId "${manifest.versificationId}" does not match "${versification.id}"`,
    );
  }

  const verses: PackageVerse[] = [];
  const seen = new Set<string>();
  let chapterTotal = 0;
  for (const book of manifest.books) {
    const bytes = await readFile(join(root, book.file));
    if (bytes.byteLength !== book.bytes) {
      throw new ContentToolError(
        "checksum-mismatch",
        `${book.file} has ${bytes.byteLength} bytes; manifest expects ${book.bytes}`,
      );
    }
    if (sha256(bytes) !== book.sha256) {
      throw new ContentToolError("checksum-mismatch", `${book.file} failed its SHA-256 check`);
    }
    let bookVerses = 0;
    const chapters = new Set<number>();
    const chapterCounts = new Map<number, number>();
    for (const line of bytes.toString("utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      const verse = packageVerseSchema.parse(JSON.parse(line));
      if (verse.book !== book.code) {
        throw new ContentToolError(
          "invalid-verse",
          `${book.file} contains a verse for ${verse.book}`,
        );
      }
      if (seen.has(verse.id)) {
        throw new ContentToolError("duplicate-verse", `Duplicate verse ${verse.id} in package`);
      }
      if (verse.text.trim() === "") {
        throw new ContentToolError("empty-verse", `Verse ${verse.id} has empty text`);
      }
      seen.add(verse.id);
      verses.push(verse);
      chapters.add(verse.chapter);
      chapterCounts.set(verse.chapter, (chapterCounts.get(verse.chapter) ?? 0) + 1);
      bookVerses += 1;
    }
    if (bookVerses !== book.verses) {
      throw new ContentToolError(
        "verse-count-mismatch",
        `${book.code}: manifest says ${book.verses} verses, file has ${bookVerses}`,
      );
    }
    if (chapters.size !== book.chapters) {
      throw new ContentToolError(
        "chapter-count-mismatch",
        `${book.code}: manifest says ${book.chapters} chapters, file has ${chapters.size}`,
      );
    }
    const counts = versification.books[book.code];
    if (!counts) {
      throw new ContentToolError(
        "invalid-versification",
        `${book.code}: versification is missing this book`,
      );
    }
    if (counts.length !== book.chapters) {
      throw new ContentToolError(
        "invalid-versification",
        `${book.code}: versification has ${counts.length} chapters, manifest says ${book.chapters}`,
      );
    }
    for (let chapter = 1; chapter <= counts.length; chapter += 1) {
      if (counts[chapter - 1] !== chapterCounts.get(chapter)) {
        throw new ContentToolError(
          "invalid-versification",
          `${book.code} ${chapter}: versification says ${String(counts[chapter - 1])} verses, package has ${String(chapterCounts.get(chapter) ?? 0)}`,
        );
      }
    }
    chapterTotal += chapters.size;
  }

  if (verses.length !== manifest.totals.verses) {
    throw new ContentToolError(
      "verse-count-mismatch",
      `Package has ${verses.length} verses; manifest says ${manifest.totals.verses}`,
    );
  }
  if (
    manifest.books.length !== manifest.totals.books ||
    chapterTotal !== manifest.totals.chapters
  ) {
    throw new ContentToolError(
      "count-mismatch",
      "Manifest totals do not match its book descriptors",
    );
  }

  return {
    directory: root,
    manifest,
    manifestChecksum: sha256(manifestBytes),
    manifestBytes,
    versification,
    verses,
  };
}

function buildArchiveBytes(
  directory: string,
  manifest: PackageManifest,
  versification: VersificationMap,
): Uint8Array {
  const files: Record<string, Uint8Array> = {
    "manifest.json": toBytes(`${JSON.stringify(manifest, null, 2)}\n`),
    "versification.json": toBytes(`${JSON.stringify(versification, null, 2)}\n`),
  };
  for (const book of manifest.books) {
    files[book.file] = readFileSync(join(directory, book.file));
  }
  return zipSync(files, { level: 6, mtime: "1980-01-01T00:00:00Z" });
}

/** Builds the download archive from an already verified package directory. */
export async function buildArchive(directory: string): Promise<Uint8Array> {
  const verified = await verifyPackage(directory);
  const files: Record<string, Uint8Array> = {
    "manifest.json": verified.manifestBytes,
    "versification.json": toBytes(`${JSON.stringify(verified.versification, null, 2)}\n`),
  };
  for (const book of verified.manifest.books) {
    files[book.file] = await readFile(join(verified.directory, book.file));
  }
  return zipSync(files, { level: 6, mtime: "1980-01-01T00:00:00Z" });
}

/** Converts a verified package to the flattened records indexed by OpenSearch. */
export function searchDocuments(verified: VerifiedPackage) {
  return verified.verses.map((verse) => ({
    verseId: verse.id,
    versionId: verified.manifest.versionId,
    book: verse.book,
    chapter: verse.chapter,
    verse: verse.verse,
    text: verse.text,
  }));
}
