import { jcs } from "@mandat/contract";
import type { ChangedFile, RepoConfig } from "@mandat/contract";
import type { CoreSecurityHint, Detected } from "./canary.js";
import { ev } from "./evidence.js";
import { anyMatch, firstMatch } from "./globs.js";

export interface FileSnapshot {
  get(path: string): Buffer | null;
}

const pathsOf = (f: ChangedFile): string[] => (f.old_path !== undefined && f.old_path !== f.path ? [f.path, f.old_path] : [f.path]);

function parseJson(b: Buffer | null): { ok: true; v: Record<string, unknown> } | { ok: false } {
  if (b === null) return { ok: true, v: {} };
  try {
    const v: unknown = JSON.parse(b.toString("utf8"));
    return v !== null && typeof v === "object" && !Array.isArray(v) ? { ok: true, v: v as Record<string, unknown> } : { ok: false };
  } catch {
    return { ok: false };
  }
}

type Finding = { cls: "protected_path" | "protected_json_invalid" | "protected_field"; id: string; path: string };

function findings(files: ChangedFile[], rc: RepoConfig, base: FileSnapshot, head: FileSnapshot): Finding[] {
  const out: Finding[] = [];
  for (const f of files) {
    for (const p of pathsOf(f)) {
      const g = firstMatch(rc.protected_paths, p);
      if (g !== undefined) out.push({ cls: "protected_path", id: g, path: p });
      const fields = rc.protected_json_fields[p];
      if (fields) {
        const b = parseJson(base.get(p));
        const h = parseJson(head.get(p));
        if (!b.ok || !h.ok) {
          out.push({ cls: "protected_json_invalid", id: p, path: p });
          continue;
        }
        for (const field of fields) {
          const inB = Object.hasOwn(b.v, field);
          const inH = Object.hasOwn(h.v, field);
          if (inB !== inH || (inB && jcs(b.v[field]) !== jcs(h.v[field]))) out.push({ cls: "protected_field", id: `${p}#${field}`, path: p });
        }
      }
    }
  }
  return out;
}

/** D3: protected paths and protected JSON fields → unknown ("a human decides"); config_paths also → config_path_change. */
export function d3(o: { files: ChangedFile[]; base: FileSnapshot; head: FileSnapshot; rc: RepoConfig }): Detected {
  const f = findings(o.files, o.rc, o.base, o.head);
  const security: CoreSecurityHint[] = [];
  for (const file of o.files) {
    for (const p of pathsOf(file)) {
      if (anyMatch(o.rc.config_paths, p)) security.push({ kind: "config_path_change", severity: "warn", detail: { path: p, status: file.status } });
    }
  }
  if (f.length === 0) return { evidence: ev("D3.protected", "pass", "no protected change", { findings: [] }), security };
  const first = f[0] as Finding;
  return {
    evidence: ev("D3.protected", "unknown", `${f.length} protected change(s)`, { findings: f.map(({ cls, id }) => ({ cls, id })) }, { cls: first.cls, id: first.id }),
    security,
  };
}

/** D-015: paths D3 already flagged; D4 skips them. */
export function d3CoveredPaths(files: ChangedFile[], rc: RepoConfig, base: FileSnapshot, head: FileSnapshot): Set<string> {
  return new Set(findings(files, rc, base, head).map((x) => x.path));
}
