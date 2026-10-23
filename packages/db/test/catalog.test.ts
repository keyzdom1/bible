import { describe, expect, it } from "vitest";
import { CATALOG, READING_PLAN_SEED } from "../src/catalog";

describe("version catalog seed", () => {
  it("has unique version ids and codes", () => {
    const ids = CATALOG.map((entry) => entry.versionId);
    const codes = CATALOG.map((entry) => entry.versionCode);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("enables KJV only", () => {
    const enabled = CATALOG.filter((entry) => entry.enabled);
    expect(enabled.map((entry) => entry.versionId)).toEqual(["kjv"]);
    expect(enabled[0]!.licenceStatus).toBe("public-domain");
  });

  it("keeps every licensed title disabled until a contract is confirmed", () => {
    for (const entry of CATALOG.filter((entry) => entry.versionId !== "kjv")) {
      expect(entry.enabled, entry.versionId).toBe(false);
      expect(entry.licenceStatus, entry.versionId).toBe("unlicensed");
      expect(entry.policy.status, entry.versionId).toBe("unlicensed");
      expect(entry.policy.offlineDownload, entry.versionId).toBe(false);
      expect(entry.policy.encryption, entry.versionId).toBe("aes-256-gcm");
    }
  });

  it("labels The Message as a paraphrase", () => {
    const msg = CATALOG.find((entry) => entry.versionId === "msg");
    expect(msg?.policy.licenceNote).toMatch(/paraphrase/i);
  });

  it("allows public-domain offline and unlimited copying for KJV", () => {
    const kjv = CATALOG.find((entry) => entry.versionId === "kjv")!;
    expect(kjv.policy.offlineDownload).toBe(true);
    expect(kjv.policy.maxVersesPerCopy).toBeNull();
    expect(kjv.policy.copyright).toMatch(/public domain/i);
    expect(kjv.policy.copyright).toMatch(/Crown/);
  });

  it("ships a 21-day John reading plan", () => {
    expect(READING_PLAN_SEED.dayCount).toBe(21);
    expect(READING_PLAN_SEED.schedule).toHaveLength(21);
    expect(READING_PLAN_SEED.schedule[0]?.references).toEqual(["John 1"]);
    expect(READING_PLAN_SEED.schedule[20]?.references).toEqual(["John 21"]);
  });
});
