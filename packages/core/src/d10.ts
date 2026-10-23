import { lockAllowlist } from "@mandat/contract";
import type { PackageManager } from "@mandat/contract";
import type { Detected } from "./canary.js";
import { ev } from "./evidence.js";

const DEP_FIELDS = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"] as const;
/** name@spec of every declared dependency (null = package.json unreadable) */
function declared(pkg: Buffer | null | undefined): Map<string, string> | null {
  if (!pkg) return new Map();
  try {
    const j = JSON.parse(pkg.toString("utf8")) as Record<string, unknown>;
    const out = new Map<string, string>();
    for (const f of DEP_FIELDS) for (const [k, v] of Object.entries((j[f] ?? {}) as Record<string, unknown>)) out.set(`${f}:${k}`, String(v));
    return out;
  } catch {
    return null;
  }
}

/** a package.json of the change: the root one, or (E8и) one of a workspace package; null = absent on that side */
export interface Manifest { path: string; base: Buffer | null; head: Buffer | null }

/** D10 "lockfile-lite" (7.8(3)): a changed lockfile must still pass the gate allowlist rules. */
export function d10Lockfile(o: { baseLock: Buffer | null; headLock: Buffer | null; pm?: PackageManager; basePkg?: Buffer | null; headPkg?: Buffer | null; manifests?: Manifest[] }): Detected {
  const same = o.baseLock === null ? o.headLock === null : o.headLock !== null && o.baseLock.equals(o.headLock);
  if (same) {
    // D-357: a dependency declared or changed in package.json with the lockfile untouched is not reproducible;
    // E8и: in every package.json of a workspace too (a new package counts with all its dependencies)
    const all: Manifest[] = [...(o.basePkg !== undefined || o.headPkg !== undefined ? [{ path: "package.json", base: o.basePkg ?? null, head: o.headPkg ?? null }] : []), ...(o.manifests ?? [])];
    const changed: string[] = [];
    const where: string[] = [];
    for (const m of all) {
      const a = declared(m.base);
      const b = declared(m.head);
      if (!a || !b) continue;
      const c = [...b.entries()].filter(([k, v]) => a.get(k) !== v).map(([k]) => k.split(":")[1] as string);
      if (c.length > 0) {
        changed.push(...c);
        where.push(m.path);
      }
    }
    if (changed.length > 0) return { evidence: ev("D10.lockfile", "fail", `dependencies changed without the lockfile: ${changed.slice(0, 10).join(", ")}`, { packages: changed.slice(0, 50), manifests: where.slice(0, 50) }, { cls: "lock_missing", id: changed[0] as string }), security: [] };
    return { evidence: ev("D10.lockfile", "n/a", "lockfile unchanged"), security: [] };
  }
  // D-301: the same allowlist rules as the install gate, per package manager
  const r = lockAllowlist(o.pm ?? "npm", o.headLock === null ? null : o.headLock.toString("utf8"));
  if (!r.ok) return { evidence: ev("D10.lockfile", "fail", `lockfile rejected: ${r.reason}`, { reason: r.reason, path: r.path }, { cls: "lockfile", id: r.reason }), security: [] };
  return { evidence: ev("D10.lockfile", "pass", `lockfile ok (${r.packages} packages)`, { packages: r.packages }), security: [] };
}

/** E9б (D8): the dependencies a change adds or re-specifies (name, spec), across every package.json; local ones are skipped */
export function addedDependencies(manifests: Manifest[]): { name: string; spec: string }[] {
  const out: { name: string; spec: string }[] = [];
  const seen = new Set<string>();
  for (const m of manifests) {
    const a = declared(m.base) ?? new Map<string, string>();
    const b = declared(m.head);
    if (!b) continue;
    for (const [k, spec] of b) {
      if (a.get(k) === spec || /^(workspace|link|file|portal|patch):/.test(spec)) continue;
      const name = k.split(":")[1] as string;
      if (seen.has(`${name}@${spec}`)) continue;
      seen.add(`${name}@${spec}`);
      out.push({ name, spec });
    }
  }
  return out;
}

