import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { unzipSync } from "fflate";
import { ContentToolError } from "./types";

export const KJV_SOURCE_URL = "https://ebible.org/Scriptures/eng-kjv_usfm.zip";
export const KJV_SOURCE_SHA256 = "67561758cf58d9e767e89226a99171dba722579157d3894767c2f27538bcb38e";
export const KJV_SOURCE_RETRIEVED_AT = "2026-10-21";

function isSafeRelativePath(path: string): boolean {
  return !path.startsWith("/") && !path.includes(`..${sep}`) && !path.includes("../");
}

/**
 * Downloads the public-domain eBible USFM archive and verifies the pinned digest.
 * The source archive contains Strong's markup and Apocrypha; intakers strip the
 * editorial apparatus and ignore non-canonical books rather than committing them.
 */
export async function fetchKjvSource(
  destination: string,
): Promise<{ files: number; bytes: number }> {
  const response = await fetch(KJV_SOURCE_URL, {
    headers: { "user-agent": "HolyWord content pipeline (offline-first Bible app)" },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new ContentToolError(
      "source-download-failed",
      `Could not download the KJV source (${response.status})`,
    );
  }
  const archive = new Uint8Array(await response.arrayBuffer());
  const digest = createHash("sha256").update(archive).digest("hex");
  if (digest !== KJV_SOURCE_SHA256) {
    throw new ContentToolError(
      "source-checksum-mismatch",
      `KJV source checksum is ${digest}, expected ${KJV_SOURCE_SHA256}. Review the upstream change before updating the pin.`,
    );
  }

  const entries = unzipSync(archive);
  const root = resolve(destination);
  let files = 0;
  let bytes = 0;
  for (const [relativePath, data] of Object.entries(entries)) {
    if (!relativePath || relativePath.endsWith("/") || !isSafeRelativePath(relativePath)) continue;
    const target = resolve(root, relativePath);
    if (!target.startsWith(`${root}${sep}`)) continue;
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, data);
    files += 1;
    bytes += data.byteLength;
  }
  if (files === 0) {
    throw new ContentToolError("source-empty", "The KJV archive contained no files");
  }
  return { files, bytes };
}

export function kjvDefaultDestination(base: string): string {
  return join(base, "kjv-usfm");
}
