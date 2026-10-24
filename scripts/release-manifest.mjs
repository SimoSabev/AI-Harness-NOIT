#!/usr/bin/env node
// E9g B (D-377): writes apps/site/releases.json (the installers the download site lists) from the electron-builder
// output folder (apps/desktop/electron-builder.config.mjs: $MANDAT_DESKTOP_OUT/release, default <tmp>/mandat-desktop/release).
// Only reads and hashes local files: no upload, no release, no network (rule 3). Simo runs it for a published release:
//   node scripts/release-manifest.mjs [--dir <folder>] [--out <file>] [--version <x.y.z>]
import { createHash } from "node:crypto";
import { createReadStream, readdirSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SiteAssetKind, SiteReleaseManifest, siteAssetKind } from "../packages/contract/dist/index.js";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORDER = SiteAssetKind.options;

/** @param {Record<string, string | undefined>} env */
export function defaultReleaseDir(env) {
  return env.MANDAT_DESKTOP_OUT ? path.resolve(env.MANDAT_DESKTOP_OUT, "release") : path.join(os.tmpdir(), "mandat-desktop", "release");
}

/** @param {string[]} argv @returns {{ dir: string | undefined, out: string | undefined, version: string | undefined }} */
export function parseArgs(argv) {
  /** @type {{ dir: string | undefined, out: string | undefined, version: string | undefined }} */
  const o = { dir: undefined, out: undefined, version: undefined };
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const key = flag === "--dir" ? "dir" : flag === "--out" ? "out" : flag === "--version" ? "version" : null;
    if (!key) throw new Error(`release-manifest: unknown argument ${flag}`);
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) throw new Error(`release-manifest: ${flag} needs a value`);
    o[key] = v;
  }
  return o;
}

/**
 * The manifest of the installers among `files` (everything else is ignored); one version per manifest.
 * @param {{ name: string, sha256: string, size: number }[]} files @param {string} [version]
 */
export function buildManifest(files, version) {
  const installers = files.filter((f) => siteAssetKind(f.name) !== null);
  const versions = [...new Set(installers.map((f) => /^Harness-(.+)-(mac|win|linux)-[^-]+$/.exec(f.name.replace(/\.[^.]+$/, ""))?.[1] ?? ""))].sort();
  const chosen = version ?? (versions.length > 1 ? null : versions[0]);
  if (chosen === null) throw new Error(`release-manifest: several versions: ${versions.join(", ")} (pass --version)`);
  const assets = installers
    .filter((f) => f.name.startsWith(`Harness-${chosen}-`))
    .map((f) => ({ kind: /** @type {import("../packages/contract/dist/index.js").SiteAssetKind} */ (siteAssetKind(f.name)), file: f.name, sha256: f.sha256, size: f.size }))
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  return SiteReleaseManifest.parse({ version: assets.length ? chosen : null, assets });
}

/** @param {string} file @returns {Promise<string>} */
function sha256(file) {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(file).on("error", reject).on("data", (c) => h.update(c)).on("end", () => resolve(h.digest("hex")));
  });
}

/** @param {{ dir: string, out: string, version?: string | undefined }} o */
export async function writeReleaseManifest(o) {
  const names = readdirSync(o.dir).filter((n) => siteAssetKind(n) !== null && statSync(path.join(o.dir, n)).isFile());
  const files = await Promise.all(names.map(async (name) => ({ name, sha256: await sha256(path.join(o.dir, name)), size: statSync(path.join(o.dir, name)).size })));
  const m = buildManifest(files, o.version);
  writeFileSync(o.out, `${JSON.stringify(m, null, 2)}\n`);
  return m;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = parseArgs(process.argv.slice(2));
  const dir = a.dir ? path.resolve(a.dir) : defaultReleaseDir(process.env);
  const out = a.out ? path.resolve(a.out) : path.join(repo, "apps/site/releases.json");
  const m = await writeReleaseManifest({ dir, out, version: a.version });
  console.log(`release-manifest: ${m.assets.length} installer(s)${m.version ? ` of ${m.version}` : ""} → ${path.relative(process.cwd(), out) || out}`);
}
