import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { LOCKFILE } from "@mandat/contract";
import type { PackageManager } from "@mandat/contract";

/** Raw lockfile of a tree for its package manager (package-lock.json, pnpm-lock.yaml, yarn.lock; D-301), or null if missing. */
export function readLockfile(dir: string, pm: PackageManager = "npm"): Buffer | null {
  const f = path.join(dir, LOCKFILE[pm]);
  return existsSync(f) ? readFileSync(f) : null;
}
