import { describe, expect, it } from "vitest";
import { parseUsfm } from "../src/parsers/usfm";

describe("USFM ingestion", () => {
  it("strips Strong's markup and editorial apparatus while keeping scripture", () => {
    const source = [
      "\\id GEN Genesis",
      "\\h Genesis",
      "\\c 1",
      "\\p",
      '\\v 1 In the \\w beginning|strong="H7225"\\w* God created the \\add heaven\\add*.',
      "\\f + \\fr 1.1 \\ft a translator note\\f*",
      "\\p",
      '\\v 2 And the earth was \\w without|strong="H1961"\\w* form.',
      "\\q1 and the Spirit moved.",
      "\\c 2",
      "\\v 1 Thus the heavens were finished.",
    ].join("\n");

    const parsed = parseUsfm(source, "GEN.usfm");
    expect(parsed?.verses).toEqual([
      {
        book: "GEN",
        chapter: 1,
        verse: 1,
        text: "In the beginning God created the heaven.",
      },
      {
        book: "GEN",
        chapter: 1,
        verse: 2,
        text: "And the earth was without form. and the Spirit moved.",
      },
      {
        book: "GEN",
        chapter: 2,
        verse: 1,
        text: "Thus the heavens were finished.",
      },
    ]);
  });

  it("removes footnotes that span multiple lines", () => {
    const source = [
      "\\id GEN Genesis",
      "\\c 1",
      "\\v 1 The first verse.",
      "\\f + \\fr 1.1 \\ft a note that continues",
      "onto a second line\\f*",
      "\\v 2 The second verse.",
    ].join("\n");

    const parsed = parseUsfm(source);
    expect(parsed?.verses.map((verse) => verse.text)).toEqual([
      "The first verse.",
      "The second verse.",
    ]);
  });

  it("ignores front matter and rejects duplicate verses", () => {
    expect(parseUsfm("\\id FRT Preface\n\\mt Preface\n")).toBeUndefined();
    expect(() => parseUsfm("\\id GEN Genesis\n\\c 1\n\\v 1 First.\n\\v 1 Again.\n")).toThrowError(
      /duplicate verse/,
    );
  });

  it("rejects verse bridges rather than inventing a verse number", () => {
    expect(() => parseUsfm("\\id GEN Genesis\n\\c 1\n\\v 1-2 A bridge.\n")).toThrowError(
      /must start with a positive integer/,
    );
  });
});
