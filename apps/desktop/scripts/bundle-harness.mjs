#!/usr/bin/env node
// E9g A5 (D-376): builds the harness bundle that goes into resources/harness of the installed desktop app:
// the tracked sources (for the image builds, migrations, fixtures), the build outputs (packages/*/dist, apps/web/.next)
// and production node_modules (hoisted). The installed app runs it with Electron's own Node (ELECTRON_RUN_AS_NODE).
// Usage (from the repo root or anywhere): node apps/desktop/scripts/bundle-harness.mjs [--skip-build]
// Output: $MANDAT_DESKTOP_OUT/harness (default <tmp>/mandat-desktop/harness), the folder electron-builder.config.mjs reads.
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BUNDLE_INSTALL_ARGS, bundleSourceFiles, buildOutputs, foreignNativeAddons, keepNextFile, workspaceShim } from "../dist/bundle-plan.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const outRoot = process.env.MANDAT_DESKTOP_OUT ? path.resolve(process.env.MANDAT_DESKTOP_OUT) : path.join(os.tmpdir(), "mandat-desktop");
const outPath = path.join(outRoot, "harness");
const skipBuild = process.argv.includes("--skip-build");

function run(cmd, args, cwd) {
  // Windows: pnpm is pnpm.cmd, which Node runs only through a shell; the arguments are fixed constants here
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) {
    console.error(`bundle: ${cmd} ${args.join(" ")} failed (${r.status ?? r.signal})`);
    process.exit(1);
  }
}

if (!skipBuild) run("pnpm", ["build"], repo);
if (!existsSync(path.join(repo, "packages/cli/dist/main.js")) || !existsSync(path.join(repo, "apps/web/.next/BUILD_ID"))) {
  console.error("bundle: the harness is not built (packages/cli/dist, apps/web/.next); run pnpm build");
  process.exit(1);
}

rmSync(outPath, { recursive: true, force: true });
mkdirSync(outPath, { recursive: true });
// the real path (macOS: /var → /private/var), so link targets compare
const out = realpathSync(outPath);

// 1. tracked sources
const ls = spawnSync("git", ["ls-files", "-z"], { cwd: repo, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
if (ls.status !== 0) process.exit(1);
const files = bundleSourceFiles(ls.stdout.split("\0").filter((f) => f !== ""));
let copied = 0;
for (const f of files) {
  const from = path.join(repo, f);
  if (!existsSync(from)) continue; // deleted in the working tree
  const to = path.join(out, f);
  mkdirSync(path.dirname(to), { recursive: true });
  copyFileSync(from, to);
  chmodSync(to, statSync(from).mode & 0o777);
  copied++;
}

// 2. build outputs of every workspace package (the members are the folders with a package.json under the workspace globs)
const members = [];
for (const dir of ["packages", "apps"]) {
  for (const name of readdirSync(path.join(repo, dir))) {
    const m = `${dir}/${name}`;
    if (m !== "apps/desktop" && existsSync(path.join(repo, m, "package.json"))) members.push(m);
  }
}
for (const m of ["bench", "spikes"]) if (existsSync(path.join(repo, m, "package.json"))) members.push(m);
for (const o of buildOutputs(members)) {
  const from = path.join(repo, o);
  if (!existsSync(from)) continue;
  const filter = o === "apps/web/.next" ? (src) => keepNextFile(path.relative(from, src).split(path.sep).join("/")) : () => true;
  cpSync(from, path.join(out, o), { recursive: true, filter });
}

// 3. production node_modules, hoisted
run("pnpm", [...BUNDLE_INSTALL_ARGS], out);

// 3b. no links in the bundle (installers do not carry them reliably): pnpm's bookkeeping and .bin go; the workspace
// links in node_modules/@mandat become shim packages that re-export the real files; nested @mandat links go (the root
// shims answer for them)
const links = [];
const findLinks = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isSymbolicLink()) links.push(p);
    else if (e.isDirectory()) {
      if (e.name === ".bin" && path.basename(path.dirname(p)) === "node_modules") rmSync(p, { recursive: true, force: true });
      else findLinks(p);
    }
  }
};
for (const junk of [".pnpm", ".modules.yaml", ".pnpm-workspace-state-v1.json"]) rmSync(path.join(out, "node_modules", junk), { recursive: true, force: true });
findLinks(out);
const rootScope = path.join(out, "node_modules", "@mandat");
const nextExternals = path.join(out, "apps", "web", ".next", "node_modules");
for (const l of links) {
  const target = realpathSync(l);
  // Next's server externals (pg, typescript as <name>-<hash>) link into the build machine's store: a real copy of the
  // same package from the bundle's node_modules takes their place (its own dependencies resolve upwards from there)
  if (path.dirname(l) === nextExternals) {
    const name = JSON.parse(readFileSync(path.join(target, "package.json"), "utf8")).name;
    const from = path.join(out, "node_modules", name);
    rmSync(l);
    cpSync(existsSync(from) ? from : target, l, { recursive: true, dereference: true });
    continue;
  }
  if (!target.startsWith(out + path.sep) || path.basename(path.dirname(path.dirname(l))) !== "node_modules" || path.basename(path.dirname(l)) !== "@mandat") {
    console.error(`bundle: unexpected link ${path.relative(out, l)} -> ${target}`);
    process.exit(1);
  }
  rmSync(l);
  if (path.dirname(l) !== rootScope) continue;
  const pkg = JSON.parse(readFileSync(path.join(target, "package.json"), "utf8"));
  const shim = workspaceShim(pkg.name, pkg.exports, path.relative(l, target).split(path.sep).join("/"));
  if (!shim) continue;
  mkdirSync(l, { recursive: true });
  for (const [f, body] of Object.entries(shim)) writeFileSync(path.join(l, f), body);
}
const left = [];
const anyLinks = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (lstatSync(p).isSymbolicLink()) left.push(p);
    else if (e.isDirectory()) anyLinks(p);
  }
};
anyLinks(out);
if (left.length > 0) {
  console.error(`bundle: links left:\n  ${left.join("\n  ")}`);
  process.exit(1);
}

// 4. checks: the CLI and next are where the desktop expects them; no native addon ties the bundle to this OS
for (const need of ["packages/cli/dist/main.js", "apps/web/.next/BUILD_ID", "supabase/migrations", "docker/sandbox/Dockerfile", "apps/web/public/icon-192.png"]) {
  if (!existsSync(path.join(out, need))) {
    console.error(`bundle: missing ${need}`);
    process.exit(1);
  }
}
const resolveNext = spawnSync(process.execPath, ["-e", "console.log(require('module').createRequire(process.argv[1]).resolve('next/dist/bin/next'))", path.join(out, "apps/web/package.json")], { encoding: "utf8" });
if (resolveNext.status !== 0) {
  console.error("bundle: next does not resolve from apps/web");
  process.exit(1);
}
const addons = [];
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".node")) addons.push(path.relative(out, p).split(path.sep).join("/"));
  }
};
walk(path.join(out, "node_modules"));
const foreign = foreignNativeAddons(addons);
if (foreign.length > 0) {
  console.error(`bundle: native addons would tie the bundle to ${process.platform}-${process.arch}:\n  ${foreign.join("\n  ")}`);
  process.exit(1);
}
// Next's compiler is for `next build` only; dropping it keeps the bundle the same on every OS/arch
for (const a of addons) rmSync(path.join(out, path.dirname(a)), { recursive: true, force: true });

const commit = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repo, encoding: "utf8" }).stdout.trim();
writeFileSync(path.join(out, "BUNDLE.json"), JSON.stringify({ commit, built_at: new Date().toISOString(), node: process.versions.node }, null, 2) + "\n");
console.log(`bundle: ${copied} source files, ${members.length} packages → ${out}`);
