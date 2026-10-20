import { npmAllowlistFromLockfile } from "@mandat/contract";
import type { Detected } from "./canary.js";
import { ev } from "./evidence.js";

/** D10 "lockfile-lite" (7.8(3)): a changed lockfile must still pass the gate allowlist rules. */
export function d10Lockfile(o: { baseLock: Buffer | null; headLock: Buffer | null }): Detected {
  const same = o.baseLock === null ? o.headLock === null : o.headLock !== null && o.baseLock.equals(o.headLock);
  if (same) return { evidence: ev("D10.lockfile", "n/a", "lockfile unchanged"), security: [] };
  let parsed: unknown;
  try {
    parsed = o.headLock === null ? null : JSON.parse(o.headLock.toString("utf8"));
  } catch {
    parsed = null;
  }
  const r = npmAllowlistFromLockfile(parsed);
  if (!r.ok) return { evidence: ev("D10.lockfile", "fail", `lockfile rejected: ${r.reason}`, { reason: r.reason, path: r.path }, { cls: "lockfile", id: r.reason }), security: [] };
  return { evidence: ev("D10.lockfile", "pass", `lockfile ok (${r.packages} packages)`, { packages: r.packages }), security: [] };
}
