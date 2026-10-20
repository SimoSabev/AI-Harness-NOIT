import type { Evidence } from "@mandat/contract";
import { signature } from "./signature.js";

export interface CoreSecurityHint {
  kind: "config_path_change" | "canary_hit";
  severity: "warn";
  detail: Record<string, string | number | boolean | null>;
}
export interface Detected {
  evidence: Evidence;
  security: CoreSecurityHint[];
}

type Hit = { secret: "canary" | "token"; where: "diff" | "notes" };
const CLASS: Record<string, string> = { "canary:diff": "in_diff", "token:diff": "token_in_diff", "canary:notes": "in_notes", "token:notes": "token_in_notes" };

/** D-071: canary or per-task token in the raw diff or the raw notes (in memory) → fail; order of the first hit is fixed. */
export function canaryCheck(o: { diffPatch: string; notes: string; canary: string; token: string }): Detected & { diffHasSecret: boolean } {
  const hits: Hit[] = [];
  const order: Hit[] = [
    { secret: "canary", where: "diff" },
    { secret: "token", where: "diff" },
    { secret: "canary", where: "notes" },
    { secret: "token", where: "notes" },
  ];
  for (const h of order) {
    const value = h.secret === "canary" ? o.canary : o.token;
    const hay = h.where === "diff" ? o.diffPatch : o.notes;
    if (value.length > 0 && hay.includes(value)) hits.push(h);
  }
  const diffHasSecret = hits.some((h) => h.where === "diff");
  const first = hits[0];
  if (!first) {
    return {
      evidence: { detector: "CANARY", phase: 1, status: "pass", summary: "no canary or task token in the diff or notes", data: { hits: [] }, source: "export", agent_visible: true },
      security: [],
      diffHasSecret: false,
    };
  }
  const cls = CLASS[`${first.secret}:${first.where}`] ?? "in_diff";
  return {
    evidence: {
      detector: "CANARY", phase: 1, status: "fail", summary: `secret found (${hits.length} hit(s))`, data: { hits },
      source: "export", agent_visible: true, signature: signature("CANARY", cls, "-"),
    },
    security: [{ kind: "canary_hit", severity: "warn", detail: { hits: hits.length, first: cls } }],
    diffHasSecret,
  };
}
