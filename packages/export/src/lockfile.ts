import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** Raw package-lock.json of a tree (or null if missing). */
export function readLockfile(dir: string): Buffer | null {
  const f = path.join(dir, "package-lock.json");
  return existsSync(f) ? readFileSync(f) : null;
}
