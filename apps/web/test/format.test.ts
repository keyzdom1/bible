import { describe, expect, it } from "vitest";
import {
  adjacentChapter,
  formatBytes,
  formatRelativeTime,
  parsePositiveInt,
  referenceLabel,
} from "../src/lib/format";

describe("reader navigation", () => {
  it("moves across chapter and book boundaries", () => {
    expect(adjacentChapter("GEN", 1, 1)).toEqual({ book: "GEN", chapter: 2 });
    expect(adjacentChapter("GEN", 50, 1)).toEqual({ book: "EXO", chapter: 1 });
    expect(adjacentChapter("EXO", 1, -1)).toEqual({ book: "GEN", chapter: 50 });
    expect(adjacentChapter("GEN", 1, -1)).toBeNull();
    expect(adjacentChapter("REV", 22, 1)).toBeNull();
  });

  it("formats references and byte counts", () => {
    expect(referenceLabel("JHN", 3, 16)).toBe("John 3:16");
    expect(referenceLabel("PSA", 23)).toBe("Psalms 23");
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(2 * 1024 * 1024)).toBe("2.0 MB");
  });
});

describe("format helpers", () => {
  it("parses positive integers defensively", () => {
    expect(parsePositiveInt("12", 1)).toBe(12);
    expect(parsePositiveInt("0", 1)).toBe(1);
    expect(parsePositiveInt("-3", 1)).toBe(1);
    expect(parsePositiveInt(null, 7)).toBe(7);
  });

  it("handles relative dates", () => {
    expect(formatRelativeTime(null)).toBe("Not yet");
    expect(formatRelativeTime(new Date().toISOString())).toBe("Just now");
    expect(formatRelativeTime("not-a-date")).toBe("Unknown");
  });
});
