import { z } from "zod";
import { bookCodeSchema, isVerseId, parseHlc } from "@holyword/core";

export const hlcSchema = z.string().refine(
  (value) => {
    try {
      parseHlc(value);
      return true;
    } catch {
      return false;
    }
  },
  { message: "Expected a formatted hybrid logical clock" },
);

export const versionIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "Invalid version id");

export const verseIdSchema = z
  .string()
  .refine((value) => isVerseId(value), { message: "Invalid verse id" });

const nullableString = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((value) => value ?? null);

export const bookmarkPayloadSchema = z.object({
  verseId: verseIdSchema,
  versionId: versionIdSchema,
  label: nullableString(200),
});
export type BookmarkPayload = z.infer<typeof bookmarkPayloadSchema>;

export const highlightColors = ["gold", "cyan", "emerald", "royal-red", "purple"] as const;

export const highlightPayloadSchema = z
  .object({
    verseId: verseIdSchema,
    versionId: versionIdSchema,
    color: z.enum(highlightColors),
    startOffset: z
      .number()
      .int()
      .nonnegative()
      .nullish()
      .transform((value) => value ?? null),
    endOffset: z
      .number()
      .int()
      .nonnegative()
      .nullish()
      .transform((value) => value ?? null),
  })
  .refine(
    (value) =>
      value.startOffset === null ||
      value.endOffset === null ||
      value.startOffset <= value.endOffset,
    { message: "startOffset must not exceed endOffset", path: ["endOffset"] },
  );
export type HighlightPayload = z.infer<typeof highlightPayloadSchema>;

export const notePayloadSchema = z.object({
  verseId: verseIdSchema.nullish().transform((value) => value ?? null),
  reference: nullableString(200),
  title: nullableString(200),
  body: z.string().min(1).max(100_000),
  folderId: z
    .uuid()
    .nullish()
    .transform((value) => value ?? null),
});
export type NotePayload = z.infer<typeof notePayloadSchema>;

export const folderPayloadSchema = z.object({
  name: z.string().trim().min(1).max(100),
  parentId: z
    .uuid()
    .nullish()
    .transform((value) => value ?? null),
});
export type FolderPayload = z.infer<typeof folderPayloadSchema>;

export const planProgressPayloadSchema = z.object({
  planId: z.uuid(),
  dayNumber: z.number().int().min(1),
  completedAt: z
    .string()
    .datetime()
    .nullish()
    .transform((value) => value ?? null),
});
export type PlanProgressPayload = z.infer<typeof planProgressPayloadSchema>;

export const readingProgressPayloadSchema = z.object({
  book: bookCodeSchema,
  chapter: z.number().int().min(1),
  verse: z
    .number()
    .int()
    .min(1)
    .nullish()
    .transform((value) => value ?? null),
});
export type ReadingProgressPayload = z.infer<typeof readingProgressPayloadSchema>;

export const readingLocationSchema = z.object({
  versionId: versionIdSchema,
  book: bookCodeSchema,
  chapter: z.number().int().min(1),
  verse: z.number().int().min(1).optional(),
});

export const preferencePayloadSchema = z.object({
  theme: z.enum(["system", "light", "dark"]).optional(),
  readingTheme: z.enum(["light", "sepia", "dark"]).optional(),
  fontScale: z.number().int().min(80).max(200).optional(),
  activeVersionId: z
    .string()
    .nullish()
    .transform((value) => value ?? null)
    .optional(),
  lastLocation: readingLocationSchema
    .nullish()
    .transform((value) => value ?? null)
    .optional(),
});
export type PreferencePayload = z.infer<typeof preferencePayloadSchema>;

export const bookmarkInputSchema = bookmarkPayloadSchema.extend({
  id: z.uuid(),
  hlc: hlcSchema,
});
export const highlightInputSchema = highlightPayloadSchema.extend({
  id: z.uuid(),
  hlc: hlcSchema,
});
export const noteInputSchema = notePayloadSchema.extend({
  id: z.uuid(),
  hlc: hlcSchema,
  baseVersion: z.number().int().nonnegative().optional(),
});
export const folderInputSchema = folderPayloadSchema.extend({
  id: z.uuid(),
  hlc: hlcSchema,
});
export const planProgressInputSchema = planProgressPayloadSchema.omit({ planId: true }).extend({
  id: z.uuid(),
  hlc: hlcSchema,
});
export const readingProgressInputSchema = readingProgressPayloadSchema.extend({
  versionId: versionIdSchema,
  hlc: hlcSchema,
});
export const preferenceInputSchema = preferencePayloadSchema.extend({
  hlc: hlcSchema,
});

export const updatedSinceSchema = z
  .string()
  .datetime()
  .optional()
  .transform((value) => (value ? new Date(value) : undefined));
