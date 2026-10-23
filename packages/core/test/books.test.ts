import { describe, expect, it } from "vitest";
import {
  BOOKS,
  CHAPTER_COUNTS,
  getBook,
  getBookByOsisId,
  isBookCode,
  matchBookAtStart,
  normalizeBookToken,
} from "../src/books";

describe("book table", () => {
  it("contains the 66-book Protestant canon with unique codes and orders", () => {
    expect(BOOKS).toHaveLength(66);
    expect(new Set(BOOKS.map((book) => book.code)).size).toBe(66);
    expect(BOOKS.map((book) => book.order)).toEqual(
      Array.from({ length: 66 }, (_, index) => index + 1),
    );
  });

  it("has 1,189 chapters in total", () => {
    const total = Object.values(CHAPTER_COUNTS).reduce((sum, count) => sum + count, 0);
    expect(total).toBe(1189);
  });

  it("resolves codes case-insensitively", () => {
    expect(getBook("jhn")?.name).toBe("John");
    expect(getBook("ROM")?.chapterCount).toBe(16);
    expect(getBook("NOPE")).toBeUndefined();
    expect(isBookCode("GEN")).toBe(true);
    expect(isBookCode("XYZ")).toBe(false);
  });

  it("maps OSIS ids", () => {
    expect(getBookByOsisId("1Cor")?.code).toBe("1CO");
    expect(getBookByOsisId("Ps")?.code).toBe("PSA");
    expect(getBookByOsisId("Rev")?.code).toBe("REV");
    expect(getBookByOsisId("nope")).toBeUndefined();
  });

  it("normalizes tokens for aliases", () => {
    expect(normalizeBookToken("1st John")).toBe("1john");
    expect(normalizeBookToken("Psalm")).toBe("psalm");
    expect(normalizeBookToken("1 Cor.")).toBe("1cor");
  });
});

describe("matchBookAtStart", () => {
  const cases: Array<[string, string, string]> = [
    ["John 3:16", "JHN", " 3:16"],
    ["1 John 2:3", "1JN", " 2:3"],
    ["Jude 3", "JUD", " 3"],
    ["Judges 2", "JDG", " 2"],
    ["Philemon 1", "PHM", " 1"],
    ["Phil 4:13", "PHP", " 4:13"],
    ["Song of Songs 1:1", "SNG", " 1:1"],
    ["Psalm 23", "PSA", " 23"],
    ["1 Corinthians 13", "1CO", " 13"],
    ["Genesis", "GEN", ""],
  ];

  it.each(cases)("matches %s as %s", (input, code, rest) => {
    const match = matchBookAtStart(input);
    expect(match?.book.code).toBe(code);
    expect(match?.rest).toBe(rest);
  });

  it("does not match unknown names", () => {
    expect(matchBookAtStart("Hezekiah 1:1")).toBeUndefined();
  });
});
