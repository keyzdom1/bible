import { describe, expect, it } from "vitest";
import { parseJson } from "../src/parsers/json";

describe("JSON ingestion", () => {
  it("normalizes a flat verse array", () => {
    const parsed = parseJson(
      JSON.stringify([
        { book: "GEN", chapter: 1, verse: 1, text: "Synthetic first verse." },
        { book: "Gen", chapter: 1, verse: 2, text: "Synthetic second verse." },
      ]),
    );
    expect(parsed.verses.map((verse) => verse.text)).toEqual([
      "Synthetic first verse.",
      "Synthetic second verse.",
    ]);
  });

  it("normalizes a nested books/chapters/verses document", () => {
    const parsed = parseJson(
      JSON.stringify({
        books: [
          {
            code: "GEN",
            chapters: [
              {
                number: 1,
                verses: [
                  { number: 1, text: "Synthetic verse one." },
                  { number: 2, text: "Synthetic verse two." },
                ],
              },
            ],
          },
        ],
      }),
    );
    expect(parsed.verses).toHaveLength(2);
    expect(parsed.verses[0]).toMatchObject({ book: "GEN", chapter: 1, verse: 1 });
  });

  it("normalizes book-keyed JSON without treating metadata as a book", () => {
    const parsed = parseJson(
      JSON.stringify({
        metadata: { source: "synthetic" },
        GEN: { "1": { "1": "Synthetic verse one." } },
      }),
    );
    expect(parsed.verses).toEqual([
      { book: "GEN", chapter: 1, verse: 1, text: "Synthetic verse one." },
    ]);
  });

  it("rejects empty text and malformed references", () => {
    expect(() =>
      parseJson(JSON.stringify([{ book: "GEN", chapter: 1, verse: 1, text: "  " }])),
    ).toThrowError(/non-empty/);
    expect(() =>
      parseJson(JSON.stringify([{ book: "ZZZ", chapter: 1, verse: 1, text: "Text." }])),
    ).toThrowError(/unknown book/);
  });
});
