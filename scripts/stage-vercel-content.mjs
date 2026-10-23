#!/usr/bin/env node
/**
 * Copies the committed content packages under apps/api so the Vercel function
 * bundle can include them (see apps/api/vercel.json `includeFiles`). Runs
 * during the Vercel build via the API's `vercel-build` script and locally on
 * demand; safe to re-run. The copy is gitignored — only the canonical files
 * under content/packages are committed.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(repoRoot, "content", "packages");
const target = join(repoRoot, "apps", "api", "content", "packages");

if (!existsSync(source)) {
  throw new Error(`Missing content packages at ${source}`);
}

rmSync(join(repoRoot, "apps", "api", "content"), { recursive: true, force: true });
mkdirSync(dirname(target), { recursive: true });
cpSync(source, target, { recursive: true });
console.log(`Staged content packages: ${source} -> ${target}`);
