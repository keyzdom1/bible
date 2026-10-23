import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
  PackageVerificationError,
  sha256Hex,
  verifyPackageArchive,
} from "../src/download/verification";
import { buildTestPackage, TEST_VERSES } from "./fixtures";

describe("package verification", () => {
  it("verifies a complete package", () => {
    const pkg = buildTestPackage();
    const verified = verifyPackageArchive(pkg.archive, {
      versionId: "test",
      versionCode: 1,
      checksum: pkg.checksum,
    });
    expect(verified.manifest.versionId).toBe("test");
    expect(verified.verses).toHaveLength(TEST_VERSES.length);
    expect(verified.manifest_sha256).toBe(pkg.checksum);
  });

  it("rejects a manifest that does not match the ticket checksum", () => {
    const pkg = buildTestPackage();
    expect(() =>
      verifyPackageArchive(pkg.archive, {
        versionId: "test",
        checksum: "0".repeat(64),
      }),
    ).toThrow(PackageVerificationError);
  });

  it("rejects a tampered book file", () => {
    const pkg = buildTestPackage();
    const files = { ...pkg.files };
    const changed = new TextEncoder().encode(
      new TextDecoder().decode(files["books/GEN.ndjson"]).replace("beginning", "creationx"),
    );
    files["books/GEN.ndjson"] = changed;
    expect(() =>
      verifyPackageArchive(zipSync(files), {
        versionId: "test",
        checksum: pkg.checksum,
      }),
    ).toThrow(/failed its SHA-256 check/);
  });

  it("rejects unexpected files", () => {
    const pkg = buildTestPackage({
      extraFiles: { "notes.txt": strToU8("not part of the package") },
    });
    expect(() =>
      verifyPackageArchive(pkg.archive, { versionId: "test", checksum: pkg.checksum }),
    ).toThrow(/unexpected file/);
  });

  it("rejects a version mismatch", () => {
    const pkg = buildTestPackage();
    expect(() =>
      verifyPackageArchive(pkg.archive, {
        versionId: "other",
        checksum: pkg.checksum,
      }),
    ).toThrow(/not other/);
  });

  it("enforces the licence offline permission", () => {
    const pkg = buildTestPackage({ offlineDownload: false });
    expect(() =>
      verifyPackageArchive(pkg.archive, { versionId: "test", checksum: pkg.checksum }),
    ).toThrow(/licence does not permit offline download/);
  });

  it("refuses encrypted packages this build cannot open", () => {
    const pkg = buildTestPackage({ encryption: "aes-256-gcm" });
    expect(() =>
      verifyPackageArchive(pkg.archive, { versionId: "test", checksum: pkg.checksum }),
    ).toThrow(/cannot open encrypted packages/);
  });

  it("rejects a book whose verses disagree with the manifest", () => {
    const verses = TEST_VERSES.map((verse) =>
      verse.id === "GEN.1.1" ? { ...verse, id: "JHN.1.1" } : verse,
    );
    const pkg = buildTestPackage({ verses });
    // The fixture manifest records GEN.1.1; changing the id makes the book file invalid.
    expect(() =>
      verifyPackageArchive(pkg.archive, { versionId: "test", checksum: pkg.checksum }),
    ).toThrow(PackageVerificationError);
  });

  it("computes lowercase SHA-256 hex", () => {
    expect(sha256Hex(strToU8("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
