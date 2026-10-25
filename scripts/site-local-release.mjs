#!/usr/bin/env node
// The download site with a real installer, in one command: `pnpm site:mac`. It builds the Apple Silicon dmg of the
// desktop app (unsigned, `--publish never`), copies it into the site (apps/site/public/downloads + releases.local.json,
// both ignored by git), builds the site, serves it on 127.0.0.1 and opens the browser on /download/.
// Local only: nothing is uploaded, released or deployed (rule 3). Other systems come later (the CI file builds them).
//   node scripts/site-local-release.mjs [--skip-build]   (--skip-build: reuse the dmg already in the release folder)
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultReleaseDir, writeLocalSiteRelease } from "./release-manifest.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const desktop = path.join(repo, "apps/desktop");
const site = path.join(repo, "apps/site");
const PORT = 3101;

/** @param {string} cmd @param {string[]} args @param {string} cwd @param {Record<string, string>} [env] */
function run(cmd, args, cwd, env = {}) {
  console.log(`\n▸ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", env: { ...process.env, ...env } });
  if (r.status !== 0) {
    console.error(`site:mac: ${cmd} ${args.join(" ")} failed (${r.status ?? r.signal})`);
    process.exit(1);
  }
}

if (process.platform !== "darwin" || process.arch !== "arm64") {
  console.error("site:mac: builds the Apple Silicon dmg, so it runs only on an Apple Silicon Mac");
  process.exit(1);
}

if (!process.argv.includes("--skip-build")) {
  run("pnpm", ["install", "--frozen-lockfile"], desktop);
  run("pnpm", ["run", "setup"], desktop);
  run("pnpm", ["run", "build"], desktop);
  run("node", ["scripts/bundle-harness.mjs"], desktop);
  run("pnpm", ["exec", "electron-builder", "--config", "electron-builder.config.mjs", "--mac", "--publish", "never"], desktop, { MANDAT_MAC_ARCH: "arm64" });
}

const m = await writeLocalSiteRelease({ releaseDir: defaultReleaseDir(process.env), siteDir: site, kinds: ["mac-arm64"] });
console.log(`\n▸ the site serves ${m.assets.map((a) => a.file).join(", ")}`);
run("pnpm", ["--filter", "@mandat/site", "build"], repo);

const url = `http://127.0.0.1:${PORT}/download/`;
const server = spawn("node", [path.join(site, "scripts/serve.mjs"), String(PORT)], { stdio: "inherit" });
setTimeout(() => spawnSync("open", [url]), 800);
console.log(`\n▸ ${url}  (Ctrl+C stops the site)`);
server.on("exit", (code) => process.exit(code ?? 0));
