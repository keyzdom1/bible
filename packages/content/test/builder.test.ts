import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { unzipSync } from "fflate";
import {
  buildPackage,
  buildVersification,
  verifyPackage,
  validateContent,
  type SourceMetadata,
  sourceMetadataSchema,
} from "../src";
import { ContentToolError } from "../src/types";

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "holyword-content-"));
  temporaryDirectories.push(directory);
  return directory;
}

function metadata(overrides: Partial<SourceMetadata> = {}): SourceMetadata {
  return sourceMetadataSchema.parse({
    versionId: "test",
    versionCode: 1,
    name: "Synthetic Test Version",
    abbreviation: "TST",
    language: "en",
    languageName: "English",
    direction: "ltr",
    licence: {
      status: "public-domain",
      offlineDownload: true,
      maxDevices: null,
      maxVersesPerCopy: null,
      maxVersesPerShare: null,
      encryption: "none",
      regions: null,
      copyright: "Synthetic fixture.",
      attribution: "Synthetic fixture.",
      licenceNote: "Not scripture.",
    },
    versificationId: "test",
    source: { name: "Synthetic fixture", licenceNote: "Not scripture." },
    builtAt: "2026-10-21T00:00:00.000Z",
    requireAllBooks: false,
    expected: { totalVerses: 3, books: { GEN: 3 } },
    ...overrides,
  });
}

function sourceDirectory(): string {
  const root = temporaryDirectory();
  const source = join(root, "source");
  mkdirSync(source, { recursive: true });
  writeFileSync(
    join(source, "GEN.usfm"),
    [
      "\\id GEN Genesis",
      "\\c 1",
      "\\v 1 Synthetic first verse.",
      "\\v 2 Synthetic second verse.",
      "\\c 2",
      "\\v 1 Synthetic third verse.",
    ].join("\n"),
  );
  return source;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("immutable package builder", () => {
  it("writes a checksummed package and verifies it", async () => {
    const root = temporaryDirectory();
    const built = await buildPackage({
      sourcePath: sourceDirectory(),
      metadata: metadata(),
      outRoot: join(root, "packages"),
      writeArchive: true,
    });

    expect(built.directory).toBe(join(root, "packages", "test", "1"));
    expect(built.manifest.totals).toEqual({ books: 1, chapters: 2, verses: 3 });
    expect(built.manifest.versification).toMatchObject({
      file: "versification.json",
      bytes: expect.any(Number),
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    const versification = JSON.parse(
      readFileSync(join(built.directory, "versification.json"), "utf8"),
    ) as { books: Record<string, number[]> };
    expect(versification.books.GEN).toEqual([2, 1]);

    const verified = await verifyPackage(built.directory);
    expect(verified.manifestChecksum).toBe(built.manifestChecksum);
    expect(verified.verses.map((verse) => verse.id)).toEqual(["GEN.1.1", "GEN.1.2", "GEN.2.1"]);

    const archive = verified.manifestBytes;
    expect(archive.byteLength).toBeGreaterThan(0);
    const zipped = unzipSync(built.archive!);
    expect(zipped["manifest.json"]).toBeDefined();
    expect(zipped["versification.json"]).toBeDefined();
    expect(zipped["books/GEN.ndjson"]).toBeDefined();
  });

  it("refuses to overwrite an immutable version directory", async () => {
    const root = temporaryDirectory();
    const options = {
      sourcePath: sourceDirectory(),
      metadata: metadata(),
      outRoot: join(root, "packages"),
    };
    await buildPackage(options);
    await expect(buildPackage(options)).rejects.toMatchObject({
      code: "immutable-package-exists",
    });
  });

  it("detects tampering with a book file", async () => {
    const root = temporaryDirectory();
    const built = await buildPackage({
      sourcePath: sourceDirectory(),
      metadata: metadata(),
      outRoot: join(root, "packages"),
    });
    const bookPath = join(built.directory, "books", "GEN.ndjson");
    writeFileSync(bookPath, `${readFileSync(bookPath, "utf8")}\n`);
    await expect(verifyPackage(built.directory)).rejects.toMatchObject({
      code: "checksum-mismatch",
    });
  });

  it("refuses an unexpected verse count", async () => {
    const root = temporaryDirectory();
    await expect(
      buildPackage({
        sourcePath: sourceDirectory(),
        metadata: metadata({ expected: { totalVerses: 4, books: { GEN: 4 } } }),
        outRoot: join(root, "packages"),
      }),
    ).rejects.toBeInstanceOf(ContentToolError);
  });
});

describe("canonical validation and versification", () => {
  it("rejects duplicate and discontinuous verses", () => {
    expect(() =>
      validateContent(
        [
          { book: "GEN", chapter: 1, verse: 1, text: "One." },
          { book: "GEN", chapter: 1, verse: 1, text: "Again." },
        ],
        { metadata: { versionId: "test", requireAllBooks: false } },
      ),
    ).toThrowError(/Duplicate verse/);
  });

  it("builds a versification map and preserves cross-version mappings", () => {
    const content = validateContent(
      [
        { book: "GEN", chapter: 1, verse: 1, text: "One." },
        { book: "GEN", chapter: 1, verse: 2, text: "Two." },
      ],
      { metadata: { versionId: "test", requireAllBooks: false } },
    );
    const map = buildVersification(content, {
      id: "test",
      baseVersionId: "kjv",
      description: "Synthetic",
      supplied: {
        schemaVersion: 1,
        id: "test",
        baseVersionId: "kjv",
        description: "Synthetic",
        books: { GEN: [2] },
        crossVersion: [{ targetVersionId: "test", canonicalToTarget: { "GEN.1.1": ["GEN.1.1"] } }],
      },
    });
    expect(map.books.GEN).toEqual([2]);
    expect(map.crossVersion).toHaveLength(1);
  });

  it("rejects chapter gaps", () => {
    expect(() =>
      validateContent(
        [
          { book: "GEN", chapter: 1, verse: 1, text: "One." },
          { book: "GEN", chapter: 3, verse: 1, text: "Three." },
        ],
        { metadata: { versionId: "test", requireAllBooks: false } },
      ),
    ).toThrowError(/continuous/);
  });
});
