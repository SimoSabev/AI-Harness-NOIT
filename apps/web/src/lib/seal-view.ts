import type { VerdictResult } from "@mandat/contract";
import type { GateRow } from "./job-strategy";

// D-599: the seal of the brand kit, pure — one tick per gate of the final check (pass cyan, unknown amber, fail coral,
// not applicable or not reported unlit) and the centre: waiting for the work, checking (a count), or the verdict.
export type Tick = "pass" | "ask" | "fail" | "na" | "todo";
export type SealCenter = "waiting" | "checking" | "verified" | "unknown" | "failed";
export interface SealView { ticks: Tick[]; center: SealCenter; done: number; of: number }

const TICK: Record<GateRow["status"], Tick> = { pass: "pass", unknown: "ask", fail: "fail", "n/a": "na", pending: "todo" };

export function sealView(gates: readonly GateRow[], verdict: VerdictResult | null): SealView {
  const ticks = gates.map((g) => TICK[g.status]);
  const done = gates.filter((g) => g.status !== "pending").length;
  const center: SealCenter = verdict === "VERIFIED" ? "verified" : verdict === "UNKNOWN" ? "unknown" : verdict === "FAILED" ? "failed" : done > 0 ? "checking" : "waiting";
  return { ticks, center, done, of: gates.length };
}
