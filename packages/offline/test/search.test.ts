import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { HolyWordDexie } from "../src/dexie";
import { MiniSearchEngine } from "../src/search/minisearch";
import { buildTestPackage, installableFrom } from "./fixtures";

let sequence = 0;
const databases: HolyWordDexie[] = [];

async function setup() {
  sequence += 1;
  const db = new HolyWordDexie(`search-${sequence}`);
  databases.push(db);
  const pkg = buildTestPackage();
  await db.installContent(installableFrom(pkg));
  const search = new MiniSearchEngine(db);
  await search.indexVersion("test");
  await db.markSearchReady("test", true);
  return { db, pkg, search };
}

afterEach(async () => {
  await Promise.all(
    databases.splice(0).map(async (db) => {
      db.close();
      await db.delete();
    }),
  );
});

describe("MiniSearch local search", () => {
  it("finds words case-insensitively and returns verse coordinates", async () => {
    const { search } = await setup();
    const results = await search.search("test", "BEGINNING");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      verseId: "GEN.1.1",
      versionId: "test",
      book: "GEN",
      chapter: 1,
      verse: 1,
    });
  });

  it("finds exact phrases rather than loose word conjunctions", async () => {
    const { search } = await setup();
    expect((await search.search("test", "God created")).map((row) => row.verseId)).toEqual([
      "GEN.1.1",
    ]);
    expect((await search.search("test", "God loved")).map((row) => row.verseId)).toEqual([]);
    expect((await search.search("test", '"God so loved"')).map((row) => row.verseId)).toEqual([
      "JHN.3.16",
    ]);
  });

  it("resolves full and abbreviated verse references and ranges", async () => {
    const { search } = await setup();
    expect((await search.search("test", "John 3:16")).map((row) => row.verseId)).toEqual([
      "JHN.3.16",
    ]);
    expect((await search.search("test", "Jn 3:16-18")).map((row) => row.verseId)).toEqual([
      "JHN.3.16",
      "JHN.3.17",
      "JHN.3.18",
    ]);
    expect((await search.search("test", "Genesis 1:2-3")).map((row) => row.verseId)).toEqual([
      "GEN.1.2",
      "GEN.1.3",
    ]);
  });

  it("searches only the requested version", async () => {
    const { db, search } = await setup();
    const other = buildTestPackage({ versionId: "other", versionCode: 1 });
    await db.installContent(installableFrom(other));
    await search.indexVersion("other");
    const testResults = await search.search("test", "beginning");
    const otherResults = await search.search("other", "beginning");
    expect(testResults.map((row) => row.versionId)).toEqual(["test"]);
    expect(otherResults.map((row) => row.versionId)).toEqual(["other"]);
  });

  it("loads a serialised index after the in-memory cache is discarded", async () => {
    const { db, search } = await setup();
    expect(await search.search("test", "beginning")).toHaveLength(1);
    const reloaded = new MiniSearchEngine(db);
    expect((await reloaded.search("test", "beginning")).map((row) => row.verseId)).toEqual([
      "GEN.1.1",
    ]);
  });

  it("returns no text results after a version is removed", async () => {
    const { db, search } = await setup();
    await db.deleteVersion("test");
    await search.deleteVersion("test");
    expect(await search.search("test", "beginning")).toEqual([]);
  });
});
