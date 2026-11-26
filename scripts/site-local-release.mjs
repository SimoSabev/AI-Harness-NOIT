#!/usr/bin/env node
// The download site with real installers, in one command: `pnpm site:mac` (the Apple Silicon dmg) or `pnpm site:all`
// (D-639: also the Intel dmg, the Windows NSIS .exe, the Linux AppImage and .deb, all cross-built on this Mac). It builds
// the desktop app (`--publish never`; the Mac signing of D-637, Windows and Linux unsigned), copies the installers into
// the site (apps/site/public/downloads + releases.local.json, both ignored by git), builds the site, serves it on
// 127.0.0.1 and opens the browser on /download/.
// Local only: nothing is uploaded, released or deployed (rule 3).
//   node scripts/site-local-release.mjs [--all | --targets mac-x64,win-x64,…] [--skip-build] [--no-serve]
//   (--skip-build: reuse the installers already in the release folder; --no-serve: a site server already runs)
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultReleaseDir, writeLocalSiteRelease } from "./release-manifest.mjs";
import { builderRuns, parseLocalArgs, siteKinds } from "./site-local-plan.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const desktop = path.join(repo, "apps/desktop");
const site = path.join(repo, "apps/site");
const PORT = 3101;

/** @param {string} cmd @param {string[]} args @param {string} cwd @param {Record<string, string>} [env] */
function run(cmd, args, cwd, env = {}) {
  console.log(`\n▸ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", env: { ...process.env, ...env } });
  if (r.status !== 0) {
    console.error(`site-local: ${cmd} ${args.join(" ")} failed (${r.status ?? r.signal})`);
    process.exit(1);
  }
}

if (process.platform !== "darwin" || process.arch !== "arm64") {
  console.error("site-local: the cross-builds (D-639) are set up for an Apple Silicon Mac only");
  process.exit(1);
}

let opts;
try {
  opts = parseLocalArgs(process.argv.slice(2));
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}

if (!opts.skipBuild) {
  run("pnpm", ["install", "--frozen-lockfile"], desktop);
  run("pnpm", ["run", "setup"], desktop);
  run("pnpm", ["run", "build"], desktop);
  // one bundle for every target: it has no native code (bundle-harness.mjs refuses one)
  run("node", ["scripts/bundle-harness.mjs"], desktop);
  for (const b of builderRuns(opts.targets)) run("pnpm", ["exec", "electron-builder", ...b.args], desktop, b.env);
}

const m = await writeLocalSiteRelease({ releaseDir: defaultReleaseDir(process.env), siteDir: site, kinds: siteKinds(opts.targets) });
console.log(`\n▸ the site serves ${m.assets.map((a) => a.file).join(", ")}`);
run("pnpm", ["--filter", "@mandat/site", "build"], repo);
if (!opts.serve) {
  console.log(`\n▸ apps/site/out is ready; the running site server shows it at http://127.0.0.1:${PORT}/download/`);
  process.exit(0);
}

const url = `http://127.0.0.1:${PORT}/download/`;
const server = spawn("node", [path.join(site, "scripts/serve.mjs"), String(PORT)], { stdio: "inherit" });
setTimeout(() => spawnSync("open", [url]), 800);
console.log(`\n▸ ${url}  (Ctrl+C stops the site)`);
server.on("exit", (code) => process.exit(code ?? 0));
