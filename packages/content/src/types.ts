import { z } from "zod";
import {
  bookCodeSchema,
  licencePolicySchema,
  versificationMapSchema,
  type BookCode,
} from "@holyword/core";

/** Formats accepted by the ingestion normalizer. */
export const sourceFormatSchema = z.enum(["usfm", "osis", "json"]);
export type SourceFormat = z.infer<typeof sourceFormatSchema>;

const expectedBooksSchema = z.partialRecord(bookCodeSchema, z.number().int().positive());

/**
 * Operator-supplied metadata for a source package. Licensed versions must use the
 * publisher's exact counts and policy; the pipeline never guesses licence terms.
 */
export const sourceMetadataSchema = z.object({
  versionId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  versionCode: z.number().int().positive(),
  name: z.string().min(1),
  abbreviation: z.string().min(1).max(16),
  language: z.string().min(2),
  languageName: z.string().min(1),
  direction: z.enum(["ltr", "rtl"]),
  licence: licencePolicySchema,
  versificationId: z.string().min(1),
  source: z.object({
    name: z.string().min(1),
    url: z.url().optional(),
    licenceNote: z.string().min(1),
  }),
  builtAt: z.string().datetime().optional(),
  builderVersion: z.string().min(1).optional(),
  /** Production packages must contain the whole 66-book canon. */
  requireAllBooks: z.boolean().default(true),
  expected: z
    .object({
      totalVerses: z.number().int().positive().optional(),
      books: expectedBooksSchema.optional(),
    })
    .optional(),
  /**
   * Optional full versification map supplied by the publisher. When present its
   * per-chapter counts are checked against the actual text and its cross-version
   * mappings are preserved verbatim.
   */
  versification: versificationMapSchema.optional(),
});
export type SourceMetadata = z.infer<typeof sourceMetadataSchema>;

export interface SourceVerse {
  readonly book: BookCode;
  readonly chapter: number;
  readonly verse: number;
  readonly text: string;
}

export interface ParsedSource {
  readonly verses: readonly SourceVerse[];
}

export class ContentToolError extends Error {
  constructor(
    readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ContentToolError";
  }
}

export function isContentToolError(error: unknown): error is ContentToolError {
  return error instanceof ContentToolError;
}
