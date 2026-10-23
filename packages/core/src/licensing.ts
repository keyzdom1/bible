import type { LicencePolicy, LicenceStatus } from "./content";
import { getBook, type BookCode } from "./books";

export type DownloadDenialReason =
  | "version-disabled"
  | "not-licensed"
  | "offline-not-permitted"
  | "entitlement-required"
  | "device-limit"
  | "region-blocked";

export interface VersionAvailability {
  readonly enabled: boolean;
  readonly licenceStatus: LicenceStatus;
  readonly policy: LicencePolicy;
}

export interface DownloadContext {
  readonly hasEntitlement: boolean;
  /** Devices currently holding this version, excluding the requesting device. */
  readonly activeDeviceCount: number;
  readonly region?: string | null;
}

export type PolicyDecision =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly reason: DownloadDenialReason;
      readonly message: string;
    };

const DENIAL_MESSAGES: Record<DownloadDenialReason, string> = {
  "version-disabled": "This Bible version is not available yet.",
  "not-licensed": "This Bible version is not licensed for distribution.",
  "offline-not-permitted": "This version's licence does not permit offline downloads.",
  "entitlement-required": "You do not have an entitlement for this version.",
  "device-limit": "This version has reached its device limit for your account.",
  "region-blocked": "This Bible version is not available in your region.",
};

function deny(reason: DownloadDenialReason): PolicyDecision {
  return { allowed: false, reason, message: DENIAL_MESSAGES[reason] };
}

/**
 * Single source of truth for "may this user download this version?".
 * Used by the API before issuing a download token and by clients before starting.
 */
export function checkDownloadAllowed(
  availability: VersionAvailability,
  context: DownloadContext,
): PolicyDecision {
  const { policy } = availability;

  if (!availability.enabled || availability.licenceStatus === "unlicensed") {
    return deny("version-disabled");
  }
  if (policy.status === "unlicensed") {
    return deny("not-licensed");
  }
  if (!policy.offlineDownload) {
    return deny("offline-not-permitted");
  }
  if (policy.status === "licensed" && !context.hasEntitlement) {
    return deny("entitlement-required");
  }
  if (policy.regions && context.region && !policy.regions.includes(context.region)) {
    return deny("region-blocked");
  }
  if (policy.maxDevices !== null && context.activeDeviceCount >= policy.maxDevices) {
    return deny("device-limit");
  }
  return { allowed: true };
}

export type CopyMode = "copy" | "share";

export interface CopyDecision {
  readonly allowed: boolean;
  readonly maxVerses: number | null;
}

/** Enforces per-version copy/share caps derived from the publisher contract. */
export function checkCopyAllowed(
  policy: LicencePolicy,
  verseCount: number,
  mode: CopyMode,
): CopyDecision {
  if (!Number.isInteger(verseCount) || verseCount < 1) {
    return { allowed: false, maxVerses: null };
  }
  const maxVerses = mode === "copy" ? policy.maxVersesPerCopy : policy.maxVersesPerShare;
  if (maxVerses === null) return { allowed: true, maxVerses };
  return { allowed: verseCount <= maxVerses, maxVerses };
}

/** Whether a version may appear in the catalog UI at all. */
export function isVersionVisible(availability: VersionAvailability): boolean {
  return availability.enabled && availability.licenceStatus !== "unlicensed";
}

/** Attribution block rendered on reading screens and shared verses. */
export function copyrightNotice(policy: LicencePolicy): string {
  return [policy.attribution, policy.copyright].filter(Boolean).join("\n");
}

export interface CitationVerse {
  readonly verse: number;
  readonly text: string;
}

function compressedVerseRanges(verses: readonly CitationVerse[]): string {
  const numbers = [...new Set(verses.map((verse) => verse.verse))].sort((a, b) => a - b);
  const ranges: string[] = [];
  let index = 0;
  while (index < numbers.length) {
    const start = numbers[index]!;
    let end = start;
    while (index + 1 < numbers.length && numbers[index + 1] === end + 1) {
      index += 1;
      end = numbers[index]!;
    }
    ranges.push(start === end ? String(start) : `${start}-${end}`);
    index += 1;
  }
  return ranges.join(",");
}

/**
 * Builds copy/share text with the reference and licence attribution. Callers
 * must first enforce `checkCopyAllowed(policy, verses.length, mode)`.
 */
export function formatCitation(input: {
  readonly book: BookCode;
  readonly chapter: number;
  readonly verses: readonly CitationVerse[];
  readonly abbreviation: string;
  readonly policy: LicencePolicy;
}): string {
  const { book, chapter, verses, abbreviation, policy } = input;
  if (verses.length === 0) throw new Error("At least one verse is required");
  const body = [...verses]
    .sort((a, b) => a.verse - b.verse)
    .map((verse) => `${verse.verse} ${verse.text}`)
    .join(" ");
  const bookName = getBook(book)?.name ?? book;
  const reference = `${bookName} ${chapter}:${compressedVerseRanges(verses)} (${abbreviation})`;
  return `${body}\n\n${reference}\n${copyrightNotice(policy)}`;
}
