import { z } from "zod";
import { isBookCode } from "./books";

export const bookCodeSchema = z.string().refine(isBookCode, { message: "Unknown book code" });

export const licenceStatusSchema = z.enum(["public-domain", "licensed", "unlicensed"]);
export type LicenceStatus = z.infer<typeof licenceStatusSchema>;

/**
 * Per-version licence policy. Defaults are restrictive on purpose: a version is
 * not usable until these values are set from the publisher's contract.
 */
export const licencePolicySchema = z.object({
  status: licenceStatusSchema,
  offlineDownload: z.boolean(),
  maxDevices: z.number().int().positive().nullable(),
  maxVersesPerCopy: z.number().int().positive().nullable(),
  maxVersesPerShare: z.number().int().positive().nullable(),
  encryption: z.enum(["none", "aes-256-gcm"]),
  regions: z.array(z.string().min(2)).nullable(),
  copyright: z.string().min(1),
  attribution: z.string().min(1),
  licenceNote: z.string().optional(),
});
export type LicencePolicy = z.infer<typeof licencePolicySchema>;

export const packageBookSchema = z.object({
  code: bookCodeSchema,
  name: z.string().min(1),
  chapters: z.number().int().positive(),
  verses: z.number().int().positive(),
  file: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/, "Expected a lowercase hex SHA-256"),
});
export type PackageBook = z.infer<typeof packageBookSchema>;

export const packageSearchSchema = z.object({
  engine: z.literal("minisearch"),
  file: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

/** Integrity descriptor for the versification artifact shipped with a package. */
export const packageVersificationSchema = z.object({
  file: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/, "Expected a lowercase hex SHA-256"),
});
export type PackageVersification = z.infer<typeof packageVersificationSchema>;

/**
 * `manifest.json` at the root of every version package.
 * The package is immutable: any content change produces a new `versionCode`.
 */
export const packageManifestSchema = z.object({
  schemaVersion: z.literal(1),
  versionId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  versionCode: z.number().int().positive(),
  name: z.string().min(1),
  abbreviation: z.string().min(1).max(16),
  language: z.string().min(2),
  languageName: z.string().min(1),
  direction: z.enum(["ltr", "rtl"]),
  licence: licencePolicySchema,
  versificationId: z.string().min(1),
  versification: packageVersificationSchema.optional(),
  books: z.array(packageBookSchema).min(1),
  totals: z.object({
    books: z.number().int().positive(),
    chapters: z.number().int().positive(),
    verses: z.number().int().positive(),
  }),
  builtAt: z.string().datetime(),
  builderVersion: z.string().min(1),
  source: z.object({
    name: z.string().min(1),
    url: z.string().url().optional(),
    licenceNote: z.string().min(1),
  }),
  search: packageSearchSchema.optional(),
});
export type PackageManifest = z.infer<typeof packageManifestSchema>;

/** One JSON object per line inside a book file (`books/JHN.ndjson`). */
export const packageVerseSchema = z.object({
  id: z.string().regex(/^[A-Z1-3]{3}\.\d{1,3}\.\d{1,3}$/),
  book: bookCodeSchema,
  chapter: z.number().int().positive(),
  verse: z.number().int().positive(),
  text: z.string(),
});
export type PackageVerse = z.infer<typeof packageVerseSchema>;

export interface PackageBookFile {
  readonly book: string;
  readonly verses: readonly PackageVerse[];
}

/**
 * Versification describes how verse numbering differs between translations.
 * `books[code][chapter - 1]` is the verse count for that chapter (0 when absent).
 * `canonicalToTarget` maps canonical verse ids to the ids used by a target version,
 * so notes anchored on canonical ids survive translation switches.
 */
export const versificationMapSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  baseVersionId: z.string().min(1),
  description: z.string().min(1),
  books: z.partialRecord(bookCodeSchema, z.array(z.number().int().nonnegative())),
  crossVersion: z.array(
    z.object({
      targetVersionId: z.string().min(1),
      canonicalToTarget: z.record(z.string(), z.array(z.string())),
    }),
  ),
});
export type VersificationMap = z.infer<typeof versificationMapSchema>;

export interface ContentVersionSummary {
  readonly versionId: string;
  readonly versionCode: number;
  readonly name: string;
  readonly abbreviation: string;
  readonly language: string;
  readonly languageName: string;
  readonly enabled: boolean;
  readonly licenceStatus: LicenceStatus;
  readonly verseCount: number;
  readonly downloadBytes: number;
  readonly copyright: string;
}
