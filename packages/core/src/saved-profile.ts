import type { TaskAxes } from "@mandat/contract";

// D-552 (М3 Х9, docs/prd/heavy-process.md §0 „Други“: след успех профилът се пази с име). An "Other" profile is planned
// from the axes; once a job of it is delivered, Mandat keeps it under a name. The next task with the same axes finds it
// by this key. Size is left out (it only decides the pilot); a reference counts by its kind, not its locator.

/** a stable key over the axes that shape the plan; null while one of them is unknown */
export function axesKey(a: TaskAxes): string | null {
  if (a.code === "unknown" || a.reference === "unknown" || a.divisible === "unknown" || a.proof === "unknown" || a.risk === "unknown") return null;
  const ref = typeof a.reference === "object" ? a.reference.kind : a.reference;
  return ["v1", a.code, ref, a.divisible, [...a.proof].sort().join("+"), a.risk.level, a.risk.outward ? "out" : "in"].join("|");
}

/** the name a person sees: the goal on one line, at most 80 characters */
export function savedProfileName(goal: string): string {
  return goal.replace(/\s+/g, " ").trim().slice(0, 80);
}
