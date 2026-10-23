import { describe, expect, it } from "vitest";
import { highlightSegments } from "../src/lib/highlight";

describe("highlightSegments", () => {
  it("marks case-insensitive matches without HTML", () => {
    const segments = highlightSegments("For God so loved the world", "god");
    expect(segments.filter((segment) => segment.match).map((segment) => segment.text)).toEqual([
      "God",
    ]);
    expect(segments.map((segment) => segment.text).join("")).toBe("For God so loved the world");
  });

  it("handles phrases and quoted searches", () => {
    const segments = highlightSegments("The Lord is my shepherd", '"the lord"');
    expect(segments.find((segment) => segment.match)?.text).toBe("The Lord");
  });

  it("returns the source text when the query is empty", () => {
    expect(highlightSegments("John 3:16", "   ")).toEqual([{ text: "John 3:16", match: false }]);
  });

  it("treats regular-expression characters literally", () => {
    const segments = highlightSegments("A (b) c", "(b)");
    expect(segments.find((segment) => segment.match)?.text).toBe("(b)");
  });
});
