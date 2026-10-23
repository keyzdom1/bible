import type { OpenSearchConfig } from "../config";

export interface SearchDocument {
  readonly verseId: string;
  readonly versionId: string;
  readonly book: string;
  readonly chapter: number;
  readonly verse: number;
  readonly text: string;
}

interface SearchHit {
  readonly _source?: Partial<SearchDocument>;
}

interface SearchBody {
  readonly hits?: { readonly hits?: readonly SearchHit[] };
}

function authHeaders(config: OpenSearchConfig): Record<string, string> {
  if (!config.username) return {};
  return {
    authorization: `Basic ${Buffer.from(`${config.username}:${config.password ?? ""}`).toString("base64")}`,
  };
}

/**
 * Minimal OpenSearch client for online cross-version search. It deliberately
 * implements only the `_search` call the API needs; ingestion and index creation
 * live in `@holyword/content` so the API process never needs write credentials.
 */
export class OpenSearchClient {
  constructor(
    private readonly config: OpenSearchConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async search(
    query: string,
    versionIds: readonly string[],
    limit: number,
  ): Promise<SearchDocument[]> {
    if (versionIds.length === 0 || limit < 1) return [];

    const body = {
      size: limit,
      track_total_hits: false,
      _source: ["verseId", "versionId", "book", "chapter", "verse", "text"],
      query: {
        bool: {
          filter: [{ terms: { versionId: versionIds } }],
          should: [
            {
              match_phrase: {
                text: { query, slop: 0, boost: 3 },
              },
            },
            {
              match: {
                text: { query, operator: "and" },
              },
            },
          ],
          minimum_should_match: 1,
        },
      },
    };

    const response = await this.fetchImpl(
      `${this.config.url}/${encodeURIComponent(this.config.index)}/_search`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...authHeaders(this.config),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      },
    );
    if (!response.ok) {
      throw new Error(`OpenSearch search returned ${response.status}`);
    }
    const parsed = (await response.json()) as SearchBody;
    const allowed = new Set(versionIds);
    const documents: SearchDocument[] = [];
    for (const hit of parsed.hits?.hits ?? []) {
      const source = hit._source;
      if (
        source &&
        typeof source.verseId === "string" &&
        typeof source.versionId === "string" &&
        allowed.has(source.versionId) &&
        typeof source.book === "string" &&
        typeof source.chapter === "number" &&
        typeof source.verse === "number" &&
        typeof source.text === "string"
      ) {
        documents.push({
          verseId: source.verseId,
          versionId: source.versionId,
          book: source.book,
          chapter: source.chapter,
          verse: source.verse,
          text: source.text,
        });
      }
    }
    return documents;
  }
}
