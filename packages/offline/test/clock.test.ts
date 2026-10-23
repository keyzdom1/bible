import { describe, expect, it } from "vitest";
import { parseHlc } from "@holyword/core";
import { normalizeHlcNodeId, PersistentHybridClock } from "../src/clock";

function memoryStore() {
  const values = new Map<string, string>();
  return {
    getState: (key: string) => Promise.resolve(values.get(key)),
    setState: (key: string, value: string) => {
      values.set(key, value);
      return Promise.resolve();
    },
  };
}

describe("persistent hybrid clock", () => {
  it("accepts UUID device ids without exceeding the protocol node-id limit", async () => {
    const deviceId = "24f040c3-5dac-4722-a015-1fdcb4a8d299";
    const clock = new PersistentHybridClock(memoryStore(), deviceId, () => 1_700_000_000_000);

    const value = await clock.next();
    const parsed = parseHlc(value);

    expect(parsed.nodeId).toBe(deviceId.replaceAll("-", ""));
    expect(parsed.nodeId).toHaveLength(32);
    expect(value).toBe("1700000000000:000001:24f040c35dac4722a0151fdcb4a8d299");
  });

  it("rejects node ids that cannot be represented in the sync protocol", () => {
    expect(() => normalizeHlcNodeId("bad node")).toThrow("Invalid HLC node id");
    expect(() => normalizeHlcNodeId("x".repeat(33))).toThrow("Invalid HLC node id");
  });
});
