#!/usr/bin/env node
/**
 * Builds an Elastic Beanstalk deploy bundle for one app and zips it into build/.
 *
 *   node scripts/build-bundle.mjs api   -> build/holyword-api-<version>.zip
 *   node scripts/build-bundle.mjs web   -> build/holyword-web-<version>.zip
 *
 * api: pnpm deploy --prod stages the NestJS app with a real node_modules tree
 *      (workspace deps resolved), the compiled dist/ is copied in, and the
 *      bundle starts with `npm start` -> node dist/main.js.
 *
 * web: Next.js `output: "standalone"` already emits a self-contained server
 *      bundle; static assets and public/ are merged next to server.js.
 *
 * Run `pnpm build` first (CI does), or this script will build the app itself.
 */

import { execFileSync, execSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const APPS = {
  api: {
    workspace: "@holyword/api",
    dir: join(repoRoot, "apps", "api"),
    buildArtifact: join("dist", "main.js"),
  },
  web: {
    workspace: "@holyword/web",
    dir: join(repoRoot, "apps", "web"),
    // Gate on the standalone output itself: a BUILD_ID left over from a build
    // without `output: "standalone"` would let ensureBuilt skip the rebuild
    // that stageWeb needs.
    buildArtifact: join(".next", "standalone", "server.js"),
  },
};

const appKey = process.argv[2];
if (!appKey || !(appKey in APPS)) {
  console.error("Usage: node scripts/build-bundle.mjs <api|web>");
  process.exit(2);
}
const app = APPS[appKey];

function versionLabel() {
  const sha = (
    process.env.GITHUB_SHA ??
    (() => {
      try {
        return execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
      } catch {
        return "local";
      }
    })()
  ).slice(0, 7);
  const run = process.env.GITHUB_RUN_ID;
  return run ? `${run}-${sha}` : sha;
}

function ensureBuilt() {
  if (existsSync(join(app.dir, app.buildArtifact))) return;
  console.log(`:: ${app.workspace} is not built yet, running the build...`);
  execSync(`pnpm --filter ${app.workspace} build`, { cwd: repoRoot, stdio: "inherit" });
}

function findFile(root, name, depth = 6) {
  if (depth < 0) return null;
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    if (entry === name) return full;
    if (statSync(full).isDirectory()) {
      const found = findFile(full, name, depth - 1);
      if (found) return found;
    }
  }
  return null;
}

function stageApi(staging) {
  // pnpm deploy resolves workspace:* into a real node_modules tree. The hoisted
  // linker is deliberate: it produces plain directories (no junction/symlink
  // forest), so the zip builds fast, stays linear in size, and extracts
  // identically on the Elastic Beanstalk Linux hosts. --legacy is required by
  // pnpm 10 for deploy without inject-workspace-packages.
  execSync(
    `pnpm --filter ${app.workspace} deploy --prod --legacy --config.node-linker=hoisted "${staging}"`,
    {
      cwd: repoRoot,
      stdio: "inherit",
    },
  );

  cpSync(join(app.dir, "dist"), join(staging, "dist"), { recursive: true });

  // pnpm deploy copies the whole app folder; Elastic Beanstalk only runs
  // `node dist/main.js`, so drop sources, tests and build config from the
  // deployable bundle.
  for (const junk of [
    "src",
    "test",
    "tsconfig.json",
    "tsconfig.build.json",
    "nest-cli.json",
    "jest.config.cjs",
    ".turbo",
  ]) {
    rmSync(join(staging, junk), { recursive: true, force: true });
  }

  const checks = [
    join(staging, "dist", "main.js"),
    join(staging, "node_modules", "@nestjs", "core"),
    join(staging, "node_modules", "@holyword", "db"),
  ];
  for (const path of checks) {
    if (!existsSync(path)) throw new Error(`API bundle is incomplete: missing ${path}`);
  }

  // pnpm's layout keeps transitive deps (e.g. postgres under @holyword/db)
  // behind junctions/symlinks inside the bundle; loading the package for real
  // proves every link resolves before we ship the zip.
  execFileSync(
    process.execPath,
    ["-e", "require('@holyword/db') && console.log('workspace deps resolve')"],
    { cwd: staging, stdio: "inherit" },
  );

  // Deterministic start for the Elastic Beanstalk Node platform.
  const manifest = JSON.parse(readFileSync(join(staging, "package.json"), "utf8"));
  manifest.scripts = { start: "node dist/main.js" };
  delete manifest.devDependencies;
  writeFileSync(join(staging, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

function stageWeb(staging) {
  const standalone = join(app.dir, ".next", "standalone");
  if (!existsSync(standalone)) {
    throw new Error(`Missing ${standalone}. Ensure next.config.ts keeps output: "standalone".`);
  }

  cpSync(standalone, staging, { recursive: true });

  const server = findFile(staging, "server.js");
  if (!server) throw new Error("Standalone bundle has no server.js");
  const serverDir = dirname(server);
  const serverRel = relative(staging, server).split(sep).join("/");

  // server.js resolves .next/static and public relative to its own directory.
  cpSync(join(app.dir, ".next", "static"), join(serverDir, ".next", "static"), { recursive: true });
  cpSync(join(app.dir, "public"), join(serverDir, "public"), { recursive: true });

  for (const path of [join(serverDir, ".next", "static"), join(serverDir, "public")]) {
    if (!existsSync(path)) throw new Error(`Web bundle is incomplete: missing ${path}`);
  }

  writeFileSync(
    join(staging, "package.json"),
    `${JSON.stringify({ name: "holyword-web", private: true, scripts: { start: `node ${serverRel}` } }, null, 2)}\n`,
  );
}

function zipDirectory(source, zipPath) {
  if (process.platform === "win32") {
    // Windows' bundled bsdtar writes proper forward-slash zip entries.
    // Compress-Archive stores backslash separators, which Linux extractors
    // (Elastic Beanstalk deploys into an AL2023 host) would read as literal
    // part of the filename, breaking every path in the bundle.
    execFileSync("tar", ["-a", "-cf", zipPath, "-C", source, "."], { stdio: "inherit" });
  } else {
    execFileSync("zip", ["-qr", zipPath, "."], { cwd: source, stdio: "inherit" });
  }
}

const version = versionLabel();
const staging = join(repoRoot, "build", `${appKey}-bundle`);
const zipPath = join(repoRoot, "build", `holyword-${appKey}-${version}.zip`);

ensureBuilt();
rmSync(staging, { recursive: true, force: true });
rmSync(zipPath, { force: true });
mkdirSync(staging, { recursive: true });
mkdirSync(join(repoRoot, "build"), { recursive: true });

if (appKey === "api") stageApi(staging);
else stageWeb(staging);

zipDirectory(staging, zipPath);

const sizeMb = (statSync(zipPath).size / 1024 / 1024).toFixed(1);
console.log(`Bundle ready: ${zipPath} (${sizeMb} MB, version ${version})`);
