import type { TaskAxes } from "@mandat/contract";
import type { Key } from "../i18n/t";

// D-558 (demo 4.12, docs/prd/demo-2026-12-04.md §4–§7): what the page says about a job's strategy — why one writer or
// waves, why a pilot, what the harness built — as fixed sentences chosen from the axes and the plan, never a model's
// text; and the gates of the final check with their status from the final verdict.

type Axes = Pick<TaskAxes, "code" | "risk">;

export function strategyReasons(o: { axes: Axes | null; mode: "single" | "waves"; pilot: number; oracle: boolean }): Key[] {
  const out: Key[] = [o.mode === "waves" ? "job.why.waves" : "job.why.single"];
  if (o.pilot > 0) out.push("job.why.pilot");
  if (o.axes?.code === "existing") out.push("job.why.baseline");
  if (o.oracle) out.push("job.why.hidden");
  if (o.axes && o.axes.risk !== "unknown" && (o.axes.risk.level === "high" || o.axes.risk.outward)) out.push("job.why.risk");
  out.push("job.why.fresh");
  return out;
}

/** the gates of the final check, in the order the page lists them */
export const GATES = ["D1.base_tests", "D2.inventory", "D3.protected", "D4.contract", "D5.hidden", "D8.static", "D11.mutation", "D11.oracle", "D13.cheat", "D14.perf"] as const;
export type GateId = (typeof GATES)[number];
export type GateStatus = "pass" | "fail" | "unknown" | "n/a" | "pending";
export interface GateRow { id: GateId; status: GateStatus }

const STATUSES: readonly GateStatus[] = ["pass", "fail", "unknown", "n/a"];

export function gateRows(evidence: readonly { detector: string; status: string }[] | null): GateRow[] {
  return GATES.map((id) => {
    const e = evidence?.find((x) => x.detector === id);
    const s = STATUSES.find((x) => x === e?.status);
    return { id, status: s ?? "pending" };
  });
}
