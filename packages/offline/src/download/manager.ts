import { verifyManifestChecksum, PackageVerificationError } from "./verification";
import type {
  DownloadCheckpoint,
  DownloadChunk,
  DownloadProgress,
  DownloadStore,
  DownloadTicket,
  DownloadedPackage,
} from "../types";

export type TicketProvider = (versionId: string) => Promise<DownloadTicket>;
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface DownloadManagerOptions {
  readonly store: DownloadStore;
  readonly tickets: TicketProvider;
  readonly fetch?: FetchLike;
  readonly chunkSize?: number;
  readonly retryAttempts?: number;
  readonly retryDelayMs?: number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly now?: () => Date;
  readonly onProgress?: (progress: DownloadProgress) => void;
}

export class DownloadPausedError extends Error {
  constructor(readonly versionId: string) {
    super(`Download of ${versionId} is paused`);
    this.name = "DownloadPausedError";
  }
}

export class DownloadError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "DownloadError";
  }
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function contiguousBytes(chunks: readonly DownloadChunk[]): {
  bytes: Uint8Array;
  contiguous: boolean;
} {
  const sorted = [...chunks].sort((a, b) => a.offset - b.offset);
  let expected = 0;
  const parts: Uint8Array[] = [];
  for (const chunk of sorted) {
    if (chunk.offset !== expected) return { bytes: new Uint8Array(0), contiguous: false };
    parts.push(chunk.bytes);
    expected += chunk.bytes.byteLength;
  }
  const bytes = new Uint8Array(expected);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return { bytes, contiguous: true };
}

function parseContentRange(value: string | null): { start: number; total: number | null } | null {
  if (!value) return null;
  const match = /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i.exec(value.trim());
  if (!match) return null;
  return {
    start: Number(match[1]),
    total: match[3] === "*" ? null : Number(match[3]),
  };
}

/**
 * Resumable, checksum-verified package downloader. Partial bytes are written to
 * the local download store, so an interrupted download continues from the last
 * contiguous byte instead of restarting.
 */
export class DownloadManager {
  private readonly store: DownloadStore;
  private readonly tickets: TicketProvider;
  private readonly fetchImpl: FetchLike;
  private readonly chunkSize: number;
  private readonly retryAttempts: number;
  private readonly retryDelayMs: number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly now: () => Date;
  private readonly onProgress: ((progress: DownloadProgress) => void) | undefined;
  private readonly active = new Map<
    string,
    { controller: AbortController; promise: Promise<DownloadedPackage> }
  >();
  private readonly paused = new Set<string>();

  constructor(options: DownloadManagerOptions) {
    this.store = options.store;
    this.tickets = options.tickets;
    this.fetchImpl = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.chunkSize = options.chunkSize ?? 512 * 1024;
    this.retryAttempts = options.retryAttempts ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 500;
    this.sleep = options.sleep ?? defaultSleep;
    this.now = options.now ?? (() => new Date());
    this.onProgress = options.onProgress;
  }

  async download(
    versionId: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<DownloadedPackage> {
    const existing = this.active.get(versionId);
    if (existing) return existing.promise;

    const controller = new AbortController();
    const onAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onAbort, { once: true });
    const promise = this.run(versionId, controller).finally(() => {
      options.signal?.removeEventListener("abort", onAbort);
      this.active.delete(versionId);
      this.paused.delete(versionId);
    });
    this.active.set(versionId, { controller, promise });
    return promise;
  }

  async pause(versionId: string): Promise<void> {
    this.paused.add(versionId);
    const active = this.active.get(versionId);
    if (active) {
      active.controller.abort();
      return;
    }
    const checkpoint = await this.store.getDownload(versionId);
    if (checkpoint && checkpoint.status !== "complete") {
      const paused: DownloadCheckpoint = {
        ...checkpoint,
        status: "paused",
        error_code: null,
        error_message: null,
        updated_at: this.now().toISOString(),
      };
      await this.store.putDownload(paused);
      this.emit(paused);
    }
  }

  async clear(versionId: string): Promise<void> {
    await this.store.deleteChunks(versionId);
    await this.store.deleteDownload(versionId);
  }

  async getProgress(versionId: string): Promise<DownloadProgress> {
    const checkpoint = await this.store.getDownload(versionId);
    return this.progressFrom(checkpoint, versionId);
  }

  private async run(versionId: string, controller: AbortController): Promise<DownloadedPackage> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.retryAttempts; attempt += 1) {
      try {
        return await this.attempt(versionId, controller.signal);
      } catch (error) {
        lastError = error;
        if (this.paused.has(versionId) || controller.signal.aborted) {
          const checkpoint = await this.store.getDownload(versionId);
          if (checkpoint && checkpoint.status !== "complete") {
            const paused: DownloadCheckpoint = {
              ...checkpoint,
              status: "paused",
              error_code: null,
              error_message: null,
              updated_at: this.now().toISOString(),
            };
            await this.store.putDownload(paused);
            this.emit(paused);
          }
          throw new DownloadPausedError(versionId);
        }

        if (error instanceof PackageVerificationError) {
          await this.store.deleteChunks(versionId);
          await this.recordError(versionId, error.code, error.message);
          throw error;
        }

        const retryable =
          error instanceof DownloadError
            ? error.retryable
            : error instanceof TypeError || error instanceof Error;
        if (!retryable || attempt === this.retryAttempts) {
          const code = error instanceof DownloadError ? error.code : "download-failed";
          const message = error instanceof Error ? error.message : String(error);
          await this.recordError(versionId, code, message);
          throw error;
        }
        await this.sleep(this.retryDelayMs * 2 ** (attempt - 1));
      }
    }
    throw lastError;
  }

  private async attempt(versionId: string, signal: AbortSignal): Promise<DownloadedPackage> {
    if (signal.aborted) throw new DownloadPausedError(versionId);

    let checkpoint = await this.store.getDownload(versionId);
    let chunks = await this.store.listChunks(versionId);
    let joined = contiguousBytes(chunks);
    if (!joined.contiguous) {
      await this.store.deleteChunks(versionId);
      chunks = [];
      joined = { bytes: new Uint8Array(0), contiguous: true };
    }

    const ticket = await this.tickets(versionId);
    const expiresAt = new Date(ticket.expiresAt).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= this.now().getTime()) {
      throw new DownloadError("ticket-expired", "The download ticket has expired", true);
    }
    if (
      checkpoint &&
      (checkpoint.version_code !== ticket.packageVersion || checkpoint.checksum !== ticket.checksum)
    ) {
      await this.clear(versionId);
      checkpoint = undefined;
      chunks = [];
      joined = { bytes: new Uint8Array(0), contiguous: true };
    }

    let offset = joined.bytes.byteLength;
    let total = checkpoint?.total_bytes ?? null;
    if (total !== null && offset > total) {
      await this.store.deleteChunks(versionId);
      offset = 0;
      chunks = [];
      joined = { bytes: new Uint8Array(0), contiguous: true };
      total = null;
    }

    if (checkpoint?.status === "complete" && total !== null && offset === total) {
      return this.finish(versionId, ticket, joined.bytes, total);
    }

    const headers: Record<string, string> = {};
    if (offset > 0) {
      headers.Range = `bytes=${offset}-`;
      if (checkpoint?.etag) headers["If-Range"] = checkpoint.etag;
      else if (checkpoint?.last_modified) headers["If-Range"] = checkpoint.last_modified;
    }

    const response = await this.fetchImpl(ticket.url, { headers, signal });
    if (response.status === 401 || response.status === 403 || response.status === 410) {
      throw new DownloadError(
        "ticket-rejected",
        `The content server rejected the download ticket (HTTP ${response.status})`,
        true,
      );
    }
    if (response.status === 416 && offset > 0) {
      await this.store.deleteChunks(versionId);
      throw new DownloadError(
        "range-rejected",
        "The content server rejected the resume range; restarting",
        true,
      );
    }
    if (!response.ok) {
      throw new DownloadError(
        "http-error",
        `Package download failed with HTTP ${response.status}`,
        response.status >= 500 || response.status === 408 || response.status === 429,
      );
    }

    if (response.status === 200 && offset > 0) {
      await this.store.deleteChunks(versionId);
      offset = 0;
      total = null;
      joined = { bytes: new Uint8Array(0), contiguous: true };
    }

    if (response.status === 206) {
      const range = parseContentRange(response.headers.get("content-range"));
      if (!range || range.start !== offset) {
        await this.store.deleteChunks(versionId);
        throw new DownloadError(
          "invalid-range",
          "The content server returned an unexpected byte range",
          true,
        );
      }
      total = range.total ?? total;
    } else {
      const length = response.headers.get("content-length");
      if (length && /^\d+$/.test(length)) total = offset + Number(length);
    }

    const etag = response.headers.get("etag");
    const lastModified = response.headers.get("last-modified");
    checkpoint = {
      version_id: versionId,
      version_code: ticket.packageVersion,
      checksum: ticket.checksum,
      status: "downloading",
      received_bytes: offset,
      total_bytes: total,
      etag: etag ?? checkpoint?.etag ?? null,
      last_modified: lastModified ?? checkpoint?.last_modified ?? null,
      error_code: null,
      error_message: null,
      updated_at: this.now().toISOString(),
    };
    await this.store.putDownload(checkpoint);
    this.emit(checkpoint);

    if (!response.body) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      await this.store.putChunk({ version_id: versionId, offset, bytes });
      offset += bytes.byteLength;
    } else {
      const reader = response.body.getReader();
      let pending = new Uint8Array(0);
      let writeOffset = offset;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value || value.byteLength === 0) continue;
        if (signal.aborted) {
          await reader.cancel();
          throw new DownloadPausedError(versionId);
        }
        const merged = new Uint8Array(pending.byteLength + value.byteLength);
        merged.set(pending);
        merged.set(value, pending.byteLength);
        pending = merged;
        while (pending.byteLength >= this.chunkSize) {
          const part = pending.slice(0, this.chunkSize);
          await this.store.putChunk({ version_id: versionId, offset: writeOffset, bytes: part });
          writeOffset += part.byteLength;
          pending = pending.slice(this.chunkSize);
          checkpoint = {
            ...checkpoint,
            received_bytes: writeOffset,
            total_bytes: total,
            updated_at: this.now().toISOString(),
          };
          await this.store.putDownload(checkpoint);
          this.emit(checkpoint);
        }
      }
      if (pending.byteLength > 0) {
        await this.store.putChunk({ version_id: versionId, offset: writeOffset, bytes: pending });
        writeOffset += pending.byteLength;
      }
      offset = writeOffset;
      if (!total) total = offset;
    }

    if (!total) total = offset;
    if (offset !== total) {
      throw new DownloadError(
        "incomplete",
        `The download ended at ${offset} of ${total} bytes`,
        true,
      );
    }

    const finalChunks = await this.store.listChunks(versionId);
    joined = contiguousBytes(finalChunks);
    if (!joined.contiguous || joined.bytes.byteLength !== total) {
      throw new DownloadError("chunks-missing", "The downloaded byte range has gaps", true);
    }

    checkpoint = {
      ...checkpoint,
      status: "verifying",
      received_bytes: offset,
      total_bytes: total,
      updated_at: this.now().toISOString(),
    };
    await this.store.putDownload(checkpoint);
    this.emit(checkpoint);
    return this.finish(versionId, ticket, joined.bytes, total);
  }

  private async finish(
    versionId: string,
    ticket: DownloadTicket,
    archive: Uint8Array,
    total: number,
  ): Promise<DownloadedPackage> {
    const manifest = verifyManifestChecksum(archive, ticket.checksum);
    if (manifest.versionId !== versionId || manifest.versionCode !== ticket.packageVersion) {
      throw new PackageVerificationError(
        "version-mismatch",
        "The downloaded manifest does not match the requested version",
      );
    }
    const complete: DownloadCheckpoint = {
      version_id: versionId,
      version_code: ticket.packageVersion,
      checksum: ticket.checksum,
      status: "complete",
      received_bytes: total,
      total_bytes: total,
      etag: null,
      last_modified: null,
      error_code: null,
      error_message: null,
      updated_at: this.now().toISOString(),
    };
    await this.store.putDownload(complete);
    this.emit(complete);
    return {
      versionId,
      versionCode: ticket.packageVersion,
      checksum: ticket.checksum,
      archive,
      downloadedBytes: total,
    };
  }

  private async recordError(versionId: string, code: string, message: string): Promise<void> {
    const checkpoint = await this.store.getDownload(versionId);
    const failed: DownloadCheckpoint = {
      version_id: versionId,
      version_code: checkpoint?.version_code ?? 0,
      checksum: checkpoint?.checksum ?? "",
      status: "error",
      received_bytes: checkpoint?.received_bytes ?? 0,
      total_bytes: checkpoint?.total_bytes ?? null,
      etag: checkpoint?.etag ?? null,
      last_modified: checkpoint?.last_modified ?? null,
      error_code: code,
      error_message: message,
      updated_at: this.now().toISOString(),
    };
    await this.store.putDownload(failed);
    this.emit(failed);
  }

  private progressFrom(
    checkpoint: DownloadCheckpoint | undefined,
    versionId = checkpoint?.version_id ?? "",
  ): DownloadProgress {
    if (!checkpoint) {
      return {
        versionId,
        status: "paused",
        receivedBytes: 0,
        totalBytes: null,
        fraction: null,
        error: null,
      };
    }
    return {
      versionId: checkpoint.version_id,
      status: checkpoint.status,
      receivedBytes: checkpoint.received_bytes,
      totalBytes: checkpoint.total_bytes,
      fraction:
        checkpoint.total_bytes && checkpoint.total_bytes > 0
          ? checkpoint.received_bytes / checkpoint.total_bytes
          : null,
      error: checkpoint.error_message,
    };
  }

  private emit(checkpoint: DownloadCheckpoint): void {
    this.onProgress?.(this.progressFrom(checkpoint));
  }
}
