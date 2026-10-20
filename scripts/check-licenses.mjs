#!/usr/bin/env node
// В-1 / D-052 / D-077 / D-238: every workspace package is checked against ITS group (core = Apache-2.0 compatible,
// no MPL/GPL; harness = core + MPL-2.0), with its prod dependencies transitively, including the dependencies of its
// workspace packages. A core package may depend only on core workspace packages. Dev-only packages may use the
// devOnlyExceptions. Workspace packages themselves (@mandat/*) are not third-party and are skipped.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { groupOf } from "./license-groups.mjs";
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
      if (p.name.startsWith("@mandat/") || p.name === "spikes") continue;
      for (const v of p.versions) out.set(`${p.name}@${v}`, p.license);
    }
  }
  return out;
}

/**
 * @param {{ packages: { name: string, group: "core"|"harness"|null, prod: Map<string,string>, workspaceDeps: string[] }[],
 *   dev: Map<string,string>, allowlist: Record<"core"|"harness", { allowed: string[], devOnlyExceptions: { license: string, devOnly: boolean }[], prodExceptions?: { package: string, license: string }[] }> }} o
 * @returns {{ ok: boolean, failures: string[], counts: { core: number, harness: number } }}
 */
export function checkGroups(o) {
  const failures = [];
  const ids = { core: new Set(), harness: new Set() };
  const prodAll = new Set();
  for (const p of o.packages) {
    if (p.group === null) {
      failures.push(`${p.name}: not in a license group (scripts/license-groups.mjs)`);
      continue;
    }
    const allowed = new Set(o.allowlist[p.group].allowed);
    const named = o.allowlist[p.group].prodExceptions ?? [];
    for (const dep of p.workspaceDeps) {
      if (p.group === "core" && groupOf(dep) !== "core") failures.push(`${p.name} (core) depends on ${dep} (${groupOf(dep) ?? "?"})`);
    }
    for (const [id, license] of p.prod) {
      prodAll.add(id);
      ids[p.group].add(id);
      let ok;
      try {
        ok = spdxAllowed(license, allowed);
      } catch {
        ok = false;
      }
      // D-284: a prod exception names one package and one exact license string; nothing else is widened.
      if (!ok) ok = named.some((e) => id.slice(0, id.lastIndexOf("@")) === e.package && license === e.license);
      if (!ok) failures.push(`${id}: ${license} (prod of ${p.name}, group ${p.group})`);
    }
  }
  const devAllowed = new Set([...o.allowlist.harness.allowed, ...o.allowlist.harness.devOnlyExceptions.filter((e) => e.devOnly).map((e) => e.license)]);
  for (const [id, license] of o.dev) {
    if (prodAll.has(id)) continue;
    ids.harness.add(id);
    let ok;
    try {
      ok = spdxAllowed(license, devAllowed);
    } catch {
      ok = false;
    }
    if (!ok) failures.push(`${id}: ${license} (dev)`);
  }
  return { ok: failures.length === 0, failures: [...new Set(failures)].sort(), counts: { core: ids.core.size, harness: ids.harness.size } };
}

/** Workspace package dirs (packages/*, apps/*, bench, spikes). */
export function workspacePackages() {
  const dirs = [];
  for (const base of ["packages", "apps"]) {
    const abs = path.join(repo, base);
    if (existsSync(abs)) for (const n of readdirSync(abs)) if (existsSync(path.join(abs, n, "package.json"))) dirs.push(path.join(abs, n));
  }
  for (const d of ["bench", "spikes"]) if (existsSync(path.join(repo, d, "package.json"))) dirs.push(path.join(repo, d));
  return dirs.map((dir) => {
    const pj = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
    const ws = Object.entries({ ...(pj.dependencies ?? {}), ...(pj.peerDependencies ?? {}) }).filter(([, v]) => String(v).startsWith("workspace:")).map(([k]) => k);
    return { dir, name: pj.name, workspaceDeps: ws };
  });
}

function pnpmList(cwd, prod) {
  return JSON.parse(execFileSync("pnpm", ["licenses", "list", "--json", ...(prod ? ["--prod"] : ["--recursive"])], { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
}

export function collect() {
  const pkgs = workspacePackages();
  const byName = new Map(pkgs.map((p) => [p.name, p]));
  const own = new Map(pkgs.map((p) => [p.name, flatten(pnpmList(p.dir, true))]));
  const closure = (name, seen = new Set()) => {
    if (seen.has(name)) return seen;
    seen.add(name);
    for (const d of byName.get(name)?.workspaceDeps ?? []) closure(d, seen);
    return seen;
  };
  const packages = pkgs.map((p) => {
    const prod = new Map();
    for (const n of closure(p.name)) for (const [id, l] of own.get(n) ?? []) prod.set(id, l);
    return { name: p.name, group: groupOf(p.name), prod, workspaceDeps: p.workspaceDeps };
  });
  return { packages, dev: flatten(pnpmList(repo, false)) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const allowlist = JSON.parse(readFileSync(path.join(repo, "license-allowlist.json"), "utf8"));
  const r = checkGroups({ ...collect(), allowlist });
  if (r.ok) {
    console.log(`licenses ok (core: ${r.counts.core} packages, harness: ${r.counts.harness} packages)`);
  } else {
    for (const f of r.failures) console.error(`license not allowed: ${f}`);
    process.exit(1);
  }
}

/** @param {boolean} prod */
export function pnpmLicenses(prod) {
  return JSON.parse(execFileSync("pnpm", ["licenses", "list", "--json", "--recursive", ...(prod ? ["--prod"] : [])], { cwd: repo, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
}
