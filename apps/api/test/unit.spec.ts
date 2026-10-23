import { generateKeyPairSync, verify } from "node:crypto";
import { resolve } from "node:path";
import { CloudFrontSigner, decodeCloudFrontBase64 } from "../src/content/cloudfront-signer";
import { OpenSearchClient } from "../src/content/open-search.client";
import { loadConfig, parseVersionFlags } from "../src/config";

describe("per-version feature flags", () => {
  it("resolves the default package mirror from the workspace root", () => {
    const config = loadConfig({ NODE_ENV: "test" });
    expect(config.contentPackageDir).toBe(resolve(__dirname, "../../../content/packages"));
  });

  it("treats an empty value as no deployment allow-list", () => {
    expect(parseVersionFlags(undefined)).toBeUndefined();
    expect(parseVersionFlags("  ")).toBeUndefined();
  });

  it("parses and validates version ids", () => {
    expect([...parseVersionFlags("kjv, niv-2011")!]).toEqual(["kjv", "niv-2011"]);
    expect(() => parseVersionFlags("kjv,../secret")).toThrowError(/Invalid version id/);
  });
});

describe("CloudFront signed URLs", () => {
  it("signs one resource with a custom policy that expires at the requested time", () => {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const signer = new CloudFrontSigner({
      baseUrl: "https://d111111abcdef8.cloudfront.net",
      keyPairId: "KTEST",
      privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    });
    const expiresAt = new Date("2026-10-21T12:05:00.000Z");
    const signed = signer.sign("packages/kjv/1/package.zip", expiresAt);
    const url = new URL(signed);

    expect(url.origin).toBe("https://d111111abcdef8.cloudfront.net");
    expect(url.pathname).toBe("/packages/kjv/1/package.zip");
    expect(url.searchParams.get("Key-Pair-Id")).toBe("KTEST");

    const policy = decodeCloudFrontBase64(url.searchParams.get("Policy")!).toString("utf8");
    const parsed = JSON.parse(policy) as {
      Statement: Array<{
        Resource: string;
        Condition: { DateLessThan: { "AWS:EpochTime": number } };
      }>;
    };
    expect(parsed.Statement[0]?.Resource).toBe(
      "https://d111111abcdef8.cloudfront.net/packages/kjv/1/package.zip",
    );
    expect(parsed.Statement[0]?.Condition.DateLessThan["AWS:EpochTime"]).toBe(
      Math.floor(expiresAt.getTime() / 1000),
    );

    const signature = decodeCloudFrontBase64(url.searchParams.get("Signature")!);
    expect(verify("RSA-SHA1", Buffer.from(policy), publicKey, signature)).toBe(true);
  });
});

describe("OpenSearch query adapter", () => {
  it("filters by visible versions and maps safe source documents", async () => {
    let requestBody: unknown;
    const fakeFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          hits: {
            hits: [
              {
                _source: {
                  verseId: "JHN.3.16",
                  versionId: "kjv",
                  book: "JHN",
                  chapter: 3,
                  verse: 16,
                  text: "Synthetic verse.",
                },
              },
              {
                _source: {
                  verseId: "GEN.1.1",
                  versionId: "niv",
                  book: "GEN",
                  chapter: 1,
                  verse: 1,
                  text: "Not visible.",
                },
              },
            ],
          },
        }),
      } as Response;
    }) as typeof fetch;

    const client = new OpenSearchClient(
      { url: "https://search.test", index: "verses", timeoutMs: 1000 },
      fakeFetch,
    );
    const documents = await client.search("beginning", ["kjv"], 10);
    expect(documents).toEqual([
      {
        verseId: "JHN.3.16",
        versionId: "kjv",
        book: "JHN",
        chapter: 3,
        verse: 16,
        text: "Synthetic verse.",
      },
    ]);
    expect(requestBody).toMatchObject({
      size: 10,
      query: {
        bool: {
          filter: [{ terms: { versionId: ["kjv"] } }],
        },
      },
    });
  });
});
