import { describe, expect, it } from "vitest";
import { parseOsis } from "../src/parsers/osis";

describe("OSIS ingestion", () => {
  it("reads direct verse elements and excludes notes", () => {
    const source = `<?xml version="1.0" encoding="UTF-8"?>
<osis>
  <osisText osisIDWork="test">
    <div type="book" osisID="Gen">
      <chapter osisID="Gen.1">
        <verse osisID="Gen.1.1">In the <hi type="bold">beginning</hi> God created.<note>commentary</note></verse>
        <verse osisID="Gen.1.2">And the earth was without form.</verse>
      </chapter>
    </div>
  </osisText>
</osis>`;

    const parsed = parseOsis(source, "test.osis");
    expect(parsed.verses).toEqual([
      { book: "GEN", chapter: 1, verse: 1, text: "In the beginning God created." },
      { book: "GEN", chapter: 1, verse: 2, text: "And the earth was without form." },
    ]);
  });

  it("reads milestone verse elements", () => {
    const source = `<?xml version="1.0" encoding="UTF-8"?>
<osis>
  <osisText>
    <div type="book" osisID="John">
      <chapter osisID="John.3">
        <verse sID="John.3.16" />For God so loved the world.<verse eID="John.3.16" />
        <verse sID="John.3.17" />For God sent not his Son.<verse eID="John.3.17" />
      </chapter>
    </div>
  </osisText>
</osis>`;

    const parsed = parseOsis(source);
    expect(parsed.verses).toEqual([
      { book: "JHN", chapter: 3, verse: 16, text: "For God so loved the world." },
      { book: "JHN", chapter: 3, verse: 17, text: "For God sent not his Son." },
    ]);
  });

  it("rejects unclosed milestone verses", () => {
    const source = `<?xml version="1.0"?><osis><osisText><div><chapter><verse sID="Gen.1.1" />Text</chapter></div></osisText></osis>`;
    expect(() => parseOsis(source)).toThrowError(/no end marker/);
  });
});
