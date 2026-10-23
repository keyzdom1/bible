import { describe, expect, it } from "vitest";
import { buildBulkBody, indexVerses } from "../src/opensearch-indexer";

describe("OpenSearch bulk indexing", () => {
  const target = { url: "https://search.test", index: "holyword-verses" };
  const verses = [
    {
      verseId: "JHN.3.16",
      versionId: "kjv",
      book: "JHN",
      chapter: 3,
      verse: 16,
      text: "Synthetic verse.",
    },
  ];

  it("uses stable ids and the versioned document shape", () => {
    const body = buildBulkBody(target, verses);
    const lines = body.trim().split("\n");
    expect(JSON.parse(lines[0]!)).toEqual({
      index: { _index: "holyword-verses", _id: "kjv:JHN.3.16" },
    });
    expect(JSON.parse(lines[1]!)).toEqual(verses[0]);
  });

  it("creates the index, posts one bulk request and refreshes", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ errors: false }),
      } as Response;
    }) as typeof fetch;

    await indexVerses(target, verses, { fetchImpl: fakeFetch, batchSize: 100 });
    expect(calls).toHaveLength(3);
    expect(calls[0]?.url).toBe("https://search.test/holyword-verses");
    expect(calls[0]?.init.method).toBe("PUT");
    expect(calls[1]?.url).toBe("https://search.test/_bulk");
    expect(calls[1]?.init.body).toContain('"_id":"kjv:JHN.3.16"');
    expect(calls[2]?.url).toBe("https://search.test/holyword-verses/_refresh");
  });

  it("fails when the bulk response reports item errors", async () => {
    const fakeFetch = (async () =>
      ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ errors: true }),
      }) as Response) as typeof fetch;
    await expect(indexVerses(target, verses, { fetchImpl: fakeFetch })).rejects.toMatchObject({
      code: "opensearch-bulk-failed",
    });
  });
});
