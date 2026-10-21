import { parse } from "yaml";
import type { GateRoute } from "./gate.js";
import { npmAllowlistFromLockfile } from "./npm-allowlist.js";
import type { NpmAllowlistResult } from "./npm-allowlist.js";

// D-301: pnpm (lockfile v9) and yarn v1 next to npm. The install in the sandbox reaches only the gate; the gate lets
// through exactly the tarballs (and packuments) of the lockfile, from registry.npmjs.org (yarnpkg.com is the same registry).
export type PackageManager = "npm" | "pnpm" | "yarn";
export const LOCKFILE: Record<PackageManager, string> = { npm: "package-lock.json", pnpm: "pnpm-lock.yaml", yarn: "yarn.lock" };
export const INSTALL_ARGV: Record<PackageManager, string[]> = {
  npm: ["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund"],
  // pnpm 12 does not take the registry from NPM_CONFIG_REGISTRY: the gate, the store (tmpfs home) and copy-import are flags
  pnpm: ["pnpm", "install", "--frozen-lockfile", "--ignore-scripts", "--registry=http://egress-gate/npm/", "--store-dir=/home/agent/.pnpm-store", "--package-import-method=copy", "--config.manage-package-manager-versions=false"],
  yarn: ["yarn", "install", "--frozen-lockfile", "--ignore-scripts", "--non-interactive"],
};

/**
 * The argv of the install container. yarn v1 fetches the `resolved` URLs of yarn.lock as written (https://registry.yarnpkg.com/…),
 * which the sandbox cannot reach; the lockfile is pointed at the gate for the install only and put back as it was
 * (the tree keeps the agent's lockfile byte for byte) [НП: yarn 1.22.22 rewrite of the registry host — not relied on].
 */
export function installCommand(pm: PackageManager): string[] {
  if (pm !== "yarn") return INSTALL_ARGV[pm];
  const y = INSTALL_ARGV.yarn.join(" ");
  return ["/bin/sh", "-c", `cp yarn.lock /tmp/yarn.lock.orig && sed -i -e 's#https://registry.yarnpkg.com/#http://egress-gate/npm/#g' -e 's#https://registry.npmjs.org/#http://egress-gate/npm/#g' yarn.lock && ${y}; rc=$?; cp /tmp/yarn.lock.orig yarn.lock; exit $rc`];
}

export type LockAllowlistResult =
  | { ok: true; routes: GateRoute[]; packages: number }
  | { ok: false; reason: Extract<NpmAllowlistResult, { ok: false }>["reason"] | "missing_lockfile" | "workspace" | "yarn_berry"; path: string };

function collector() {
  const routes: GateRoute[] = [];
  const seen = new Set<string>();
  let tgz = 0;
  let doc = 0;
  const add = (kind: "tgz" | "doc", path: string): void => {
    if (seen.has(path)) return;
    seen.add(path);
    routes.push({ id: kind === "tgz" ? `npm-tgz-${++tgz}` : `npm-doc-${++doc}`, method: "GET", match: { kind: "exact", path }, upstream: "npm_registry" });
  };
  const pkg = (name: string, tarPath: string): void => {
    add("tgz", tarPath);
    if (name.startsWith("@")) {
      const [scope, p] = name.split("/");
      add("doc", `/npm/${scope}/${p}`);
      add("doc", `/npm/${scope}%2f${p}`);
      add("doc", `/npm/${scope}%2F${p}`);
    } else add("doc", `/npm/${name}`);
  };
  return { routes, pkg };
}

const NAME = /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i;
const VERSION = /^\d+\.\d+\.\d+[\w.+-]*$/;

/** pnpm lockfile v9 (pnpm 9–12): `packages:` keys `name@version` with `resolution: {integrity}`; one importer (no workspace). */
export function pnpmAllowlist(text: string): LockAllowlistResult {
  let l: unknown;
  try {
    l = parse(text);
  } catch {
    return { ok: false, reason: "not_v3", path: "" };
  }
  const lock = l as { lockfileVersion?: unknown; importers?: Record<string, unknown>; packages?: Record<string, { resolution?: Record<string, unknown> }> } | null;
  if (!lock || typeof lock !== "object" || lock.lockfileVersion !== "9.0") return { ok: false, reason: "not_v3", path: "" };
  const importers = Object.keys(lock.importers ?? { ".": {} });
  if (importers.some((k) => k !== ".")) return { ok: false, reason: "workspace", path: importers.find((k) => k !== ".") ?? "" };
  const c = collector();
  let packages = 0;
  for (const [key, entry] of Object.entries(lock.packages ?? {})) {
    const at = key.lastIndexOf("@");
    const name = key.slice(0, at);
    const version = key.slice(at + 1);
    const res = entry?.resolution ?? {};
    if (typeof res.tarball === "string" || typeof res.repo === "string" || res.type === "git" || res.type === "directory") return { ok: false, reason: "git_or_url_dep", path: key };
    if (at <= 0 || !NAME.test(name) || !VERSION.test(version)) return { ok: false, reason: "git_or_url_dep", path: key };
    if (typeof res.integrity !== "string" || !res.integrity.startsWith("sha512-")) return { ok: false, reason: "bad_integrity", path: key };
    packages++;
    c.pkg(name, `/npm/${name}/-/${name.split("/").at(-1) as string}-${version}.tgz`);
  }
  return { ok: true, routes: c.routes, packages };
}

const REGISTRIES = ["https://registry.yarnpkg.com/", "https://registry.npmjs.org/"];

/** yarn v1 (`# yarn lockfile v1`): `resolved "<registry>/<name>/-/<file>.tgz#sha1"` + `integrity sha512-…`. Berry → refused. */
export function yarnAllowlist(text: string): LockAllowlistResult {
  if (/^__metadata:/m.test(text)) return { ok: false, reason: "yarn_berry", path: "" };
  const c = collector();
  let packages = 0;
  for (const block of text.split(/\n(?=\S)/)) {
    const head = block.split("\n")[0] ?? "";
    if (head.startsWith("#") || head.trim() === "") continue;
    const resolved = /^\s+resolved "([^"]+)"/m.exec(block)?.[1];
    const integrity = /^\s+integrity (\S+)/m.exec(block)?.[1];
    const key = head.replace(/:$/, "");
    if (!resolved) return { ok: false, reason: "missing_resolved", path: key };
    if (!/^https:\/\//.test(resolved)) return { ok: false, reason: "git_or_url_dep", path: key };
    const reg = REGISTRIES.find((r) => resolved.startsWith(r));
    if (!reg) return { ok: false, reason: "foreign_resolved", path: key };
    if (!integrity || !integrity.startsWith("sha512-")) return { ok: false, reason: "bad_integrity", path: key };
    const rest = resolved.slice(reg.length).split("#")[0]?.split("?")[0] ?? "";
    const name = rest.split("/-/")[0] ?? "";
    if (!NAME.test(name) || !rest.endsWith(".tgz")) return { ok: false, reason: "git_or_url_dep", path: key };
    packages++;
    c.pkg(name, `/npm/${rest}`);
  }
  return { ok: true, routes: c.routes, packages };
}

export function lockAllowlist(pm: PackageManager, raw: string | null): LockAllowlistResult {
  if (raw === null) return pm === "npm" ? npmAllowlistFromLockfile(null) : { ok: false, reason: "missing_lockfile", path: LOCKFILE[pm] };
  if (pm === "pnpm") return pnpmAllowlist(raw);
  if (pm === "yarn") return yarnAllowlist(raw);
  let j: unknown;
  try {
    j = JSON.parse(raw);
  } catch {
    j = null;
  }
  return npmAllowlistFromLockfile(j);
}
