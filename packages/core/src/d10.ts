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

/** D10 "lockfile-lite" (7.8(3)): a changed lockfile must still pass the gate allowlist rules. */
export function d10Lockfile(o: { baseLock: Buffer | null; headLock: Buffer | null; pm?: PackageManager; basePkg?: Buffer | null; headPkg?: Buffer | null }): Detected {
  const same = o.baseLock === null ? o.headLock === null : o.headLock !== null && o.baseLock.equals(o.headLock);
  if (same) {
    // D-357: a dependency declared or changed in package.json with the lockfile untouched is not reproducible
    const a = declared(o.basePkg);
    const b = declared(o.headPkg);
    const changed = a && b ? [...b.entries()].filter(([k, v]) => a.get(k) !== v).map(([k]) => k.split(":")[1] as string) : [];
    if (changed.length > 0) return { evidence: ev("D10.lockfile", "fail", `dependencies changed without the lockfile: ${changed.slice(0, 10).join(", ")}`, { packages: changed.slice(0, 50) }, { cls: "lock_missing", id: changed[0] as string }), security: [] };
    return { evidence: ev("D10.lockfile", "n/a", "lockfile unchanged"), security: [] };
  }
  // D-301: the same allowlist rules as the install gate, per package manager
  const r = lockAllowlist(o.pm ?? "npm", o.headLock === null ? null : o.headLock.toString("utf8"));
  if (!r.ok) return { evidence: ev("D10.lockfile", "fail", `lockfile rejected: ${r.reason}`, { reason: r.reason, path: r.path }, { cls: "lockfile", id: r.reason }), security: [] };
  return { evidence: ev("D10.lockfile", "pass", `lockfile ok (${r.packages} packages)`, { packages: r.packages }), security: [] };
}
