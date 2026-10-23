import { describe, expect, it } from "vitest";
import type { LicencePolicy } from "../src/content";
import {
  checkCopyAllowed,
  checkDownloadAllowed,
  copyrightNotice,
  formatCitation,
  isVersionVisible,
  type VersionAvailability,
} from "../src/licensing";

const publicDomainPolicy: LicencePolicy = {
  status: "public-domain",
  offlineDownload: true,
  maxDevices: null,
  maxVersesPerCopy: null,
  maxVersesPerShare: 500,
  encryption: "none",
  regions: null,
  copyright: "Public domain in the United States.",
  attribution: "King James Version",
};

const licensedPolicy: LicencePolicy = {
  ...publicDomainPolicy,
  status: "licensed",
  maxDevices: 3,
  maxVersesPerCopy: 5,
  maxVersesPerShare: 25,
  encryption: "aes-256-gcm",
  regions: ["US", "CA"],
  copyright: "© Publisher. Used by permission.",
  attribution: "New International Version",
};

const kjv: VersionAvailability = {
  enabled: true,
  licenceStatus: "public-domain",
  policy: publicDomainPolicy,
};

const niv: VersionAvailability = {
  enabled: true,
  licenceStatus: "licensed",
  policy: licensedPolicy,
};

const baseContext = { hasEntitlement: false, activeDeviceCount: 0, region: "US" };

describe("formatCitation", () => {
  it("formats ranges and always includes attribution", () => {
    const text = formatCitation({
      book: "JHN",
      chapter: 3,
      abbreviation: "KJV",
      policy: publicDomainPolicy,
      verses: [
        { verse: 16, text: "For God so loved the world," },
        { verse: 17, text: "For God sent not his Son into the world to condemn the world." },
        { verse: 19, text: "And this is the condemnation." },
      ],
    });
    expect(text).toContain("16 For God so loved the world,");
    expect(text).toContain("John 3:16-17,19 (KJV)");
    expect(text).toContain("King James Version\nPublic domain in the United States.");
  });

  it("rejects an empty selection", () => {
    expect(() =>
      formatCitation({
        book: "JHN",
        chapter: 1,
        abbreviation: "KJV",
        policy: publicDomainPolicy,
        verses: [],
      }),
    ).toThrow("At least one verse");
  });
});

describe("checkDownloadAllowed", () => {
  it("allows public-domain downloads without entitlements", () => {
    expect(checkDownloadAllowed(kjv, baseContext)).toEqual({ allowed: true });
  });

  it("blocks disabled and unlicensed versions", () => {
    expect(checkDownloadAllowed({ ...kjv, enabled: false }, baseContext)).toMatchObject({
      allowed: false,
      reason: "version-disabled",
    });
    expect(
      checkDownloadAllowed({ ...kjv, licenceStatus: "unlicensed" }, baseContext),
    ).toMatchObject({
      allowed: false,
      reason: "version-disabled",
    });
    expect(
      checkDownloadAllowed(
        { ...kjv, policy: { ...publicDomainPolicy, status: "unlicensed" } },
        baseContext,
      ),
    ).toMatchObject({ allowed: false, reason: "not-licensed" });
  });

  it("respects offline permission", () => {
    expect(
      checkDownloadAllowed(
        { ...kjv, policy: { ...publicDomainPolicy, offlineDownload: false } },
        baseContext,
      ),
    ).toMatchObject({ allowed: false, reason: "offline-not-permitted" });
  });

  it("requires an entitlement for licensed versions", () => {
    expect(checkDownloadAllowed(niv, baseContext)).toMatchObject({
      allowed: false,
      reason: "entitlement-required",
    });
    expect(checkDownloadAllowed(niv, { ...baseContext, hasEntitlement: true })).toEqual({
      allowed: true,
    });
  });

  it("enforces device limits", () => {
    expect(
      checkDownloadAllowed(niv, { ...baseContext, hasEntitlement: true, activeDeviceCount: 2 }),
    ).toEqual({ allowed: true });
    expect(
      checkDownloadAllowed(niv, { ...baseContext, hasEntitlement: true, activeDeviceCount: 3 }),
    ).toMatchObject({ allowed: false, reason: "device-limit" });
  });

  it("enforces regional restrictions when a region is known", () => {
    expect(
      checkDownloadAllowed(niv, { ...baseContext, hasEntitlement: true, region: "GB" }),
    ).toMatchObject({ allowed: false, reason: "region-blocked" });
    expect(
      checkDownloadAllowed(niv, { ...baseContext, hasEntitlement: true, region: null }),
    ).toEqual({ allowed: true });
  });
});

describe("checkCopyAllowed", () => {
  it("enforces copy and share caps", () => {
    expect(checkCopyAllowed(licensedPolicy, 5, "copy")).toEqual({ allowed: true, maxVerses: 5 });
    expect(checkCopyAllowed(licensedPolicy, 6, "copy")).toEqual({ allowed: false, maxVerses: 5 });
    expect(checkCopyAllowed(licensedPolicy, 25, "share")).toEqual({ allowed: true, maxVerses: 25 });
    expect(checkCopyAllowed(licensedPolicy, 26, "share")).toEqual({
      allowed: false,
      maxVerses: 25,
    });
  });

  it("treats null as unlimited", () => {
    expect(
      checkCopyAllowed({ ...publicDomainPolicy, maxVersesPerCopy: null }, 10_000, "copy"),
    ).toEqual({
      allowed: true,
      maxVerses: null,
    });
  });

  it("rejects invalid counts", () => {
    expect(checkCopyAllowed(licensedPolicy, 0, "copy").allowed).toBe(false);
    expect(checkCopyAllowed(licensedPolicy, 1.5, "copy").allowed).toBe(false);
  });
});

describe("presentation helpers", () => {
  it("hides unlicensed and disabled versions", () => {
    expect(isVersionVisible(kjv)).toBe(true);
    expect(isVersionVisible({ ...kjv, enabled: false })).toBe(false);
    expect(isVersionVisible({ ...kjv, licenceStatus: "unlicensed" })).toBe(false);
  });

  it("builds the attribution notice", () => {
    expect(copyrightNotice(licensedPolicy)).toBe(
      "New International Version\n© Publisher. Used by permission.",
    );
  });
});
