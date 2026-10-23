import {
  createClock,
  formatHlc,
  parseHlc,
  receive,
  tick,
  type HybridLogicalClock,
} from "@holyword/core";

export interface ClockStateStore {
  getState(key: string): Promise<string | undefined>;
  setState(key: string, value: string): Promise<void>;
}

export type IdGenerator = () => string;

const HLC_STATE_KEY = "hlc";

function fallbackUuid(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  throw new Error("No secure random source is available");
}

export function randomUuid(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return fallbackUuid();
}

/**
 * Device identifiers are UUIDs (36 characters), while the sync protocol's HLC
 * node id is limited to 32 characters. Removing the UUID separators keeps the
 * id stable and unique without exceeding the protocol limit.
 */
export function normalizeHlcNodeId(nodeId: string): string {
  const compact = nodeId.trim().replaceAll("-", "");
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(compact)) {
    throw new RangeError(`Invalid HLC node id: ${nodeId}`);
  }
  return compact;
}

/**
 * Serialises local events through one HLC and persists the result. Loading and
 * advancing are chained so concurrent queue writes cannot reuse a timestamp.
 */
export class PersistentHybridClock {
  private clock: HybridLogicalClock | undefined;
  private chain: Promise<unknown> = Promise.resolve();
  private readonly nodeId: string;

  constructor(
    private readonly store: ClockStateStore,
    nodeId: string,
    private readonly now: () => number = Date.now,
  ) {
    this.nodeId = normalizeHlcNodeId(nodeId);
  }

  next(): Promise<string> {
    return this.exclusive(async () => {
      const current = await this.load();
      const advanced = tick(current, this.now());
      await this.save(advanced);
      return formatHlc(advanced);
    });
  }

  observe(remoteHlc: string): Promise<void> {
    return this.exclusive(async () => {
      const current = await this.load();
      const advanced = receive(current, parseHlc(remoteHlc), this.now());
      await this.save(advanced);
    });
  }

  private async load(): Promise<HybridLogicalClock> {
    if (this.clock) return this.clock;
    const stored = await this.store.getState(HLC_STATE_KEY);
    this.clock = stored ? parseHlc(stored) : createClock(this.nodeId, this.now());
    return this.clock;
  }

  private async save(clock: HybridLogicalClock): Promise<void> {
    this.clock = clock;
    await this.store.setState(HLC_STATE_KEY, formatHlc(clock));
  }

  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.chain.then(task, task);
    this.chain = run.catch(() => undefined);
    return run;
  }
}
