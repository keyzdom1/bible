import { ContentToolError } from "./types";

export interface OpenSearchTarget {
  readonly url: string;
  readonly index: string;
  readonly username?: string;
  readonly password?: string;
}

export interface IndexVerse {
  readonly verseId: string;
  readonly versionId: string;
  readonly book: string;
  readonly chapter: number;
  readonly verse: number;
  readonly text: string;
}

type FetchLike = typeof fetch;

const MAPPING = {
  settings: {
    number_of_shards: 1,
    number_of_replicas: 1,
  },
  mappings: {
    properties: {
      verseId: { type: "keyword" },
      versionId: { type: "keyword" },
      book: { type: "keyword" },
      chapter: { type: "integer" },
      verse: { type: "integer" },
      text: { type: "text" },
    },
  },
} as const;

function authHeaders(target: OpenSearchTarget): Record<string, string> {
  if (!target.username) return {};
  const token = Buffer.from(`${target.username}:${target.password ?? ""}`).toString("base64");
  return { authorization: `Basic ${token}` };
}

async function request(
  target: OpenSearchTarget,
  path: string,
  init: RequestInit,
  fetchImpl: FetchLike,
  allowConflict = false,
): Promise<unknown> {
  const response = await fetchImpl(`${target.url.replace(/\/+$/, "")}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...authHeaders(target),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const body = await response.text();
  if (!response.ok) {
    if (
      allowConflict &&
      response.status === 400 &&
      body.includes("resource_already_exists_exception")
    ) {
      return undefined;
    }
    throw new ContentToolError(
      "opensearch-error",
      `OpenSearch ${init.method ?? "GET"} ${path} returned ${response.status}: ${body.slice(0, 300)}`,
    );
  }
  return body ? (JSON.parse(body) as unknown) : undefined;
}

export async function ensureOpenSearchIndex(
  target: OpenSearchTarget,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  await request(
    target,
    `/${encodeURIComponent(target.index)}`,
    { method: "PUT", body: JSON.stringify(MAPPING) },
    fetchImpl,
    true,
  );
}

export function buildBulkBody(target: OpenSearchTarget, verses: readonly IndexVerse[]): string {
  const lines: string[] = [];
  for (const verse of verses) {
    lines.push(
      JSON.stringify({
        index: {
          _index: target.index,
          _id: `${verse.versionId}:${verse.verseId}`,
        },
      }),
    );
    lines.push(
      JSON.stringify({
        verseId: verse.verseId,
        versionId: verse.versionId,
        book: verse.book,
        chapter: verse.chapter,
        verse: verse.verse,
        text: verse.text,
      }),
    );
  }
  return `${lines.join("\n")}\n`;
}

export async function indexVerses(
  target: OpenSearchTarget,
  verses: readonly IndexVerse[],
  options: { readonly fetchImpl?: FetchLike; readonly batchSize?: number } = {},
): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const batchSize = options.batchSize ?? 1000;
  await ensureOpenSearchIndex(target, fetchImpl);

  for (let offset = 0; offset < verses.length; offset += batchSize) {
    const batch = verses.slice(offset, offset + batchSize);
    const result = (await request(
      target,
      "/_bulk",
      {
        method: "POST",
        headers: { "content-type": "application/x-ndjson" },
        body: buildBulkBody(target, batch),
      },
      fetchImpl,
    )) as { errors?: boolean; items?: Array<Record<string, { error?: unknown }>> } | undefined;
    if (result?.errors) {
      throw new ContentToolError(
        "opensearch-bulk-failed",
        `OpenSearch bulk indexing reported errors for ${batch.length} verses`,
      );
    }
  }

  await request(
    target,
    `/${encodeURIComponent(target.index)}/_refresh`,
    { method: "POST", body: "{}" },
    fetchImpl,
  );
}
