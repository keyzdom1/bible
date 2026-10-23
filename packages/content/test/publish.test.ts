import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildPackage } from "../src/package-builder";
import { publishPackage, type S3PutClient } from "../src/publish";
import { sourceMetadataSchema, type SourceMetadata } from "../src/types";

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "holyword-publish-"));
  temporaryDirectories.push(directory);
  return directory;
}

function policy(status: "public-domain" | "licensed" | "unlicensed") {
  return {
    status,
    offlineDownload: true,
    maxDevices: null,
    maxVersesPerCopy: null,
    maxVersesPerShare: null,
    encryption: "none" as const,
    regions: null,
    copyright: "Synthetic fixture.",
    attribution: "Synthetic fixture.",
    licenceNote: "Not scripture.",
  };
}

async function build(status: "public-domain" | "licensed" | "unlicensed" = "public-domain") {
  const root = temporaryDirectory();
  const source = join(root, "source");
  mkdirSync(source, { recursive: true });
  writeFileSync(join(source, "GEN.usfm"), "\\id GEN Genesis\n\\c 1\n\\v 1 Synthetic verse.\n");
  const metadata: SourceMetadata = sourceMetadataSchema.parse({
    versionId: "test",
    versionCode: 1,
    name: "Synthetic Test Version",
    abbreviation: "TST",
    language: "en",
    languageName: "English",
    direction: "ltr",
    licence: policy(status),
    versificationId: "test",
    source: { name: "Synthetic fixture", licenceNote: "Not scripture." },
    builtAt: "2026-10-21T00:00:00.000Z",
    requireAllBooks: false,
  });
  return buildPackage({ sourcePath: source, metadata, outRoot: join(root, "packages") });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("S3 package publishing", () => {
  it("uploads every verified package object with immutable caching", async () => {
    const built = await build();
    const commands: unknown[] = [];
    const client: S3PutClient = {
      send: async (command: unknown) => {
        commands.push(command);
        return {};
      },
    };

    const published = await publishPackage(
      built.directory,
      { bucket: "holyword-test", region: "us-east-1", prefix: "packages" },
      { client },
    );

    expect(published.map((object) => object.key).sort()).toEqual([
      "packages/test/1/books/GEN.ndjson",
      "packages/test/1/manifest.json",
      "packages/test/1/package.zip",
      "packages/test/1/versification.json",
    ]);
    expect(commands).toHaveLength(4);
    const command = commands[0] as { input: { Bucket: string; CacheControl: string } };
    expect(command.input.Bucket).toBe("holyword-test");
    expect(command.input.CacheControl).toContain("immutable");
  });

  it("refuses to publish an unlicensed package", async () => {
    const built = await build("unlicensed");
    const client: S3PutClient = { send: async () => ({}) };
    await expect(
      publishPackage(built.directory, { bucket: "holyword-test", region: "us-east-1" }, { client }),
    ).rejects.toMatchObject({ code: "unlicensed-package" });
  });
});
