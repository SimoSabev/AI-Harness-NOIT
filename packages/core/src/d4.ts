import type { ChangedFile } from "@mandat/contract";
import type { Detected } from "./canary.js";
import { ev } from "./evidence.js";
import { anyMatch, normalizeOutOfContract } from "./globs.js";

/** D4: every changed path (and old_path) outside allowed_paths and not covered by D3 → fail (D-015, D-120). */
export function d4(o: { files: ChangedFile[]; allowedPaths: string[]; coveredByD3: Set<string> }): Detected {
  const paths: string[] = [];
  for (const f of o.files) {
    for (const p of [f.path, ...(f.old_path !== undefined ? [f.old_path] : [])]) {
      if (anyMatch(o.allowedPaths, p) || o.coveredByD3.has(p)) continue;
      const n = normalizeOutOfContract(p);
      if (!paths.includes(n)) paths.push(n);
    }
  }
  if (paths.length === 0) return { evidence: ev("D4.contract", "pass", `${o.files.length} file(s) in contract`, { files: o.files.length }), security: [] };
  return { evidence: ev("D4.contract", "fail", `${paths.length} path(s) out of contract`, { paths }, { cls: "out_of_contract", id: paths[0] ?? "-" }), security: [] };
}
