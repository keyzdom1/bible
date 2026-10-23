#!/usr/bin/env node
/**
 * Best-effort Lighthouse run against a HolyWord URL.
 *
 *   node scripts/lighthouse.mjs [url] [--strict]
 *
 *   url      defaults to http://localhost:3000
 *   --strict exit non-zero when a measured category scores below the
 *            threshold (0.8), instead of only reporting
 *
 * The script needs a local Chrome via Lighthouse (fetched through npx). When
 * Chrome or Lighthouse is unavailable it warns and exits 0 — the check is
 * advisory by default so it never blocks a machine that cannot run it. Use
 * --strict in environments where a score regression must fail the pipeline.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STRICT_THRESHOLD = 0.8;
const CATEGORIES = "performance,accessibility,best-practices,seo";

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const url = args.find((arg) => !arg.startsWith("--")) ?? "http://localhost:3000";

const reportDir = join(repoRoot, "build", "lighthouse");
mkdirSync(reportDir, { recursive: true });
const reportPath = join(reportDir, `report-${Date.now()}.json`);

const command = [
  "npx --yes lighthouse",
  `"${url}"`,
  "--output=json",
  `--output-path="${reportPath}"`,
  `--only-categories=${CATEGORIES}`,
  '--chrome-flags="--headless=new --no-sandbox"',
  "--quiet",
].join(" ");

console.log(`:: running Lighthouse against ${url}${strict ? " (strict)" : " (best-effort)"}`);

const result = spawnSync(command, {
  shell: true,
  encoding: "utf8",
  timeout: 5 * 60 * 1000,
});

function bail(reason) {
  if (strict) {
    console.error(`:: Lighthouse failed: ${reason}`);
    process.exit(1);
  }
  console.warn(`:: Lighthouse skipped (best-effort): ${reason}`);
  process.exit(0);
}

if (result.error) bail(result.error.message);
if (result.status !== 0) {
  const detail = (result.stderr || result.stdout || `exit code ${result.status}`)
    .trim()
    .split("\n")
    .slice(-4)
    .join("\n  ");
  bail(detail || `exit code ${result.status}`);
}
if (!existsSync(reportPath)) bail("no report was written");

const report = JSON.parse(readFileSync(reportPath, "utf8"));
const rows = Object.values(report.categories ?? {}).map((category) => ({
  category: category.id,
  score: category.score ?? 0,
}));

if (rows.length === 0) bail("report contained no categories");

console.log(`:: report: ${reportPath}`);
for (const row of rows) {
  const pass = row.score >= STRICT_THRESHOLD;
  console.log(
    `   ${row.category.padEnd(16)} ${(row.score * 100).toFixed(0)}${pass ? "" : "  (below threshold)"}`,
  );
}

if (strict) {
  const failing = rows.filter((row) => row.score < STRICT_THRESHOLD);
  if (failing.length > 0) {
    console.error(
      `:: strict Lighthouse gate failed: ${failing.map((row) => `${row.category}=${(row.score * 100).toFixed(0)}`).join(", ")} (threshold ${(STRICT_THRESHOLD * 100).toFixed(0)})`,
    );
    process.exit(1);
  }
  console.log(":: strict Lighthouse gate passed");
}
