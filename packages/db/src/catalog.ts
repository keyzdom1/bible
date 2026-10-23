import type { LicencePolicy } from "@holyword/core";

export interface CatalogEntry {
  readonly versionId: string;
  readonly versionCode: number;
  readonly name: string;
  readonly abbreviation: string;
  readonly language: string;
  readonly languageName: string;
  readonly direction: "ltr" | "rtl";
  readonly licenceStatus: "public-domain" | "licensed" | "unlicensed";
  readonly enabled: boolean;
  readonly verseCount: number;
  readonly policy: LicencePolicy;
}

const KJV_POLICY: LicencePolicy = {
  status: "public-domain",
  offlineDownload: true,
  maxDevices: null,
  maxVersesPerCopy: null,
  maxVersesPerShare: null,
  encryption: "none",
  regions: null,
  attribution: "King James Version (KJV)",
  copyright:
    "The King James Version is in the public domain in the United States. In the United Kingdom, Crown letters patent apply.",
  licenceNote:
    "Public-domain KJV text from eBible.org; packaged and checksum-verified by the content pipeline.",
};

/**
 * Conservative defaults for versions that require a publisher licence.
 * Nothing here may be enabled in production until the licence is confirmed
 * and the policy values are replaced with the contract terms.
 */
function pendingPolicy(name: string, note?: string): LicencePolicy {
  return {
    status: "unlicensed",
    offlineDownload: false,
    maxDevices: 1,
    maxVersesPerCopy: 1,
    maxVersesPerShare: 1,
    encryption: "aes-256-gcm",
    regions: null,
    attribution: name,
    copyright: "Copyright notice pending publisher confirmation.",
    licenceNote: note ?? "Disabled until a licence is confirmed.",
  };
}

export const CATALOG: readonly CatalogEntry[] = [
  {
    versionId: "kjv",
    versionCode: 1,
    name: "King James Version",
    abbreviation: "KJV",
    language: "en",
    languageName: "English",
    direction: "ltr",
    licenceStatus: "public-domain",
    enabled: true,
    verseCount: 31102,
    policy: KJV_POLICY,
  },
  {
    versionId: "nkjv",
    versionCode: 2,
    name: "New King James Version",
    abbreviation: "NKJV",
    language: "en",
    languageName: "English",
    direction: "ltr",
    licenceStatus: "unlicensed",
    enabled: false,
    verseCount: 31102,
    policy: pendingPolicy("New King James Version"),
  },
  {
    versionId: "niv",
    versionCode: 3,
    name: "New International Version",
    abbreviation: "NIV",
    language: "en",
    languageName: "English",
    direction: "ltr",
    licenceStatus: "unlicensed",
    enabled: false,
    verseCount: 31103,
    policy: pendingPolicy("New International Version"),
  },
  {
    versionId: "nlt",
    versionCode: 4,
    name: "New Living Translation",
    abbreviation: "NLT",
    language: "en",
    languageName: "English",
    direction: "ltr",
    licenceStatus: "unlicensed",
    enabled: false,
    verseCount: 31093,
    policy: pendingPolicy("New Living Translation"),
  },
  {
    versionId: "msg",
    versionCode: 5,
    name: "The Message",
    abbreviation: "MSG",
    language: "en",
    languageName: "English",
    direction: "ltr",
    licenceStatus: "unlicensed",
    enabled: false,
    verseCount: 31102,
    policy: pendingPolicy(
      "The Message",
      "Paraphrase. Must be labelled as a paraphrase in the UI. Disabled until licensed.",
    ),
  },
  {
    versionId: "esv",
    versionCode: 6,
    name: "English Standard Version",
    abbreviation: "ESV",
    language: "en",
    languageName: "English",
    direction: "ltr",
    licenceStatus: "unlicensed",
    enabled: false,
    verseCount: 31102,
    policy: pendingPolicy("English Standard Version", "Catalog-only version."),
  },
  {
    versionId: "nasb",
    versionCode: 7,
    name: "New American Standard Bible",
    abbreviation: "NASB",
    language: "en",
    languageName: "English",
    direction: "ltr",
    licenceStatus: "unlicensed",
    enabled: false,
    verseCount: 31102,
    policy: pendingPolicy("New American Standard Bible", "Catalog-only version."),
  },
  {
    versionId: "amp",
    versionCode: 8,
    name: "Amplified Bible",
    abbreviation: "AMP",
    language: "en",
    languageName: "English",
    direction: "ltr",
    licenceStatus: "unlicensed",
    enabled: false,
    verseCount: 31102,
    policy: pendingPolicy("Amplified Bible", "Catalog-only version."),
  },
  {
    versionId: "csb",
    versionCode: 9,
    name: "Christian Standard Bible",
    abbreviation: "CSB",
    language: "en",
    languageName: "English",
    direction: "ltr",
    licenceStatus: "unlicensed",
    enabled: false,
    verseCount: 31102,
    policy: pendingPolicy("Christian Standard Bible", "Catalog-only version."),
  },
  {
    versionId: "nrsv",
    versionCode: 10,
    name: "New Revised Standard Version",
    abbreviation: "NRSV",
    language: "en",
    languageName: "English",
    direction: "ltr",
    licenceStatus: "unlicensed",
    enabled: false,
    verseCount: 31102,
    policy: pendingPolicy("New Revised Standard Version", "Catalog-only version."),
  },
];

export interface PlanSeed {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly dayCount: number;
  readonly schedule: ReadonlyArray<{
    readonly day: number;
    readonly title: string;
    readonly references: readonly string[];
  }>;
}

const johnChapters = Array.from({ length: 21 }, (_, index) => index + 1);

export const READING_PLAN_SEED: PlanSeed = {
  slug: "john-in-21-days",
  title: "John in 21 Days",
  description: "One chapter of John's Gospel each day for three weeks.",
  dayCount: johnChapters.length,
  schedule: johnChapters.map((chapter) => ({
    day: chapter,
    title: `John ${chapter}`,
    references: [`John ${chapter}`],
  })),
};
