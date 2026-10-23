#!/usr/bin/env node
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { sourceMetadataSchema } from "./types";
import { buildArchive, buildPackage, searchDocuments, verifyPackage } from "./package-builder";
import {
  fetchKjvSource,
  KJV_SOURCE_RETRIEVED_AT,
  KJV_SOURCE_SHA256,
  KJV_SOURCE_URL,
} from "./fetch-kjv";
import { indexVerses } from "./opensearch-indexer";
import { publishPackage } from "./publish";
import { ContentToolError } from "./types";

const HELP = `HolyWord content pipeline

Commands:
  fetch-kjv  --dest <dir>
  ingest     --source <path> --metadata <file> --out <dir> [--format usfm|osis|json]
             [--built-at <iso-date>] [--archive]
  build-kjv  [--source <dir>] [--metadata <file>] [--out <dir>]
  verify     --package <dir>
  publish    --package <dir> --bucket <name> --region <region>
             [--prefix packages] [--opensearch-url <url>] [--opensearch-index <name>]
             [--opensearch-username <user>] [--opensearch-password <password>]

Environment:
  AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY are read by the AWS SDK for publish.
  OPENSEARCH_URL / OPENSEARCH_USERNAME / OPENSEARCH_PASSWORD may replace the CLI flags.
`;

interface ParsedArgs {
  readonly command: string;
  readonly values: ReadonlyMap<string, string>;
  readonly flags: ReadonlySet<string>;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  let command = "";
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;
    if (arg.startsWith("--")) {
      const name = arg.slice(2);
      const next = argv[index + 1];
      if (next && !next.startsWith("--")) {
        values.set(name, next);
        index += 1;
      } else {
        flags.add(name);
      }
      continue;
    }
    if (!command) {
      command = arg;
      continue;
    }
    throw new ContentToolError("invalid-arguments", `Unexpected argument "${arg}"`);
  }
  return { command, values, flags };
}

function required(values: ReadonlyMap<string, string>, name: string): string {
  const value = values.get(name);
  if (!value) {
    throw new ContentToolError("invalid-arguments", `Missing --${name}`);
  }
  return value;
}

function optional(values: ReadonlyMap<string, string>, name: string): string | undefined {
  return values.get(name);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function commandFetchKjv(args: ParsedArgs): Promise<void> {
  const destination = required(args.values, "dest");
  console.log(`Fetching ${KJV_SOURCE_URL} (retrieved ${KJV_SOURCE_RETRIEVED_AT})`);
  const result = await fetchKjvSource(destination);
  console.log(
    `Extracted ${result.files} files (${result.bytes} bytes) to ${resolve(destination)}; SHA-256 ${KJV_SOURCE_SHA256}`,
  );
}

async function commandIngest(args: ParsedArgs): Promise<void> {
  const metadataPath = required(args.values, "metadata");
  const { readFile } = await import("node:fs/promises");
  const parsed = sourceMetadataSchema.safeParse(
    JSON.parse(await readFile(metadataPath, "utf8")) as unknown,
  );
  if (!parsed.success) {
    throw new ContentToolError(
      "invalid-metadata",
      `Invalid metadata ${metadataPath}: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`,
    );
  }
  const format = optional(args.values, "format");
  if (format && !["usfm", "osis", "json"].includes(format)) {
    throw new ContentToolError("invalid-arguments", "--format must be usfm, osis or json");
  }
  const built = await buildPackage({
    sourcePath: required(args.values, "source"),
    ...(format ? { format: format as "usfm" | "osis" | "json" } : {}),
    metadata: parsed.data,
    outRoot: required(args.values, "out"),
    ...(optional(args.values, "built-at") ? { builtAt: optional(args.values, "built-at") } : {}),
    writeArchive: args.flags.has("archive"),
  });
  console.log(
    JSON.stringify(
      {
        package: built.directory,
        versionId: built.manifest.versionId,
        versionCode: built.manifest.versionCode,
        totals: built.manifest.totals,
        manifestChecksum: built.manifestChecksum,
        ...(built.archive ? { archiveBytes: built.archive.byteLength } : {}),
      },
      null,
      2,
    ),
  );
}

async function commandBuildKjv(args: ParsedArgs): Promise<void> {
  const source = resolve(optional(args.values, "source") ?? ".cache/kjv-usfm");
  if (!(await pathExists(source))) {
    console.log(`KJV source not found at ${source}; fetching it first.`);
    await fetchKjvSource(source);
  }
  const metadataPath = resolve(
    optional(args.values, "metadata") ?? "../../content/sources/kjv/metadata.json",
  );
  const out = resolve(optional(args.values, "out") ?? "../../content/packages");
  const { readFile } = await import("node:fs/promises");
  const parsed = sourceMetadataSchema.safeParse(
    JSON.parse(await readFile(metadataPath, "utf8")) as unknown,
  );
  if (!parsed.success) {
    throw new ContentToolError(
      "invalid-metadata",
      `Invalid metadata ${metadataPath}: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`,
    );
  }
  const built = await buildPackage({
    sourcePath: source,
    format: "usfm",
    metadata: parsed.data,
    outRoot: out,
  });
  console.log(
    JSON.stringify(
      {
        package: built.directory,
        versionId: built.manifest.versionId,
        versionCode: built.manifest.versionCode,
        totals: built.manifest.totals,
        manifestChecksum: built.manifestChecksum,
      },
      null,
      2,
    ),
  );
}

async function commandVerify(args: ParsedArgs): Promise<void> {
  const directory = required(args.values, "package");
  const verified = await verifyPackage(directory);
  console.log(
    JSON.stringify(
      {
        package: verified.directory,
        versionId: verified.manifest.versionId,
        versionCode: verified.manifest.versionCode,
        name: verified.manifest.name,
        totals: verified.manifest.totals,
        manifestChecksum: verified.manifestChecksum,
        versificationId: verified.versification.id,
      },
      null,
      2,
    ),
  );
}

async function commandPublish(args: ParsedArgs): Promise<void> {
  const packageDirectory = required(args.values, "package");
  const verified = await verifyPackage(packageDirectory);
  const objects = await publishPackage(packageDirectory, {
    bucket: required(args.values, "bucket"),
    region: required(args.values, "region"),
    ...(optional(args.values, "prefix") ? { prefix: optional(args.values, "prefix")! } : {}),
  });
  const openSearchUrl = optional(args.values, "opensearch-url") ?? process.env.OPENSEARCH_URL;
  if (openSearchUrl) {
    await indexVerses(
      {
        url: openSearchUrl,
        index:
          optional(args.values, "opensearch-index") ??
          process.env.OPENSEARCH_INDEX ??
          "holyword-verses",
        username: optional(args.values, "opensearch-username") ?? process.env.OPENSEARCH_USERNAME,
        password: optional(args.values, "opensearch-password") ?? process.env.OPENSEARCH_PASSWORD,
      },
      searchDocuments(verified),
    );
  }
  console.log(
    JSON.stringify(
      {
        versionId: verified.manifest.versionId,
        versionCode: verified.manifest.versionCode,
        uploaded: objects,
        indexed: Boolean(openSearchUrl),
      },
      null,
      2,
    ),
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.command || args.flags.has("help") || args.command === "help") {
    console.log(HELP);
    return;
  }
  switch (args.command) {
    case "fetch-kjv":
      return commandFetchKjv(args);
    case "ingest":
      return commandIngest(args);
    case "build-kjv":
      return commandBuildKjv(args);
    case "verify":
      return commandVerify(args);
    case "publish":
      return commandPublish(args);
    case "archive": {
      const bytes = await buildArchive(required(args.values, "package"));
      console.log(`Built ${bytes.byteLength} byte archive`);
      return;
    }
    default:
      throw new ContentToolError("invalid-arguments", `Unknown command "${args.command}"`);
  }
}

main().catch((error: unknown) => {
  if (error instanceof ContentToolError) {
    console.error(`${error.code}: ${error.message}`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
