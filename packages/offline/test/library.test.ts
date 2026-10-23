import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { HolyWordDexie } from "../src/dexie";
import { PackageInstaller } from "../src/download/installer";
import { DownloadManager } from "../src/download/manager";
import { OfflineLibrary } from "../src/library";
import { MiniSearchEngine } from "../src/search/minisearch";
import type { DownloadTicket } from "../src/types";
import { buildTestPackage } from "./fixtures";

const NOW = new Date("2026-01-01T00:00:00.000Z");
let sequence = 0;
const databases: HolyWordDexie[] = [];

async function setup() {
  sequence += 1;
  const db = new HolyWordDexie(`library-${sequence}`);
  databases.push(db);
  const pkg = buildTestPackage();
  const ticket: DownloadTicket = {
    url: "https://content.test/packages/test/1/package.zip",
    manifestUrl: "https://content.test/packages/test/1/manifest.json",
    expiresAt: "2026-01-01T01:00:00.000Z",
    packageVersion: 1,
    checksum: pkg.checksum,
  };
  let fetches = 0;
  const downloads = new DownloadManager({
    store: db,
    tickets: async () => ticket,
    fetch: async () => {
      fetches += 1;
      return new Response(pkg.archive);
    },
    now: () => NOW,
  });
  const search = new MiniSearchEngine(db);
  const installer = new PackageInstaller({ store: db, search, now: () => NOW });
  const library = new OfflineLibrary({ store: db, search, downloads, installer });
  return {
    db,
    search,
    library,
    downloads,
    fetches: () => fetches,
  };
}

afterEach(async () => {
  await Promise.all(
    databases.splice(0).map(async (db) => {
      db.close();
      await db.delete();
    }),
  );
});

describe("OfflineLibrary integration", () => {
  it("downloads, verifies, installs and indexes a package atomically", async () => {
    const { db, search, library, fetches } = await setup();

    const version = await library.installVersion("test");

    expect(fetches()).toBe(1);
    expect(version).toMatchObject({
      version_id: "test",
      verse_count: 6,
      search_ready: true,
    });
    expect(await db.getDownload("test")).toBeUndefined();
    expect(await db.listChunks("test")).toEqual([]);
    expect((await db.getChapter("test", "JHN", 3)).map((verse) => verse.id)).toEqual([
      "JHN.3.16",
      "JHN.3.17",
      "JHN.3.18",
    ]);
    expect((await search.search("test", "Jn 3:16-18")).map((row) => row.verseId)).toEqual([
      "JHN.3.16",
      "JHN.3.17",
      "JHN.3.18",
    ]);
    expect((await search.search("test", '"God so loved"')).map((row) => row.verseId)).toEqual([
      "JHN.3.16",
    ]);
    const plan = {
      id: "11111111-1111-4111-8111-111111111111",
      slug: "john-21",
      title: "21 Days in John",
      description: "Walk through the Gospel of John.",
      day_count: 21,
      schedule: [{ day: 1, title: "The Word", references: ["John 1:1-18"] }],
      is_published: true,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    await db.putReadingPlan(plan);
    expect(await db.listReadingPlans()).toMatchObject([{ slug: "john-21", day_count: 21 }]);
  });

  it("reports a missing download with the requested version id", async () => {
    const { downloads } = await setup();
    await expect(downloads.getProgress("test")).resolves.toMatchObject({
      versionId: "test",
      status: "paused",
      receivedBytes: 0,
      totalBytes: null,
    });
  });

  it("removes the version, search index and download state together", async () => {
    const { db, search, library, downloads } = await setup();
    await library.installVersion("test");

    await library.deleteVersion("test");

    expect(await db.listVersions()).toEqual([]);
    expect(await db.listVerses("test")).toEqual([]);
    expect(await search.search("test", "beginning")).toEqual([]);
    expect(await downloads.getProgress("test")).toMatchObject({ versionId: "test" });
  });
});
