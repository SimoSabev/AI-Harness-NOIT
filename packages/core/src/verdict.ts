import type { Evidence, VerdictResult } from "@mandat/contract";

/** 4.1: FAILED if any fail; else UNKNOWN if any unknown; else VERIFIED. */
export function decideVerdict(evidence: Evidence[]): VerdictResult {
  if (evidence.length === 0) throw new Error("decideVerdict: no evidence");
  if (evidence.some((e) => e.status === "fail")) return "FAILED";
  if (evidence.some((e) => e.status === "unknown")) return "UNKNOWN";
  return "VERIFIED";
}

/** D-039: unique aliases in order ++ fail signatures ++ unknown signatures (evidence order). */
export function buildReasons(evidence: Evidence[], aliases: string[]): string[] {
  const out: string[] = [];
  for (const a of aliases) if (!out.includes(a)) out.push(a);
  for (const status of ["fail", "unknown"] as const) {
    for (const e of evidence) if (e.status === status && e.signature !== undefined) out.push(e.signature);
  }
  return out;
}
