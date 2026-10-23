import { describe, expect, it } from "vitest";
import {
  compareHlc,
  createClock,
  formatHlc,
  maxClock,
  parseHlc,
  receive,
  tick,
  type HybridLogicalClock,
} from "../src/sync";

const node = "device-a";

describe("hybrid logical clock", () => {
  it("formats as a fixed-width sortable string", () => {
    const value = formatHlc({ wallTime: 1_700_000_000_000, counter: 7, nodeId: node });
    expect(value).toBe("1700000000000:000007:device-a");
    expect(parseHlc(value)).toEqual({ wallTime: 1_700_000_000_000, counter: 7, nodeId: node });
  });

  it("orders strings lexicographically in clock order", () => {
    const a = { wallTime: 1_700_000_000_000, counter: 0, nodeId: node };
    const b = { wallTime: 1_700_000_000_001, counter: 0, nodeId: node };
    const c = { wallTime: 1_700_000_000_001, counter: 1, nodeId: node };
    const values = [c, a, b].map(formatHlc).sort();
    expect(values).toEqual([a, b, c].map(formatHlc));
    expect(compareHlc(a, b)).toBeLessThan(0);
    expect(compareHlc(c, b)).toBeGreaterThan(0);
  });

  it("advances on local events and never goes backwards", () => {
    const clock = createClock(node, 1000);
    expect(tick(clock, 2000)).toEqual({ wallTime: 2000, counter: 0, nodeId: node });
    expect(tick(clock, 1000)).toEqual({ wallTime: 1000, counter: 1, nodeId: node });
    expect(tick(clock, 500)).toEqual({ wallTime: 1000, counter: 1, nodeId: node });
  });

  it("merges remote clocks", () => {
    const local = { wallTime: 1000, counter: 4, nodeId: node };
    const remoteAhead = { wallTime: 2000, counter: 2, nodeId: "device-b" };
    expect(receive(local, remoteAhead, 1500)).toEqual({
      wallTime: 2000,
      counter: 3,
      nodeId: node,
    });

    const sameWall = { wallTime: 1000, counter: 9, nodeId: "device-b" };
    expect(receive(local, sameWall, 500)).toEqual({
      wallTime: 1000,
      counter: 10,
      nodeId: node,
    });

    const older = { wallTime: 500, counter: 1, nodeId: "device-b" };
    expect(receive(local, older, 800)).toEqual({
      wallTime: 1000,
      counter: 5,
      nodeId: node,
    });
  });

  it("keeps clocks monotonic across ticks and receives", () => {
    let clock: HybridLogicalClock = createClock(node, 0);
    const seen = [clock];
    for (const now of [0, 0, 10, 5, 10, 10, 30]) {
      clock = tick(clock, now);
      seen.push(clock);
    }
    for (let index = 1; index < seen.length; index += 1) {
      expect(compareHlc(seen[index - 1]!, seen[index]!)).toBeLessThan(0);
    }
  });

  it("validates input", () => {
    expect(() => formatHlc({ wallTime: -1, counter: 0, nodeId: node })).toThrow();
    expect(() => formatHlc({ wallTime: 1, counter: 1_000_000, nodeId: node })).toThrow();
    expect(() => formatHlc({ wallTime: 1, counter: 0, nodeId: "bad node" })).toThrow();
    expect(() => parseHlc("nope")).toThrow();
    expect(() => createClock("")).toThrow();
  });

  it("returns the greater clock", () => {
    const a = { wallTime: 1, counter: 0, nodeId: "a" };
    const b = { wallTime: 2, counter: 0, nodeId: "b" };
    expect(maxClock(a, b)).toBe(b);
    expect(maxClock(b, a)).toBe(b);
  });
});
