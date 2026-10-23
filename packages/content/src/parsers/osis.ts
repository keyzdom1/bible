import { getBookByOsisId, type BookCode } from "@holyword/core";
import { XMLParser } from "fast-xml-parser";
import { cleanText } from "../text";
import { ContentToolError, type ParsedSource, type SourceVerse } from "../types";

type OrderedNode = Record<string, unknown> & { ":@"?: Record<string, string> };

const SKIPPED_ELEMENTS = new Set([
  "note",
  "figure",
  "reference",
  "header",
  "title",
  "milestone",
  "index",
]);

function tagName(node: OrderedNode): string | undefined {
  return Object.keys(node).find((key) => key !== ":@");
}

function attributes(node: OrderedNode): Record<string, string> {
  const value = node[":@"];
  return value && typeof value === "object" ? value : {};
}

function children(node: OrderedNode, name: string): OrderedNode[] {
  const value = node[name];
  return Array.isArray(value) ? (value as OrderedNode[]) : [];
}

function collectText(nodes: readonly OrderedNode[]): string {
  const parts: string[] = [];
  const visit = (items: readonly OrderedNode[]): void => {
    for (const item of items) {
      const name = tagName(item);
      if (!name) continue;
      if (name === "#text") {
        const value = item["#text"];
        if (typeof value === "string") parts.push(value);
        continue;
      }
      if (SKIPPED_ELEMENTS.has(name)) continue;
      visit(children(item, name));
    }
  };
  visit(nodes);
  return cleanText(parts.join(" "));
}

function parseOsisReference(
  value: string,
  file: string,
): { book: BookCode; chapter: number; verse: number } | undefined {
  const match = /^([A-Za-z0-9]+)\.(\d+)\.(\d+)$/.exec(value.trim());
  if (!match) return undefined;
  const definition = getBookByOsisId(match[1] ?? "");
  if (!definition) return undefined;
  const chapter = Number(match[2]);
  const verse = Number(match[3]);
  if (!Number.isSafeInteger(chapter) || chapter < 1 || !Number.isSafeInteger(verse) || verse < 1) {
    throw new ContentToolError("invalid-reference", `${file}: invalid OSIS reference "${value}"`);
  }
  return { book: definition.code, chapter, verse };
}

/**
 * Parses OSIS XML with direct `<verse osisID="Gen.1.1">` elements and milestone
 * `<verse sID="Gen.1.1" />` ... `<verse eID="Gen.1.1" />` elements. Notes, figures
 * and references are excluded so commentary never becomes scripture text.
 */
export function parseOsis(text: string, file = "source.osis"): ParsedSource {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    preserveOrder: true,
    trimValues: false,
    parseTagValue: false,
    processEntities: true,
  });

  let tree: OrderedNode[];
  try {
    tree = parser.parse(text) as OrderedNode[];
  } catch (error) {
    throw new ContentToolError("invalid-osis", `${file}: invalid OSIS XML`, { cause: error });
  }

  const verses: SourceVerse[] = [];
  const seen = new Set<string>();
  const state: {
    active: {
      reference: { book: BookCode; chapter: number; verse: number };
      parts: string[];
    } | null;
  } = { active: null };

  const emit = (
    reference: { book: BookCode; chapter: number; verse: number },
    raw: string,
  ): void => {
    const verseText = cleanText(raw);
    if (!verseText) return;
    const key = `${reference.book}.${reference.chapter}.${reference.verse}`;
    if (seen.has(key)) {
      throw new ContentToolError("duplicate-verse", `${file}: duplicate verse ${key}`);
    }
    seen.add(key);
    verses.push({ ...reference, text: verseText });
  };

  const visit = (nodes: readonly OrderedNode[]): void => {
    for (const node of nodes) {
      const name = tagName(node);
      if (!name) continue;

      if (name === "verse") {
        const attrs = attributes(node);
        const osisId = attrs["@_osisID"];
        const startId = attrs["@_sID"];
        const endId = attrs["@_eID"];

        if (osisId) {
          const reference = parseOsisReference(osisId, file);
          if (reference) emit(reference, collectText(children(node, name)));
          continue;
        }
        if (startId) {
          const reference = parseOsisReference(startId, file);
          if (reference && !endId) {
            state.active = { reference, parts: [] };
            continue;
          }
        }
        if (endId) {
          if (!state.active) continue;
          state.active.parts.push(collectText(children(node, name)));
          emit(state.active.reference, state.active.parts.join(" "));
          state.active = null;
          continue;
        }
        continue;
      }

      if (name === "#text") {
        if (state.active) {
          const value = node["#text"];
          if (typeof value === "string") state.active.parts.push(value);
        }
        continue;
      }

      if (SKIPPED_ELEMENTS.has(name)) continue;
      visit(children(node, name));
    }
  };

  visit(tree);
  if (state.active) {
    throw new ContentToolError(
      "unclosed-osis-verse",
      `${file}: milestone verse ${state.active.reference.book}.${state.active.reference.chapter}.${state.active.reference.verse} has no end marker`,
    );
  }
  if (verses.length === 0) {
    throw new ContentToolError("empty-source", `${file}: no OSIS verses found`);
  }
  return { verses };
}
