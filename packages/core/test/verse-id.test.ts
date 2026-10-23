import { describe, expect, it } from "vitest";
import {
  chapterId,
  compareVerseIds,
  isVerseId,
  parseChapterId,
  parseVerseId,
  parseVerseRangeId,
  sortVerseIds,
  tryParseVerseId,
  verseId,
  verseRangeId,
} from "../src/verse-id";

describe("verse ids", () => {
  it("builds canonical ids", () => {
    expect(verseId("JHN", 3, 16)).toBe("JHN.3.16");
    expect(chapterId("PSA", 119)).toBe("PSA.119");
    expect(verseRangeId("JHN.3.16", "JHN.3.18")).toBe("JHN.3.16..JHN.3.18");
  });

  it("parses ids with book lookup", () => {
    expect(parseVerseId("JHN.3.16")).toEqual({
      id: "JHN.3.16",
      book: "JHN",
      chapter: 3,
      verse: 16,
    });
    expect(parseVerseId("jhn.3.16")).toMatchObject({ id: "JHN.3.16" });
  });

  it("rejects malformed ids", () => {
    const invalid = ["", "JHN", "JHN.3", "JHN.3.16.1", "XYZ.1.1", "JHN.0.1", "JHN.1.0"];
    for (const input of invalid) {
      expect(() => parseVerseId(input), input).toThrow();
      expect(isVerseId(input), input).toBe(false);
    }
  });

  it("rejects chapters beyond the book's chapter count", () => {
    expect(() => parseVerseId("JHN.22.1")).toThrow(/out of range/);
    expect(() => parseChapterId("JHN.22")).toThrow(/out of range/);
    expect(parseChapterId("JHN.21")).toMatchObject({ chapter: 21 });
  });

  it("provides a non-throwing variant", () => {
    expect(tryParseVerseId("JHN.3.16")?.verse).toBe(16);
    expect(tryParseVerseId("bad")).toBeUndefined();
  });

  it("sorts canonically", () => {
    const ids = ["REV.22.21", "GEN.1.1", "JHN.3.16", "JHN.3.2", "1JN.2.1"];
    expect(sortVerseIds(ids)).toEqual(["GEN.1.1", "JHN.3.2", "JHN.3.16", "1JN.2.1", "REV.22.21"]);
    expect(compareVerseIds("JHN.3.16", "JHN.3.16")).toBe(0);
    expect(compareVerseIds("JHN.3.16", "JHN.3.17")).toBeLessThan(0);
  });

  it("parses range ids", () => {
    const range = parseVerseRangeId("JHN.3.16..JHN.3.18");
    expect(range.from.verse).toBe(16);
    expect(range.to.verse).toBe(18);
    expect(() => parseVerseRangeId("JHN.3.16")).toThrow();
  });
});
