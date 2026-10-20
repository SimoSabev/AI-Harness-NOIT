import type { GateRoute } from "./gate.js";

export type NpmAllowlistResult =
  | { ok: true; routes: GateRoute[]; packages: number }
  | {
      ok: false;
      reason: "not_v3" | "git_or_url_dep" | "foreign_resolved" | "link_dep" | "missing_resolved" | "bad_integrity";
      path: string;
    };

const REGISTRY = "https://registry.npmjs.org/";

function nameFromKey(key: string): string {
  const i = key.lastIndexOf("node_modules/");
  return i >= 0 ? key.slice(i + "node_modules/".length) : key;
}

/** 6.9: GET routes for every tarball in a v3 lockfile + its packument (scoped names in three spellings). */
export function npmAllowlistFromLockfile(lock: unknown): NpmAllowlistResult {
  const l = lock as { lockfileVersion?: unknown; packages?: Record<string, Record<string, unknown>> } | null;
  if (l === null || typeof l !== "object" || l.lockfileVersion !== 3 || typeof l.packages !== "object" || l.packages === null) {
    return { ok: false, reason: "not_v3", path: "" };
  }
  const routes: GateRoute[] = [];
  const seen = new Set<string>();
  let tgz = 0;
  let doc = 0;
  let packages = 0;
  const add = (kind: "tgz" | "doc", path: string): void => {
    if (seen.has(`GET ${path}`)) return;
    seen.add(`GET ${path}`);
    const id = kind === "tgz" ? `npm-tgz-${++tgz}` : `npm-doc-${++doc}`;
    routes.push({ id, method: "GET", match: { kind: "exact", path }, upstream: "npm_registry" });
  };
  for (const [key, entry] of Object.entries(l.packages)) {
    if (key === "" || entry.inBundle === true) continue;
    if (entry.link === true) return { ok: false, reason: "link_dep", path: key };
    const resolved = entry.resolved;
    if (typeof resolved !== "string") return { ok: false, reason: "missing_resolved", path: key };
    if (!/^https?:\/\//.test(resolved)) return { ok: false, reason: "git_or_url_dep", path: key };
    if (!resolved.startsWith(REGISTRY)) return { ok: false, reason: "foreign_resolved", path: key };
    if (typeof entry.integrity !== "string" || !entry.integrity.startsWith("sha512-")) {
      return { ok: false, reason: "bad_integrity", path: key };
    }
    packages++;
    add("tgz", "/npm/" + resolved.slice(REGISTRY.length).split("?")[0]);
    const name = typeof entry.name === "string" ? entry.name : nameFromKey(key);
    if (name.startsWith("@")) {
      const [scope, pkg] = name.split("/");
      add("doc", `/npm/${scope}/${pkg}`);
      add("doc", `/npm/${scope}%2f${pkg}`);
      add("doc", `/npm/${scope}%2F${pkg}`);
    } else {
      add("doc", `/npm/${name}`);
    }
  }
  return { ok: true, routes, packages };
}
