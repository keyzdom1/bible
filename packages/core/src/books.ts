/**
 * Canonical book table.
 *
 * Codes are USFM 3-letter identifiers (uppercase) and are the canonical book key
 * everywhere in the system. `osisId` is kept for ingestion from OSIS sources.
 * Chapter counts follow the 66-book Protestant canon (KJV/ORG versification).
 */
export interface BookDefinition {
  readonly code: string;
  readonly osisId: string;
  readonly name: string;
  readonly shortName: string;
  readonly aliases: readonly string[];
  readonly testament: "OT" | "NT";
  readonly chapterCount: number;
  readonly order: number;
}

export const BOOKS = [
  {
    code: "GEN",
    osisId: "Gen",
    name: "Genesis",
    shortName: "Gen",
    aliases: ["Gen", "Ge", "Gn"],
    testament: "OT",
    chapterCount: 50,
    order: 1,
  },
  {
    code: "EXO",
    osisId: "Exod",
    name: "Exodus",
    shortName: "Ex",
    aliases: ["Exod", "Exo", "Ex"],
    testament: "OT",
    chapterCount: 40,
    order: 2,
  },
  {
    code: "LEV",
    osisId: "Lev",
    name: "Leviticus",
    shortName: "Lev",
    aliases: ["Lev", "Lv", "Le"],
    testament: "OT",
    chapterCount: 27,
    order: 3,
  },
  {
    code: "NUM",
    osisId: "Num",
    name: "Numbers",
    shortName: "Num",
    aliases: ["Num", "Nm", "Nu"],
    testament: "OT",
    chapterCount: 36,
    order: 4,
  },
  {
    code: "DEU",
    osisId: "Deut",
    name: "Deuteronomy",
    shortName: "Deut",
    aliases: ["Deut", "Dt", "De"],
    testament: "OT",
    chapterCount: 34,
    order: 5,
  },
  {
    code: "JOS",
    osisId: "Josh",
    name: "Joshua",
    shortName: "Josh",
    aliases: ["Josh", "Jos", "Jsh"],
    testament: "OT",
    chapterCount: 24,
    order: 6,
  },
  {
    code: "JDG",
    osisId: "Judg",
    name: "Judges",
    shortName: "Judg",
    aliases: ["Judg", "Jdg", "Jg"],
    testament: "OT",
    chapterCount: 21,
    order: 7,
  },
  {
    code: "RUT",
    osisId: "Ruth",
    name: "Ruth",
    shortName: "Ruth",
    aliases: ["Rth", "Ru"],
    testament: "OT",
    chapterCount: 4,
    order: 8,
  },
  {
    code: "1SA",
    osisId: "1Sam",
    name: "1 Samuel",
    shortName: "1 Sam",
    aliases: ["1Sam", "1Sa", "1S", "1st Samuel", "First Samuel", "I Samuel"],
    testament: "OT",
    chapterCount: 31,
    order: 9,
  },
  {
    code: "2SA",
    osisId: "2Sam",
    name: "2 Samuel",
    shortName: "2 Sam",
    aliases: ["2Sam", "2Sa", "2S", "2nd Samuel", "Second Samuel", "II Samuel"],
    testament: "OT",
    chapterCount: 24,
    order: 10,
  },
  {
    code: "1KI",
    osisId: "1Kgs",
    name: "1 Kings",
    shortName: "1 Kgs",
    aliases: ["1Kgs", "1Ki", "1K", "1st Kings", "First Kings", "I Kings"],
    testament: "OT",
    chapterCount: 22,
    order: 11,
  },
  {
    code: "2KI",
    osisId: "2Kgs",
    name: "2 Kings",
    shortName: "2 Kgs",
    aliases: ["2Kgs", "2Ki", "2K", "2nd Kings", "Second Kings", "II Kings"],
    testament: "OT",
    chapterCount: 25,
    order: 12,
  },
  {
    code: "1CH",
    osisId: "1Chr",
    name: "1 Chronicles",
    shortName: "1 Chr",
    aliases: ["1Chr", "1Ch", "1st Chronicles", "First Chronicles", "I Chronicles"],
    testament: "OT",
    chapterCount: 29,
    order: 13,
  },
  {
    code: "2CH",
    osisId: "2Chr",
    name: "2 Chronicles",
    shortName: "2 Chr",
    aliases: ["2Chr", "2Ch", "2nd Chronicles", "Second Chronicles", "II Chronicles"],
    testament: "OT",
    chapterCount: 36,
    order: 14,
  },
  {
    code: "EZR",
    osisId: "Ezra",
    name: "Ezra",
    shortName: "Ezra",
    aliases: ["Ezr"],
    testament: "OT",
    chapterCount: 10,
    order: 15,
  },
  {
    code: "NEH",
    osisId: "Neh",
    name: "Nehemiah",
    shortName: "Neh",
    aliases: ["Ne"],
    testament: "OT",
    chapterCount: 13,
    order: 16,
  },
  {
    code: "EST",
    osisId: "Esth",
    name: "Esther",
    shortName: "Esth",
    aliases: ["Est", "Es"],
    testament: "OT",
    chapterCount: 10,
    order: 17,
  },
  {
    code: "JOB",
    osisId: "Job",
    name: "Job",
    shortName: "Job",
    aliases: ["Jb"],
    testament: "OT",
    chapterCount: 42,
    order: 18,
  },
  {
    code: "PSA",
    osisId: "Ps",
    name: "Psalms",
    shortName: "Ps",
    aliases: ["Psalm", "Psa", "Psm", "Pss", "Psm"],
    testament: "OT",
    chapterCount: 150,
    order: 19,
  },
  {
    code: "PRO",
    osisId: "Prov",
    name: "Proverbs",
    shortName: "Prov",
    aliases: ["Prv", "Pr"],
    testament: "OT",
    chapterCount: 31,
    order: 20,
  },
  {
    code: "ECC",
    osisId: "Eccl",
    name: "Ecclesiastes",
    shortName: "Eccl",
    aliases: ["Ec", "Ecc", "Qoheleth"],
    testament: "OT",
    chapterCount: 12,
    order: 21,
  },
  {
    code: "SNG",
    osisId: "Song",
    name: "Song of Solomon",
    shortName: "Song",
    aliases: ["Song of Songs", "Song", "Sos", "Sng", "Canticles"],
    testament: "OT",
    chapterCount: 8,
    order: 22,
  },
  {
    code: "ISA",
    osisId: "Isa",
    name: "Isaiah",
    shortName: "Isa",
    aliases: ["Is"],
    testament: "OT",
    chapterCount: 66,
    order: 23,
  },
  {
    code: "JER",
    osisId: "Jer",
    name: "Jeremiah",
    shortName: "Jer",
    aliases: ["Je"],
    testament: "OT",
    chapterCount: 52,
    order: 24,
  },
  {
    code: "LAM",
    osisId: "Lam",
    name: "Lamentations",
    shortName: "Lam",
    aliases: ["La"],
    testament: "OT",
    chapterCount: 5,
    order: 25,
  },
  {
    code: "EZK",
    osisId: "Ezek",
    name: "Ezekiel",
    shortName: "Ezek",
    aliases: ["Eze", "Ezk"],
    testament: "OT",
    chapterCount: 48,
    order: 26,
  },
  {
    code: "DAN",
    osisId: "Dan",
    name: "Daniel",
    shortName: "Dan",
    aliases: ["Da", "Dn"],
    testament: "OT",
    chapterCount: 12,
    order: 27,
  },
  {
    code: "HOS",
    osisId: "Hos",
    name: "Hosea",
    shortName: "Hos",
    aliases: ["Ho"],
    testament: "OT",
    chapterCount: 14,
    order: 28,
  },
  {
    code: "JOL",
    osisId: "Joel",
    name: "Joel",
    shortName: "Joel",
    aliases: ["Joe"],
    testament: "OT",
    chapterCount: 3,
    order: 29,
  },
  {
    code: "AMO",
    osisId: "Amos",
    name: "Amos",
    shortName: "Amos",
    aliases: ["Am"],
    testament: "OT",
    chapterCount: 9,
    order: 30,
  },
  {
    code: "OBA",
    osisId: "Obad",
    name: "Obadiah",
    shortName: "Obad",
    aliases: ["Ob"],
    testament: "OT",
    chapterCount: 1,
    order: 31,
  },
  {
    code: "JON",
    osisId: "Jonah",
    name: "Jonah",
    shortName: "Jonah",
    aliases: ["Jon"],
    testament: "OT",
    chapterCount: 4,
    order: 32,
  },
  {
    code: "MIC",
    osisId: "Mic",
    name: "Micah",
    shortName: "Mic",
    aliases: ["Mi"],
    testament: "OT",
    chapterCount: 7,
    order: 33,
  },
  {
    code: "NAM",
    osisId: "Nah",
    name: "Nahum",
    shortName: "Nah",
    aliases: ["Na"],
    testament: "OT",
    chapterCount: 3,
    order: 34,
  },
  {
    code: "HAB",
    osisId: "Hab",
    name: "Habakkuk",
    shortName: "Hab",
    aliases: ["Hb"],
    testament: "OT",
    chapterCount: 3,
    order: 35,
  },
  {
    code: "ZEP",
    osisId: "Zeph",
    name: "Zephaniah",
    shortName: "Zeph",
    aliases: ["Zep", "Zp"],
    testament: "OT",
    chapterCount: 3,
    order: 36,
  },
  {
    code: "HAG",
    osisId: "Hag",
    name: "Haggai",
    shortName: "Hag",
    aliases: ["Hg"],
    testament: "OT",
    chapterCount: 2,
    order: 37,
  },
  {
    code: "ZEC",
    osisId: "Zech",
    name: "Zechariah",
    shortName: "Zech",
    aliases: ["Zec", "Zc"],
    testament: "OT",
    chapterCount: 14,
    order: 38,
  },
  {
    code: "MAL",
    osisId: "Mal",
    name: "Malachi",
    shortName: "Mal",
    aliases: ["Ml"],
    testament: "OT",
    chapterCount: 4,
    order: 39,
  },
  {
    code: "MAT",
    osisId: "Matt",
    name: "Matthew",
    shortName: "Matt",
    aliases: ["Matt", "Mt", "Mat"],
    testament: "NT",
    chapterCount: 28,
    order: 40,
  },
  {
    code: "MRK",
    osisId: "Mark",
    name: "Mark",
    shortName: "Mark",
    aliases: ["Mrk", "Mk", "Mr"],
    testament: "NT",
    chapterCount: 16,
    order: 41,
  },
  {
    code: "LUK",
    osisId: "Luke",
    name: "Luke",
    shortName: "Luke",
    aliases: ["Luk", "Lk"],
    testament: "NT",
    chapterCount: 24,
    order: 42,
  },
  {
    code: "JHN",
    osisId: "John",
    name: "John",
    shortName: "John",
    aliases: ["Jn", "Joh"],
    testament: "NT",
    chapterCount: 21,
    order: 43,
  },
  {
    code: "ACT",
    osisId: "Acts",
    name: "Acts",
    shortName: "Acts",
    aliases: ["Ac", "Act"],
    testament: "NT",
    chapterCount: 28,
    order: 44,
  },
  {
    code: "ROM",
    osisId: "Rom",
    name: "Romans",
    shortName: "Rom",
    aliases: ["Ro", "Rm"],
    testament: "NT",
    chapterCount: 16,
    order: 45,
  },
  {
    code: "1CO",
    osisId: "1Cor",
    name: "1 Corinthians",
    shortName: "1 Cor",
    aliases: ["1Cor", "1Co", "1st Corinthians", "First Corinthians", "I Corinthians"],
    testament: "NT",
    chapterCount: 16,
    order: 46,
  },
  {
    code: "2CO",
    osisId: "2Cor",
    name: "2 Corinthians",
    shortName: "2 Cor",
    aliases: ["2Cor", "2Co", "2nd Corinthians", "Second Corinthians", "II Corinthians"],
    testament: "NT",
    chapterCount: 13,
    order: 47,
  },
  {
    code: "GAL",
    osisId: "Gal",
    name: "Galatians",
    shortName: "Gal",
    aliases: ["Ga"],
    testament: "NT",
    chapterCount: 6,
    order: 48,
  },
  {
    code: "EPH",
    osisId: "Eph",
    name: "Ephesians",
    shortName: "Eph",
    aliases: ["Ep"],
    testament: "NT",
    chapterCount: 6,
    order: 49,
  },
  {
    code: "PHP",
    osisId: "Phil",
    name: "Philippians",
    shortName: "Phil",
    aliases: ["Phil", "Php", "Pp"],
    testament: "NT",
    chapterCount: 4,
    order: 50,
  },
  {
    code: "COL",
    osisId: "Col",
    name: "Colossians",
    shortName: "Col",
    aliases: ["Co"],
    testament: "NT",
    chapterCount: 4,
    order: 51,
  },
  {
    code: "1TH",
    osisId: "1Thess",
    name: "1 Thessalonians",
    shortName: "1 Thess",
    aliases: ["1Thess", "1Th", "1st Thessalonians", "First Thessalonians", "I Thessalonians"],
    testament: "NT",
    chapterCount: 5,
    order: 52,
  },
  {
    code: "2TH",
    osisId: "2Thess",
    name: "2 Thessalonians",
    shortName: "2 Thess",
    aliases: ["2Thess", "2Th", "2nd Thessalonians", "Second Thessalonians", "II Thessalonians"],
    testament: "NT",
    chapterCount: 3,
    order: 53,
  },
  {
    code: "1TI",
    osisId: "1Tim",
    name: "1 Timothy",
    shortName: "1 Tim",
    aliases: ["1Tim", "1Ti", "1st Timothy", "First Timothy", "I Timothy"],
    testament: "NT",
    chapterCount: 6,
    order: 54,
  },
  {
    code: "2TI",
    osisId: "2Tim",
    name: "2 Timothy",
    shortName: "2 Tim",
    aliases: ["2Tim", "2Ti", "2nd Timothy", "Second Timothy", "II Timothy"],
    testament: "NT",
    chapterCount: 4,
    order: 55,
  },
  {
    code: "TIT",
    osisId: "Titus",
    name: "Titus",
    shortName: "Titus",
    aliases: ["Tit"],
    testament: "NT",
    chapterCount: 3,
    order: 56,
  },
  {
    code: "PHM",
    osisId: "Phlm",
    name: "Philemon",
    shortName: "Phlm",
    aliases: ["Phm", "Philem"],
    testament: "NT",
    chapterCount: 1,
    order: 57,
  },
  {
    code: "HEB",
    osisId: "Heb",
    name: "Hebrews",
    shortName: "Heb",
    aliases: ["Hbr"],
    testament: "NT",
    chapterCount: 13,
    order: 58,
  },
  {
    code: "JAS",
    osisId: "Jas",
    name: "James",
    shortName: "Jas",
    aliases: ["Jam", "Jm"],
    testament: "NT",
    chapterCount: 5,
    order: 59,
  },
  {
    code: "1PE",
    osisId: "1Pet",
    name: "1 Peter",
    shortName: "1 Pet",
    aliases: ["1Pet", "1Pe", "1st Peter", "First Peter", "I Peter"],
    testament: "NT",
    chapterCount: 5,
    order: 60,
  },
  {
    code: "2PE",
    osisId: "2Pet",
    name: "2 Peter",
    shortName: "2 Pet",
    aliases: ["2Pet", "2Pe", "2nd Peter", "Second Peter", "II Peter"],
    testament: "NT",
    chapterCount: 3,
    order: 61,
  },
  {
    code: "1JN",
    osisId: "1John",
    name: "1 John",
    shortName: "1 John",
    aliases: ["1John", "1Jn", "1Jo", "1st John", "First John", "I John"],
    testament: "NT",
    chapterCount: 5,
    order: 62,
  },
  {
    code: "2JN",
    osisId: "2John",
    name: "2 John",
    shortName: "2 John",
    aliases: ["2John", "2Jn", "2Jo", "2nd John", "Second John", "II John"],
    testament: "NT",
    chapterCount: 1,
    order: 63,
  },
  {
    code: "3JN",
    osisId: "3John",
    name: "3 John",
    shortName: "3 John",
    aliases: ["3John", "3Jn", "3Jo", "3rd John", "Third John", "III John"],
    testament: "NT",
    chapterCount: 1,
    order: 64,
  },
  {
    code: "JUD",
    osisId: "Jude",
    name: "Jude",
    shortName: "Jude",
    aliases: ["Jud"],
    testament: "NT",
    chapterCount: 1,
    order: 65,
  },
  {
    code: "REV",
    osisId: "Rev",
    name: "Revelation",
    shortName: "Rev",
    aliases: ["Re", "Rv", "Apocalypse"],
    testament: "NT",
    chapterCount: 22,
    order: 66,
  },
] as const satisfies readonly BookDefinition[];

export type BookCode = (typeof BOOKS)[number]["code"];

export type Book = Omit<BookDefinition, "code"> & { readonly code: BookCode };

export const BOOK_CODES = BOOKS.map((book) => book.code) as readonly BookCode[];

const booksByCode = new Map<string, Book>(BOOKS.map((book) => [book.code, book as Book]));

/** Normalizes a book name to letters and digits only, e.g. "1st John" -> "1john". */
export function normalizeBookToken(token: string): string {
  return token
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/^1st/, "1")
    .replace(/^2nd/, "2")
    .replace(/^3rd/, "3");
}

function escapeRegExpChar(char: string): string {
  return char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface AliasEntry {
  readonly pattern: RegExp;
  readonly code: BookCode;
  readonly length: number;
}

function buildAliasIndex(): AliasEntry[] {
  const entries: AliasEntry[] = [];
  for (const book of BOOKS) {
    const tokens = new Set<string>([
      book.code,
      book.osisId,
      book.name,
      book.shortName,
      ...book.aliases,
    ]);
    for (const token of tokens) {
      const normalized = normalizeBookToken(token);
      if (!normalized) continue;
      const pattern = new RegExp(`^${[...normalized].map(escapeRegExpChar).join("[\\s.]*")}`, "i");
      entries.push({ pattern, code: book.code, length: normalized.length });
    }
  }
  // Longest match wins so "1 John" beats "John" and "Psalm" beats "Ps".
  return entries.sort((a, b) => b.length - a.length);
}

const aliasIndex = buildAliasIndex();

export function getBook(code: string): Book | undefined {
  return booksByCode.get(code.toUpperCase());
}

export function requireBook(code: string): Book {
  const book = getBook(code);
  if (!book) throw new Error(`Unknown book code: ${code}`);
  return book;
}

export function getBookByOsisId(osisId: string): Book | undefined {
  const target = osisId.toLowerCase();
  return BOOKS.find((book) => book.osisId.toLowerCase() === target) as Book | undefined;
}

/**
 * Matches a book name at the start of `input`.
 * Returns the book and the remaining text (the numeric reference part).
 */
export function matchBookAtStart(input: string): { book: Book; rest: string } | undefined {
  for (const entry of aliasIndex) {
    const match = entry.pattern.exec(input);
    if (!match) continue;
    const nextChar = input.slice(match[0].length, match[0].length + 1);
    if (nextChar && !/[\s:;,.\d()\-–—]/.test(nextChar)) continue;
    const book = booksByCode.get(entry.code);
    if (!book) continue;
    return { book, rest: input.slice(match[0].length) };
  }
  return undefined;
}

export function isBookCode(value: string): value is BookCode {
  return booksByCode.has(value.toUpperCase());
}

/** Canonical chapter counts, used for validation and versification defaults. */
export const CHAPTER_COUNTS: Readonly<Record<BookCode, number>> = Object.fromEntries(
  BOOKS.map((book) => [book.code, book.chapterCount]),
) as Record<BookCode, number>;
