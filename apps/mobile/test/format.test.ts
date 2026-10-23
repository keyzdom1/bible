import { describe, expect, it } from "vitest";
import {
  adjacentChapter,
  formatBytes,
  formatRelativeTime,
  highlightSegments,
  referenceLabel,
  referenceTarget,
  verseReference,
} from "../src/lib/format";

describe("mobile reader navigation", () => {
  it("crosses chapter and book boundaries", () => {
    expect(adjacentChapter("GEN", 1, 1)).toEqual({ book: "GEN", chapter: 2 });
    expect(adjacentChapter("GEN", 50, 1)).toEqual({ book: "EXO", chapter: 1 });
    expect(adjacentChapter("EXO", 1, -1)).toEqual({ book: "GEN", chapter: 50 });
    expect(adjacentChapter("GEN", 1, -1)).toBeNull();
    expect(adjacentChapter("REV", 22, 1)).toBeNull();
  });

  it("formats verse references", () => {
    expect(referenceLabel("JHN", 3, 16)).toBe("John 3:16");
    expect(verseReference("PSA.23.1")).toBe("Psalms 23:1");
  });
});

describe("reference navigation", () => {
  it("turns references into reader targets", () => {
    expect(referenceTarget("John 3:16")).toEqual({
      book: "JHN",
      chapter: 3,
      verse: 16,
    });
    expect(referenceTarget("Psalm 23")).toEqual({ book: "PSA", chapter: 23 });
    expect(referenceTarget("not a reference")).toBeNull();
  });
});

describe("search highlighting", () => {
  it("preserves text and marks case-insensitive matches", () => {
    const segments = highlightSegments("For God so loved the world", "god");
    expect(segments.filter((segment) => segment.match).map((segment) => segment.text)).toEqual([
      "God",
    ]);
    expect(segments.map((segment) => segment.text).join("")).toBe("For God so loved the world");
  });

  it("treats punctuation literally", () => {
    expect(highlightSegments("A (b) c", "(b)").find((segment) => segment.match)?.text).toBe("(b)");
  });
});

describe("display formatting", () => {
  it("formats bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(2 * 1024 * 1024)).toBe("2.0 MB");
  });

  it("handles relative time", () => {
    expect(formatRelativeTime(null)).toBe("Not yet");
    expect(formatRelativeTime(new Date().toISOString())).toBe("Just now");
    expect(formatRelativeTime("invalid")).toBe("Unknown");
  });
});
