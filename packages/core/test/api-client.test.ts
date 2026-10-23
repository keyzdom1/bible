import { describe, expect, it, vi } from "vitest";
import { ApiClientError, HolyWordApiClient } from "../src/api-client";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("HolyWordApiClient", () => {
  it("creates a web session with cookies and JSON", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      json({ userId: "u1", email: "reader@example.com", expiresAt: "2026-01-01T01:00:00Z" }),
    );
    const client = new HolyWordApiClient({
      baseUrl: "https://api.test/",
      credentials: "include",
      fetch: fetchMock,
    });

    const session = await client.createSession("token");

    expect(session.email).toBe("reader@example.com");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, rawInit] = fetchMock.mock.calls[0]!;
    const init = rawInit!;
    expect(url).toBe("https://api.test/v1/auth/session");
    expect(init).toMatchObject({
      method: "POST",
      credentials: "include",
      body: JSON.stringify({ idToken: "token" }),
    });
    expect((init.headers as Headers).get("Accept")).toBe("application/json");
    expect((init.headers as Headers).get("Content-Type")).toBe("application/json");
  });

  it("adds a bearer token for mobile requests", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json({ versions: [] }));
    const client = new HolyWordApiClient({
      baseUrl: "https://api.test",
      fetch: fetchMock,
      getAccessToken: async () => "cognito-token",
    });

    await expect(client.listVersions()).resolves.toEqual([]);

    const [url, rawInit] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.test/v1/versions");
    expect((rawInit!.headers as Headers).get("Authorization")).toBe("Bearer cognito-token");
  });

  it("encodes ids and query parameters and unwraps version lists", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url.includes("download-ticket")
        ? json({ url: "https://content.test/ticket" })
        : url.includes("/v1/versions?")
          ? json({ versions: [{ versionId: "kjv" }] })
          : json({}),
    );
    const client = new HolyWordApiClient({
      baseUrl: "https://api.test/",
      fetch: fetchMock,
    });

    const version = await client.getChapter("kjv 1", "JHN", 3);
    const versions = await client.listVersions(true);
    await client.search({ q: "God loved", versionId: "kjv", scope: "version", limit: 5 });
    await client.getDownloadTicket("a/b", { deviceId: "device-1", platform: "ios" });

    expect(version).toEqual({});
    expect(versions).toEqual([{ versionId: "kjv" }]);
    expect(fetchMock.mock.calls[0]![0]).toBe(
      "https://api.test/v1/versions/kjv%201/books/JHN/chapters/3",
    );
    expect(fetchMock.mock.calls[1]![0]).toBe("https://api.test/v1/versions?includeDisabled=true");
    expect(fetchMock.mock.calls[2]![0]).toBe(
      "https://api.test/v1/search?q=God+loved&versionId=kjv&scope=version&limit=5",
    );
    expect(fetchMock.mock.calls[3]![0]).toBe("https://api.test/v1/versions/a%2Fb/download-ticket");
    expect(fetchMock.mock.calls[3]![1]!).toMatchObject({
      method: "POST",
      body: JSON.stringify({ deviceId: "device-1", platform: "ios" }),
    });
  });

  it("validates pull responses", async () => {
    const change = {
      serverSeq: 4,
      entity: "bookmark",
      entityId: "b1",
      op: "upsert",
      payload: { verseId: "JHN.3.16" },
      hlc: "1792506623752:000001:test-node",
      serverVersion: 1,
      tombstone: false,
    };
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      json({ changes: [change], cursor: "4", hasMore: false }),
    );
    const client = new HolyWordApiClient({ baseUrl: "https://api.test", fetch: fetchMock });

    await expect(client.pull(0, 50)).resolves.toEqual({
      changes: [change],
      cursor: "4",
      hasMore: false,
    });
    expect(fetchMock.mock.calls[0]![0]).toBe("https://api.test/v1/sync/pull?cursor=0&limit=50");

    const invalid = new HolyWordApiClient({
      baseUrl: "https://api.test",
      fetch: async () => json({ changes: [{ entity: "bookmark" }], cursor: "1", hasMore: false }),
    });
    await expect(invalid.pull(0)).rejects.toThrow();
  });

  it("surfaces structured API errors and empty 204 responses", async () => {
    const failing = new HolyWordApiClient({
      baseUrl: "https://api.test",
      fetch: async (_url: string, _init?: RequestInit) =>
        json({ code: "version-disabled", message: "This version is not available" }, 403),
    });
    await expect(failing.listVersions()).rejects.toMatchObject({
      name: "ApiClientError",
      status: 403,
      code: "version-disabled",
      message: "This version is not available",
    });
    await expect(failing.deleteSession()).rejects.toBeInstanceOf(ApiClientError);

    const empty = new HolyWordApiClient({
      baseUrl: "https://api.test",
      fetch: async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }),
    });
    await expect(empty.deleteSession()).resolves.toBeUndefined();
  });
});
