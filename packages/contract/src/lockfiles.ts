import { parse, parseAllDocuments } from "yaml";
import type { GateRoute } from "./gate.js";
import { npmAllowlistFromLockfile } from "./npm-allowlist.js";
import type { NpmAllowlistResult } from "./npm-allowlist.js";

// D-301: pnpm (lockfile v9) and yarn v1 next to npm. The install in the sandbox reaches only the gate; the gate lets
// through exactly the tarballs (and packuments) of the lockfile, from registry.npmjs.org (yarnpkg.com is the same registry).
export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";
export const LOCKFILE: Record<PackageManager, string> = { npm: "package-lock.json", pnpm: "pnpm-lock.yaml", yarn: "yarn.lock", bun: "bun.lock" };
export const INSTALL_ARGV: Record<PackageManager, string[]> = {
  npm: ["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund"],
  // pnpm 12 does not take the registry from NPM_CONFIG_REGISTRY: the gate, the store (tmpfs home) and copy-import are flags
  pnpm: ["pnpm", "install", "--frozen-lockfile", "--ignore-scripts", "--registry=http://egress-gate/npm/", "--store-dir=/home/agent/.pnpm-store", "--package-import-method=copy", "--config.manage-package-manager-versions=false"],
  yarn: ["yarn", "install", "--frozen-lockfile", "--ignore-scripts", "--non-interactive"],
  // E8и (D-358): bun's registry and cache come from the environment (installCommand)
  bun: ["bun", "install", "--frozen-lockfile", "--ignore-scripts"],
};
const BUN_ENV = ["BUN_CONFIG_REGISTRY=http://egress-gate/npm/", "BUN_INSTALL_CACHE_DIR=/home/agent/.bun-cache", "DO_NOT_TRACK=1"];

/**
 * The argv of the install container. yarn v1 fetches the `resolved` URLs of yarn.lock as written (https://registry.yarnpkg.com/…),
 * which the sandbox cannot reach; the lockfile is pointed at the gate for the install only and put back as it was
 * (the tree keeps the agent's lockfile byte for byte) [НП: yarn 1.22.22 rewrite of the registry host — not relied on].
 */
/**
 * E8и (D-358): yarn berry (lockfile `__metadata`) installs with the yarn 4 pinned in the image, never the repo's `yarnPath`;
 * the registry is the gate (plain HTTP inside the sandbox network), no scripts, no global cache, node_modules linker and the
 * install state in /tmp so the tree changes only under node_modules.
 */
const BERRY_ENV = [
  "YARN_IGNORE_PATH=1", "YARN_NPM_REGISTRY_SERVER=http://egress-gate/npm", "YARN_UNSAFE_HTTP_WHITELIST=egress-gate", "YARN_ENABLE_SCRIPTS=0",
  "YARN_ENABLE_TELEMETRY=0", "YARN_ENABLE_GLOBAL_CACHE=0", "YARN_CACHE_FOLDER=/home/agent/.yarn-berry-cache", "YARN_GLOBAL_FOLDER=/home/agent/.yarn-berry-global", "YARN_NODE_LINKER=node-modules",
  "YARN_INSTALL_STATE_PATH=/tmp/yarn-install-state.gz", "YARN_ENABLE_IMMUTABLE_INSTALLS=1", "YARN_ENABLE_PROGRESS_BARS=0",
];
export const isBerryLock = (text: string | null): boolean => text !== null && /^__metadata:/m.test(text);

export function installCommand(pm: PackageManager, berry = false): string[] {
  if (pm === "yarn" && berry) return ["/bin/sh", "-c", `${BERRY_ENV.join(" ")} node /opt/yarn-berry/yarn.js install --immutable`];
  if (pm === "bun") return ["/bin/sh", "-c", `${BUN_ENV.join(" ")} ${INSTALL_ARGV.bun.join(" ")}`];
  if (pm !== "yarn") return INSTALL_ARGV[pm];
  const y = INSTALL_ARGV.yarn.join(" ");
  return ["/bin/sh", "-c", `cp yarn.lock /tmp/yarn.lock.orig && sed -i -e 's#https://registry.yarnpkg.com/#http://egress-gate/npm/#g' -e 's#https://registry.npmjs.org/#http://egress-gate/npm/#g' yarn.lock && ${y}; rc=$?; cp /tmp/yarn.lock.orig yarn.lock; exit $rc`];
}

export type LockAllowlistResult =
  | { ok: true; routes: GateRoute[]; packages: number }
  | { ok: false; reason: Extract<NpmAllowlistResult, { ok: false }>["reason"] | "missing_lockfile" | "workspace" | "berry_version" | "config_deps"; path: string };

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

/**
 * pnpm lockfile v9 (pnpm 9–12): `packages:` keys `name@version` with `resolution: {integrity}`. E8и: a workspace has one
 * importer per package (`link:` versions live only in importers, never in `packages:`); an importer outside the repo is refused.
 */
type PnpmLock = { lockfileVersion?: unknown; importers?: Record<string, unknown>; packages?: Record<string, { resolution?: Record<string, unknown> }> } | null;
/**
 * pnpm 11+ with `packageManager` writes two YAML documents: the env lockfile (importer "." with only `configDependencies` /
 * `packageManagerDependencies`) and the project's. The sandbox has its own pinned pnpm (`manage-package-manager-versions=false`),
 * so the env document needs no routes; config dependencies are code pnpm would fetch and load → refused.
 */
function pnpmDocs(text: string): { main: unknown } | { error: "not_v3" | "config_deps"; path: string } {
  let docs: unknown[];
  try {
    const all = parseAllDocuments(text);
    if (!Array.isArray(all) || all.some((d) => d.errors.length > 0)) return { error: "not_v3", path: "" };
    docs = all.map((d) => d.toJS() as unknown);
  } catch {
    return { error: "not_v3", path: "" };
  }
  const main: unknown[] = [];
  for (const d of docs) {
    const root = (d as { importers?: Record<string, Record<string, unknown> | null> } | null)?.importers?.["."];
    const keys = Object.keys(root ?? {});
    const env = keys.length > 0 && keys.every((k) => k === "configDependencies" || k === "packageManagerDependencies");
    if (!env) {
      main.push(d);
      continue;
    }
    const config = Object.keys((root?.["configDependencies"] ?? {}) as Record<string, unknown>);
    if (config.length > 0) return { error: "config_deps", path: config[0] as string };
  }
  return main.length === 1 ? { main: main[0] } : { error: "not_v3", path: "" };
}

export function pnpmAllowlist(text: string): LockAllowlistResult {
  const docs = pnpmDocs(text);
  if ("error" in docs) return { ok: false, reason: docs.error, path: docs.path };
  const l = docs.main;
  const lock = l as PnpmLock;
  if (!lock || typeof lock !== "object" || lock.lockfileVersion !== "9.0") return { ok: false, reason: "not_v3", path: "" };
  const importers = Object.keys(lock.importers ?? { ".": {} });
  const outside = importers.find((k) => k !== "." && (!/^[\w@.-]+(\/[\w@.-]+)*$/.test(k) || k.split("/").includes("..")));
  if (outside !== undefined) return { ok: false, reason: "workspace", path: outside };
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

/** yarn 4 writes lockfile versions 8–10 (yarn 3 wrote 6); an older one would be rewritten by `install`, which `--immutable` refuses */
const BERRY_VERSIONS = new Set([8, 9, 10]);
const BUILTIN_PATCH = /^[^@]*@?[^@]+@patch:.+#(optional!)?(~)?builtin<compat\/[a-z-]+>/;

/**
 * yarn berry (E8и, D-358): entries `resolution: "<name>@npm:<version>"` with a `checksum` → the same /npm/ paths as npm.
 * Skipped: the repo's own workspaces (`@workspace:`) and yarn's builtin compat patches (the patched package has its own
 * npm entry). Anything else (git, http, file:, link:, portal:, a patch file) is not from the registry → refused.
 */
function berryAllowlist(text: string): LockAllowlistResult {
  let l: unknown;
  try {
    l = parse(text);
  } catch {
    return { ok: false, reason: "not_v3", path: "" };
  }
  if (!l || typeof l !== "object") return { ok: false, reason: "not_v3", path: "" };
  const { __metadata: meta, ...entries } = l as Record<string, { version?: unknown; resolution?: unknown; checksum?: unknown } | null>;
  const v = Number(meta?.version);
  if (!BERRY_VERSIONS.has(v)) return { ok: false, reason: "berry_version", path: String(meta?.version ?? "") };
  const c = collector();
  let packages = 0;
  for (const [key, entry] of Object.entries(entries)) {
    const res = typeof entry?.resolution === "string" ? entry.resolution : "";
    if (/^(@[^@/]+\/)?[^@/]+@workspace:/.test(res) || BUILTIN_PATCH.test(res)) continue;
    const m = /^((?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*)@npm:([^@:#]+)$/i.exec(res);
    if (!m) return { ok: false, reason: "git_or_url_dep", path: key };
    const [, name = "", version = ""] = m;
    if (!VERSION.test(version)) return { ok: false, reason: "git_or_url_dep", path: key };
    if (typeof entry?.checksum !== "string" || entry.checksum.length === 0) {
      // a binary for another platform (`conditions`): yarn never fetched it, so no checksum → no route; the gate refuses it
      if (typeof (entry as { conditions?: unknown } | null)?.conditions === "string") continue;
      return { ok: false, reason: "bad_integrity", path: key };
    }
    packages++;
    c.pkg(name, `/npm/${name}/-/${name.split("/").at(-1) as string}-${version}.tgz`);
  }
  return { ok: true, routes: c.routes, packages };
}

/** yarn v1 (`# yarn lockfile v1`): `resolved "<registry>/<name>/-/<file>.tgz#sha1"` + `integrity sha512-…`; berry → berryAllowlist. */
export function yarnAllowlist(text: string): LockAllowlistResult {
  if (isBerryLock(text)) return berryAllowlist(text);
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

/** JSONC → JSON: drop the trailing commas bun writes (outside strings only); comments are not part of bun.lock */
function stripTrailingCommas(text: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (inString) {
      out += ch;
      if (ch === "\\") out += text[++i] ?? "";
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    if (ch === ",") {
      const rest = /^\s*([}\]])/.exec(text.slice(i + 1));
      if (rest) continue;
    }
    out += ch;
  }
  return out;
}

/**
 * bun.lock (text, bun ≥ 1.2; E8и spike, D-358): `packages` values are `["<name>@<version>", "<registry or ''>", {meta}, "sha512-…"]`.
 * The default registry ('') only, an npm version, sha512; the repo's workspaces (`@workspace:`) are skipped. Every platform
 * binary is listed with its integrity, so every one gets a route (bun fetches only its own). bun.lockb (binary) is not read.
 */
export function bunAllowlist(text: string): LockAllowlistResult {
  let l: unknown;
  try {
    l = JSON.parse(stripTrailingCommas(text));
  } catch {
    return { ok: false, reason: "not_v3", path: "" };
  }
  const lock = l as { lockfileVersion?: unknown; packages?: Record<string, unknown> } | null;
  if (!lock || typeof lock !== "object" || (lock.lockfileVersion !== 1 && lock.lockfileVersion !== 2)) return { ok: false, reason: "not_v3", path: "" };
  const c = collector();
  let packages = 0;
  for (const [key, entry] of Object.entries(lock.packages ?? {})) {
    if (!Array.isArray(entry) || typeof entry[0] !== "string") return { ok: false, reason: "git_or_url_dep", path: key };
    const id = entry[0];
    const at = id.lastIndexOf("@");
    const name = id.slice(0, at);
    const version = id.slice(at + 1);
    if (at > 0 && version.startsWith("workspace:")) continue;
    if (at <= 0 || !NAME.test(name) || !VERSION.test(version)) return { ok: false, reason: "git_or_url_dep", path: key };
    if (entry[1] !== "") return { ok: false, reason: "foreign_resolved", path: key };
    const integrity = entry[3];
    if (typeof integrity !== "string" || !integrity.startsWith("sha512-")) return { ok: false, reason: "bad_integrity", path: key };
    packages++;
    c.pkg(name, `/npm/${name}/-/${name.split("/").at(-1) as string}-${version}.tgz`);
  }
  return { ok: true, routes: c.routes, packages };
}

export function lockAllowlist(pm: PackageManager, raw: string | null): LockAllowlistResult {
  if (raw === null) return pm === "npm" ? npmAllowlistFromLockfile(null) : { ok: false, reason: "missing_lockfile", path: LOCKFILE[pm] };
  if (pm === "pnpm") return pnpmAllowlist(raw);
  if (pm === "yarn") return yarnAllowlist(raw);
  if (pm === "bun") return bunAllowlist(raw);
  let j: unknown;
  try {
    j = JSON.parse(raw);
  } catch {
    j = null;
  }
  return npmAllowlistFromLockfile(j);
}
