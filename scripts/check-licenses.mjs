#!/usr/bin/env node
// D-052 / D-077: two lists from pnpm — all packages and --prod. A prod package must be in `allowed`;
// a dev-only package may also use a devOnly license exception. Workspace packages (@mandat/*) are skipped.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spdxAllowed } from "./spdx.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * @param {Record<string, {name: string, versions: string[], license: string}[]>} list output of `pnpm licenses list --json`
 * @returns {Map<string, string>} name@version → license expression
 */
export function flatten(list) {
  const out = new Map();
  for (const pkgs of Object.values(list)) {
    for (const p of pkgs) {
      if (p.name.startsWith("@mandat/")) continue;
      for (const v of p.versions) out.set(`${p.name}@${v}`, p.license);
    }
  }
  return out;
}

/**
 * @param {{ all: Map<string, string>, prod: Map<string, string>, allowlist: { allowed: string[], exceptions: { license: string, devOnly: boolean }[] } }} o
 * @returns {{ ok: boolean, count: number, failures: string[] }}
 */
export function checkLicenses(o) {
  const allowed = new Set(o.allowlist.allowed);
  const devAllowed = new Set([...allowed, ...o.allowlist.exceptions.filter((e) => e.devOnly).map((e) => e.license)]);
  const failures = [];
  const ids = new Map([...o.all, ...o.prod]);
  for (const [id, license] of [...ids].sort(([a], [b]) => a.localeCompare(b))) {
    const isProd = o.prod.has(id);
    let ok;
    try {
      ok = spdxAllowed(license, isProd ? allowed : devAllowed);
    } catch {
      ok = false;
    }
    if (!ok) failures.push(`${id}: ${license}${isProd ? " (prod)" : " (dev)"}`);
  }
  return { ok: failures.length === 0, count: ids.size, failures };
}

/** @param {boolean} prod */
export function pnpmLicenses(prod) {
  const args = ["licenses", "list", "--json", "--recursive", ...(prod ? ["--prod"] : [])];
  return JSON.parse(execFileSync("pnpm", args, { cwd: repo, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const allowlist = JSON.parse(readFileSync(path.join(repo, "license-allowlist.json"), "utf8"));
  const r = checkLicenses({ all: flatten(pnpmLicenses(false)), prod: flatten(pnpmLicenses(true)), allowlist });
  if (r.ok) {
    console.log(`licenses ok (${r.count} packages)`);
  } else {
    for (const f of r.failures) console.error(`license not allowed: ${f}`);
    process.exit(1);
  }
}
