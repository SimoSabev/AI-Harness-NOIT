import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { hiddenRootPath, isHiddenPath } from "@mandat/contract";
import type { HiddenTests } from "./verify-trees.js";

// D-536 (live test 18.11.2026): hidden tests are written at their path from the repo root, so an oracle's files in a
// `__hidden__` folder inside a package sit where the project's runner (e.g. a vitest workspace) discovers them.

const safe = (p: string): boolean => p.length > 0 && !p.includes("\\") && !path.posix.isAbsolute(p) && !/^[a-zA-Z]:/.test(p) && p.split("/").every((s) => s !== "" && s !== "." && s !== "..");

/**
 * Every path is checked before anything is written: relative, "/" only, no "." / ".." segment; an oracle's paths
 * (dir "") must also be inside a `__hidden__` folder. Returns the paths from the repo root (what D5 counts).
 */
export function writeHiddenTests(treeDir: string, hidden: HiddenTests): { ok: true; paths: string[] } | { ok: false } {
  const paths = hidden.files.map((f) => hiddenRootPath(hidden.dir, f.path));
  if (!paths.every((p) => safe(p) && (hidden.dir !== "" || isHiddenPath(p)))) return { ok: false };
  hidden.files.forEach((f, n) => {
    const to = path.join(treeDir, ...(paths[n] as string).split("/"));
    mkdirSync(path.dirname(to), { recursive: true });
    writeFileSync(to, f.data);
  });
  return { ok: true, paths };
}
