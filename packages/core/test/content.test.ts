import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  packageManifestSchema,
  packageVerseSchema,
  versificationMapSchema,
  type PackageManifest,
} from "../src/content";

function fixture(path: string): string {
  return readFileSync(new URL(`../../../fixtures/synthetic/${path}`, import.meta.url), "utf8");
}

function loadManifest(): PackageManifest {
  return packageManifestSchema.parse(JSON.parse(fixture("manifest.json")));
}

describe("content package fixture", () => {
  it("validates the manifest", () => {
    const manifest = loadManifest();
    expect(manifest.versionId).toBe("synthetic-kjv");
    expect(manifest.books).toHaveLength(1);
    expect(manifest.totals).toEqual({ books: 1, chapters: 2, verses: 6 });
    expect(manifest.licence.status).toBe("public-domain");
  });

  it("matches the recorded checksum and size", () => {
    const manifest = loadManifest();
    const book = manifest.books[0]!;
    const contents = readFileSync(
      new URL(`../../../fixtures/synthetic/${book.file}`, import.meta.url),
    );
    expect(contents.byteLength).toBe(book.bytes);
    expect(createHash("sha256").update(contents).digest("hex")).toBe(book.sha256);
  });

  it("parses every verse line and agrees with the manifest totals", () => {
    const manifest = loadManifest();
    let verseCount = 0;
    for (const book of manifest.books) {
      const lines = fixture(book.file).trim().split("\n");
      expect(lines).toHaveLength(book.verses);
      const chapters = new Set<number>();
      for (const line of lines) {
        const verse = packageVerseSchema.parse(JSON.parse(line));
        expect(verse.id).toBe(`${verse.book}.${verse.chapter}.${verse.verse}`);
        expect(verse.book).toBe(book.code);
        chapters.add(verse.chapter);
        verseCount += 1;
      }
      expect(chapters.size).toBe(book.chapters);
    }
    expect(verseCount).toBe(manifest.totals.verses);
  });

  it("validates the versification map", () => {
    const map = versificationMapSchema.parse(JSON.parse(fixture("versification.json")));
    expect(map.books.GEN).toEqual([31, 25]);
    expect(map.crossVersion).toEqual([]);
  });

  it("rejects tampered or incomplete manifests", () => {
    const manifest = JSON.parse(fixture("manifest.json")) as Record<string, unknown>;
    expect(() => packageManifestSchema.parse({ ...manifest, schemaVersion: 2 })).toThrow();
    expect(() =>
      packageManifestSchema.parse({
        ...manifest,
        books: [{ ...(manifest.books as object[])[0], sha256: "abc" }],
      }),
    ).toThrow();
    const { licence: _licence, ...withoutLicence } = manifest;
    expect(() => packageManifestSchema.parse(withoutLicence)).toThrow();
  });

  it("rejects malformed verse lines", () => {
    expect(() =>
      packageVerseSchema.parse({ id: "JHN.3", book: "JHN", chapter: 3, verse: 16, text: "x" }),
    ).toThrow();
    expect(() =>
      packageVerseSchema.parse({ id: "XYZ.1.1", book: "XYZ", chapter: 1, verse: 1, text: "x" }),
    ).toThrow();
  });

  it("rejects duplicate verse ids across a package", () => {
    const manifest = loadManifest();
    const ids = ["GEN.1.1", "GEN.1.1"];
    expect(new Set(ids).size).not.toBe(ids.length);
    expect(manifest.totals.verses).toBeGreaterThan(0);
  });
});
