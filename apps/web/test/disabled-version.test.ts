import { describe, expect, it, vi } from "vitest";
import { packageManifestSchema, type ApiVersion } from "@holyword/core";
import type { LocalVersion, LocalVerse } from "@holyword/offline";
import { WebRuntime } from "../src/lib/web-runtime";

/**
 * QA scenario from the build spec: "a version being disabled after download".
 * The catalog is the source of truth for availability — once a publisher pulls
 * a version, nothing new may be fetched for it — but text already downloaded to
 * the device keeps working offline, because a local-first reader cannot be
 * remotely emptied and offline reading is the point of the app.
 */

const ZERO_SHA = "0".repeat(64);
const PUBLIC_DOMAIN_POLICY = {
  status: "public-domain" as const,
  offlineDownload: true,
  maxDevices: null,
  maxVersesPerCopy: null,
  maxVersesPerShare: 500,
  encryption: "none" as const,
  regions: null,
  copyright: "Public domain",
  attribution: "King James Version",
};

function apiVersion(enabled: boolean): ApiVersion {
  return {
    versionId: "kjv",
    versionCode: 1,
    name: "King James Version",
    abbreviation: "KJV",
    language: "en",
    languageName: "English",
    direction: "ltr",
    enabled,
    licenceStatus: "public-domain",
    paraphrase: false,
    verseCount: 1,
    copyright: "Public domain",
    attribution: "King James Version",
  };
}

function installedVersion(): LocalVersion {
  return {
    version_id: "kjv",
    version_code: 1,
    name: "King James Version",
    abbreviation: "KJV",
    language: "en",
    language_name: "English",
    direction: "ltr",
    licence: PUBLIC_DOMAIN_POLICY,
    copyright: "Public domain",
    attribution: "King James Version",
    manifest: packageManifestSchema.parse({
      schemaVersion: 1,
      versionId: "kjv",
      versionCode: 1,
      name: "King James Version",
      abbreviation: "KJV",
      language: "en",
      languageName: "English",
      direction: "ltr",
      licence: PUBLIC_DOMAIN_POLICY,
      versificationId: "kjv",
      books: [
        {
          code: "GEN",
          name: "Genesis",
          chapters: 1,
          verses: 1,
          file: "books/GEN.ndjson",
          bytes: 0,
          sha256: ZERO_SHA,
        },
      ],
      totals: { books: 1, chapters: 1, verses: 1 },
      builtAt: "2026-01-01T00:00:00.000Z",
      builderVersion: "test",
      source: { name: "Synthetic", licenceNote: "Test fixture" },
    }),
    manifest_sha256: ZERO_SHA,
    package_bytes: 0,
    storage_bytes: 0,
    verse_count: 1,
    installed_at: "2026-01-01T00:00:00.000Z",
    search_ready: true,
  };
}

function localVerse(): LocalVerse {
  return {
    version_id: "kjv",
    id: "GEN.1.1",
    book: "GEN",
    chapter: 1,
    verse: 1,
    text: "Synthetic local verse.",
  };
}

function runtimeWith(options: {
  catalog: ApiVersion[];
  installed?: LocalVersion;
  localVerses?: LocalVerse[];
}) {
  const runtime = new WebRuntime();
  const db = {
    getVersion: vi.fn().mockResolvedValue(options.installed ?? null),
    getChapter: vi.fn().mockResolvedValue(options.localVerses ?? []),
  };
  Object.defineProperty(runtime, "database", { value: db, configurable: true });
  vi.spyOn(runtime.api, "listVersions").mockResolvedValue(options.catalog);
  const getChapter = vi.spyOn(runtime.api, "getChapter").mockResolvedValue({
    versionId: "kjv",
    book: "GEN",
    bookName: "Genesis",
    chapter: 1,
    verses: [{ id: "GEN.1.1", book: "GEN", chapter: 1, verse: 1, text: "Synthetic online verse." }],
    copyright: "Public domain",
    attribution: "King James Version",
  });
  return { runtime, db, getChapter };
}

describe("a version disabled after download", () => {
  it("keeps serving the downloaded text from local storage", async () => {
    const { runtime, db, getChapter } = runtimeWith({
      catalog: [apiVersion(false)],
      installed: installedVersion(),
      localVerses: [localVerse()],
    });

    const chapter = await runtime.loadChapter("kjv", "GEN", 1);
    expect(chapter.source).toBe("local");
    expect(chapter.bookName).toBe("Genesis");
    expect(chapter.verses).toEqual([{ id: "GEN.1.1", verse: 1, text: "Synthetic local verse." }]);
    expect(db.getVersion).toHaveBeenCalledWith("kjv");
    expect(getChapter).not.toHaveBeenCalled();
  });

  it("refuses to fetch a disabled version that was never downloaded", async () => {
    const { runtime, getChapter } = runtimeWith({ catalog: [apiVersion(false)] });

    await expect(runtime.loadChapter("kjv", "GEN", 1)).rejects.toThrow(
      "This Bible version is not available.",
    );
    expect(getChapter).not.toHaveBeenCalled();
  });

  it("still fetches an enabled version online when it is not downloaded", async () => {
    const { runtime, getChapter } = runtimeWith({ catalog: [apiVersion(true)] });

    const chapter = await runtime.loadChapter("kjv", "GEN", 1);
    expect(chapter.source).toBe("online");
    expect(chapter.verses).toHaveLength(1);
    expect(getChapter).toHaveBeenCalledWith("kjv", "GEN", 1);
  });

  it("defers to the server when the catalog has no entry for a version", async () => {
    // The local catalog is a convenience gate, not the authority: with no
    // catalog entry (e.g. a failed refresh) the request falls through to the
    // API, which answers 404/403 for anything disabled or unknown.
    const { runtime, getChapter } = runtimeWith({ catalog: [] });

    const chapter = await runtime.loadChapter("kjv", "GEN", 1);
    expect(chapter.source).toBe("online");
    expect(getChapter).toHaveBeenCalledWith("kjv", "GEN", 1);
  });
});
