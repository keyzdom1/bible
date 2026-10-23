import { describe, expect, it } from "vitest";
import { DownloadManager, DownloadPausedError, type FetchLike } from "../src/download/manager";
import { PackageVerificationError } from "../src/download/verification";
import type { DownloadProgress, DownloadTicket } from "../src/types";
import { buildTestPackage, MemoryDownloadStore } from "./fixtures";

const NOW = Date.parse("2026-01-01T00:00:00.000Z");

interface TestServer {
  readonly fetch: FetchLike;
  readonly calls: number;
  readonly ranges: (string | undefined)[];
}

function ticketFor(checksum: string, overrides: Partial<DownloadTicket> = {}): DownloadTicket {
  return {
    url: "https://content.test/packages/test/1/package.zip",
    manifestUrl: "https://content.test/packages/test/1/manifest.json",
    expiresAt: "2026-01-01T01:00:00.000Z",
    packageVersion: 1,
    checksum,
    ...overrides,
  };
}

function serverFor(
  archive: Uint8Array,
  options: {
    readonly interruptFirst?: boolean;
    readonly failFirst?: boolean;
    readonly slow?: boolean;
    readonly signal?: AbortSignal;
  } = {},
): TestServer {
  const calls = { count: 0 };
  const ranges: (string | undefined)[] = [];
  const fetchImpl: FetchLike = async (_url, init) => {
    calls.count += 1;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    ranges.push(headers.Range);
    if (options.failFirst && calls.count === 1) {
      return new Response("temporary", { status: 503 });
    }
    let start = 0;
    const match = /^bytes=(\d+)-$/.exec(headers.Range ?? "");
    if (match) start = Number(match[1]);
    const body = archive.slice(start);
    const responseHeaders: Record<string, string> = {
      "content-length": String(body.byteLength),
      "content-range": `bytes ${start}-${archive.byteLength - 1}/${archive.byteLength}`,
      etag: '"test-etag"',
    };
    if (options.interruptFirst && calls.count === 1) {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(body.slice(0, Math.min(100, body.byteLength)));
          setTimeout(() => controller.error(new Error("connection reset")), 5);
        },
      });
      return new Response(stream, {
        status: start > 0 ? 206 : 200,
        headers: responseHeaders,
      });
    }
    if (options.slow) {
      let sent = 0;
      let aborted = false;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          init?.signal?.addEventListener(
            "abort",
            () => {
              aborted = true;
              controller.error(new Error("aborted"));
            },
            { once: true },
          );
          const push = () => {
            if (aborted) return;
            if (sent >= body.byteLength) {
              controller.close();
              return;
            }
            const part = body.slice(sent, sent + 16);
            sent += part.byteLength;
            controller.enqueue(part);
            setTimeout(push, 5);
          };
          setTimeout(push, 5);
        },
      });
      return new Response(stream, {
        status: start > 0 ? 206 : 200,
        headers: responseHeaders,
      });
    }
    return new Response(body, {
      status: start > 0 ? 206 : 200,
      headers: responseHeaders,
    });
  };
  return {
    fetch: fetchImpl,
    get calls() {
      return calls.count;
    },
    ranges,
  };
}

function manager(
  store: MemoryDownloadStore,
  ticket: DownloadTicket,
  fetchImpl: FetchLike,
  onProgress?: (progress: DownloadProgress) => void,
): DownloadManager {
  return new DownloadManager({
    store,
    tickets: async () => ticket,
    fetch: fetchImpl,
    chunkSize: 32,
    retryAttempts: 3,
    retryDelayMs: 1,
    sleep: async () => undefined,
    now: () => new Date(NOW),
    ...(onProgress ? { onProgress } : {}),
  });
}

describe("resumable download manager", () => {
  it("retries a dropped connection from the last contiguous byte using Range", async () => {
    const pkg = buildTestPackage();
    expect(pkg.archive.byteLength).toBeGreaterThan(200);
    const store = new MemoryDownloadStore();
    const server = serverFor(pkg.archive, { interruptFirst: true });
    const download = manager(store, ticketFor(pkg.checksum), server.fetch);
    const result = await download.download("test");
    expect(result.archive).toEqual(pkg.archive);
    expect(server.calls).toBeGreaterThanOrEqual(2);
    expect(server.ranges[0]).toBeUndefined();
    expect(server.ranges[1]).toMatch(/^bytes=\d+-$/);
    const resumedAt = Number(/^bytes=(\d+)-$/.exec(server.ranges[1]!)![1]);
    expect(resumedAt).toBeGreaterThan(0);
    expect(resumedAt % 32).toBe(0);
    expect((await store.getDownload("test"))?.status).toBe("complete");
  });

  it("pauses, persists partial bytes and resumes with a fresh ticket", async () => {
    const pkg = buildTestPackage();
    const store = new MemoryDownloadStore();
    const server = serverFor(pkg.archive, { slow: true });
    const observed: number[] = [];
    const download = manager(store, ticketFor(pkg.checksum), server.fetch, (progress) => {
      observed.push(progress.receivedBytes);
    });
    const running = download.download("test");
    await new Promise<void>((resolve, reject) => {
      const started = Date.now();
      const timer = setInterval(() => {
        if (observed.some((bytes) => bytes >= 64)) {
          clearInterval(timer);
          resolve();
        } else if (Date.now() - started > 3000) {
          clearInterval(timer);
          reject(new Error("download did not start"));
        }
      }, 5);
    });
    await download.pause("test");
    await expect(running).rejects.toBeInstanceOf(DownloadPausedError);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const paused = await store.getDownload("test");
    expect(paused?.status).toBe("paused");
    expect(paused?.received_bytes).toBeGreaterThan(0);
    const chunks = await store.listChunks("test");
    expect(chunks.length).toBeGreaterThan(0);

    const resumed = serverFor(pkg.archive);
    const resumedDownload = manager(store, ticketFor(pkg.checksum), resumed.fetch);
    const result = await resumedDownload.download("test");
    expect(result.archive).toEqual(pkg.archive);
    expect(resumed.ranges[0]).toMatch(/^bytes=\d+-$/);
    expect(Number(/^bytes=(\d+)-$/.exec(resumed.ranges[0]!)![1])).toBe(paused?.received_bytes);
  });

  it("retries transient HTTP failures with exponential backoff", async () => {
    const pkg = buildTestPackage();
    const store = new MemoryDownloadStore();
    const server = serverFor(pkg.archive, { failFirst: true });
    const download = manager(store, ticketFor(pkg.checksum), server.fetch);
    const result = await download.download("test");
    expect(result.archive).toEqual(pkg.archive);
    expect(server.calls).toBe(2);
  });

  it("fails checksum verification, records the error and discards bad bytes", async () => {
    const pkg = buildTestPackage();
    const store = new MemoryDownloadStore();
    const server = serverFor(pkg.archive);
    const download = manager(store, ticketFor("f".repeat(64)), server.fetch);
    await expect(download.download("test")).rejects.toBeInstanceOf(PackageVerificationError);
    const checkpoint = await store.getDownload("test");
    expect(checkpoint).toMatchObject({
      status: "error",
      error_code: "manifest-checksum",
    });
    expect(await store.listChunks("test")).toEqual([]);
    expect(server.calls).toBe(1);
  });

  it("resumes a complete checkpoint without downloading bytes again", async () => {
    const pkg = buildTestPackage();
    const store = new MemoryDownloadStore();
    const firstServer = serverFor(pkg.archive);
    const first = manager(store, ticketFor(pkg.checksum), firstServer.fetch);
    await first.download("test");
    const secondServer = serverFor(pkg.archive);
    const second = manager(store, ticketFor(pkg.checksum), secondServer.fetch);
    const result = await second.download("test");
    expect(result.archive).toEqual(pkg.archive);
    expect(secondServer.calls).toBe(0);
  });
});
