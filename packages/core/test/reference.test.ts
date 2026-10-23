import { describe, expect, it } from "vitest";
import {
  formatReference,
  formatReferenceList,
  parseReference,
  parseReferenceList,
  ReferenceParseError,
  tryParseReference,
  type Reference,
} from "../src/reference";

function parse(input: string): Reference {
  return parseReference(input);
}

describe("parseReference", () => {
  it("parses a verse", () => {
    expect(parse("John 3:16")).toEqual({
      type: "verse",
      book: "JHN",
      chapter: 3,
      verse: 16,
      raw: "John 3:16",
    });
  });

  it("parses shorthand books", () => {
    expect(parse("Jn 3:16")).toMatchObject({ book: "JHN", chapter: 3, verse: 16 });
    expect(parse("Ps 119:105")).toMatchObject({ book: "PSA", chapter: 119, verse: 105 });
    expect(parse("1 Cor 13:4")).toMatchObject({ book: "1CO", chapter: 13, verse: 4 });
    expect(parse("JHN.3.16")).toMatchObject({ book: "JHN", chapter: 3, verse: 16 });
  });

  it("parses numbered and ordinal book names", () => {
    expect(parse("1 John 2:3")).toMatchObject({ book: "1JN", chapter: 2, verse: 3 });
    expect(parse("I John 2:3")).toMatchObject({ book: "1JN" });
    expect(parse("First John 2:3")).toMatchObject({ book: "1JN" });
    expect(parse("III John 1:2")).toMatchObject({ book: "3JN" });
    expect(parse("2 Thessalonians 3:16")).toMatchObject({ book: "2TH" });
  });

  it("keeps Jude, Judges, Philippians and Philemon apart", () => {
    expect(parse("Jude 3")).toMatchObject({ book: "JUD", chapter: 1, verse: 3 });
    expect(parse("Judges 3")).toMatchObject({ book: "JDG", chapter: 3 });
    expect(parse("Phil 4:13")).toMatchObject({ book: "PHP" });
    expect(parse("Philemon 1:1")).toMatchObject({ book: "PHM", chapter: 1, verse: 1 });
  });

  it("treats bare numbers in single-chapter books as verses", () => {
    expect(parse("Jude 3")).toMatchObject({ type: "verse", chapter: 1, verse: 3 });
    expect(parse("Jude 3-4")).toMatchObject({
      type: "verse-range",
      start: { chapter: 1, verse: 3 },
      end: { chapter: 1, verse: 4 },
    });
    expect(parse("Philemon 1")).toMatchObject({ type: "verse", chapter: 1, verse: 1 });
    expect(parse("3 John 1")).toMatchObject({ type: "verse", book: "3JN", verse: 1 });
  });

  it("parses chapters, chapter ranges and whole books", () => {
    expect(parse("John 3")).toEqual({ type: "chapter", book: "JHN", chapter: 3, raw: "John 3" });
    expect(parse("John 3-4")).toMatchObject({
      type: "chapter-range",
      startChapter: 3,
      endChapter: 4,
    });
    expect(parse("Genesis")).toEqual({ type: "book", book: "GEN", raw: "Genesis" });
    expect(parse("Song of Songs 1")).toMatchObject({ book: "SNG", chapter: 1 });
  });

  it("parses verse ranges within and across chapters", () => {
    expect(parse("Jn 3:16-18")).toEqual({
      type: "verse-range",
      book: "JHN",
      start: { chapter: 3, verse: 16 },
      end: { chapter: 3, verse: 18 },
      raw: "Jn 3:16-18",
    });
    expect(parse("Genesis 1:1-2:3")).toMatchObject({
      type: "verse-range",
      start: { chapter: 1, verse: 1 },
      end: { chapter: 2, verse: 3 },
    });
  });

  it("normalizes dashes, spacing and dotted separators", () => {
    expect(parse("John 3:16–18")).toMatchObject({ start: { verse: 16 }, end: { verse: 18 } });
    expect(parse("  john   3 : 16 ")).toMatchObject({ book: "JHN", verse: 16 });
    expect(parse("Gen. 1.1")).toMatchObject({ book: "GEN", chapter: 1, verse: 1 });
  });

  it("strips common verse suffixes", () => {
    expect(parse("John 3:16ff")).toMatchObject({ verse: 16 });
    expect(parse("John 3:16a")).toMatchObject({ verse: 16 });
  });

  it("rejects lists in parseReference", () => {
    expect(() => parse("John 3:16,18")).toThrowError(ReferenceParseError);
    expect(() => parse("John 3; Psalm 23")).toThrowError(/parseReferenceList/);
  });

  it("rejects invalid input with specific codes", () => {
    const cases: Array<[string, string]> = [
      ["", "empty"],
      ["Hezekiah 1:1", "unknown-book"],
      ["John 22", "invalid-chapter"],
      ["Genesis 51:1", "invalid-chapter"],
      ["John 3:0", "invalid-verse"],
      ["John 3:18-16", "invalid-range"],
      ["John 3-2", "invalid-range"],
      ["John three", "not-single-reference"],
    ];
    for (const [input, code] of cases) {
      try {
        parse(input);
        throw new Error(`Expected "${input}" to fail`);
      } catch (error) {
        expect(error, input).toBeInstanceOf(ReferenceParseError);
        expect((error as ReferenceParseError).code, input).toBe(code);
      }
    }
  });

  it("provides a non-throwing variant", () => {
    expect(tryParseReference("John 3:16")?.type).toBe("verse");
    expect(tryParseReference("Nope 1:1")).toBeUndefined();
  });
});

describe("parseReferenceList", () => {
  it("inherits chapter for comma-separated verses", () => {
    const refs = parseReferenceList("John 3:16,18");
    expect(refs.map((ref) => formatReference(ref))).toEqual(["John 3:16", "John 3:18"]);
  });

  it("inherits book for chapters", () => {
    const refs = parseReferenceList("John 3,4");
    expect(refs.map((ref) => formatReference(ref))).toEqual(["John 3", "John 4"]);
  });

  it("handles semicolon-separated references", () => {
    const refs = parseReferenceList("Ps 23; John 3:16; 1 John 2:3-4");
    expect(refs.map((ref) => ref.book)).toEqual(["PSA", "JHN", "1JN"]);
  });

  it("rejects empty segments", () => {
    expect(() => parseReferenceList("John 3;;")).toThrowError(ReferenceParseError);
  });
});

describe("formatReference", () => {
  it("round-trips every reference type", () => {
    const inputs = ["Genesis", "John 3", "John 3-4", "John 3:16", "Jn 3:16-18", "Genesis 1:1-2:3"];
    for (const input of inputs) {
      expect(formatReference(parse(input))).toBe(input.startsWith("Jn") ? "John 3:16-18" : input);
    }
  });

  it("uses short names when requested", () => {
    expect(formatReference(parse("John 3:16"), { short: true })).toBe("John 3:16");
    expect(formatReference(parse("Genesis 1:1"), { short: true })).toBe("Gen 1:1");
    expect(formatReference(parse("Ps 23"), { short: true })).toBe("Ps 23");
  });

  it("formats lists", () => {
    expect(formatReferenceList(parseReferenceList("John 3:16,18"))).toBe("John 3:16; John 3:18");
  });
});
