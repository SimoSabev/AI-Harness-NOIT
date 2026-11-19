import { SessionSeal, oracleTag } from "@mandat/contract";
import type { PlanProblem, PlanUnit, Sha256, Spec, TaskAxes, VerdictResult } from "@mandat/contract";

/** what the job reads of a verdict's evidence (from the verdict or from its stored rows) */
export interface JobEvidence { detector: string; status: string; data?: unknown }

// D-535 (М1 Х6/Х7 minimum): the pure decisions of a job — is the plan good, which oracle files a unit's tree B gets,
// which criteria a failed check names, and what the seal says was checked and what was not.

/**
 * The planner's units against the spec: ≥ 1 unit, unique ids, only the spec's criterion ids, every criterion in ≥ 1 unit,
 * dependencies only on known and earlier units (so no cycle can run). Problems carry ids only.
 */
export function validatePlan(spec: Pick<Spec, "criteria">, units: readonly PlanUnit[]): PlanProblem[] {
  const out: PlanProblem[] = [];
  if (units.length === 0) return [{ kind: "no_units", id: "-" }];
  const known = new Set(spec.criteria.map((c) => c.id));
  const index = new Map<string, number>();
  units.forEach((u, n) => {
    if (index.has(u.id)) out.push({ kind: "duplicate_unit", id: u.id });
    else index.set(u.id, n);
  });
  const covered = new Set<string>();
  for (const u of units) {
    for (const c of u.criteria) {
      if (known.has(c)) covered.add(c);
      else out.push({ kind: "unknown_criterion", id: `${u.id}:${c}` });
    }
  }
  for (const c of spec.criteria) if (!covered.has(c.id)) out.push({ kind: "uncovered_criterion", id: c.id });
  units.forEach((u, n) => {
    for (const d of u.depends_on) {
      const at = index.get(d);
      if (at === undefined) out.push({ kind: "unknown_dependency", id: `${u.id}->${d}` });
      else if (at >= n) out.push({ kind: "forward_dependency", id: `${u.id}->${d}` });
    }
  });
  const cyc = cycleOf(units);
  if (cyc) out.push({ kind: "cycle", id: cyc.join("->") });
  return out;
}

function cycleOf(units: readonly PlanUnit[]): string[] | null {
  const deps = new Map(units.map((u) => [u.id, u.depends_on]));
  const state = new Map<string, 1 | 2>();
  const stack: string[] = [];
  const visit = (id: string): string[] | null => {
    if (state.get(id) === 2) return null;
    if (state.get(id) === 1) return [...stack.slice(stack.indexOf(id)), id];
    state.set(id, 1);
    stack.push(id);
    for (const d of deps.get(id) ?? []) {
      if (!deps.has(d)) continue;
      const c = visit(d);
      if (c) return c;
    }
    stack.pop();
    state.set(id, 2);
    return null;
  };
  for (const u of units) {
    const c = visit(u.id);
    if (c) return c;
  }
  return null;
}

/** the test tags a hidden test file names: "AC-n:" / "U-n:" at the start of a test or describe title */
export function fileTags(data: string): string[] {
  const tags = new Set<string>();
  for (const m of data.matchAll(/\b(?:it|test|describe)(?:\.\w+)?\s*\(\s*(["'`])((?:AC|U)-[1-9]\d{0,3}):/g)) {
    const t = oracleTag(`${m[2] ?? ""}:`);
    if (t) tags.add(t);
  }
  return [...tags].sort();
}

/**
 * A unit's tree B: the oracle files whose every tag is a criterion of the units done so far (this one included) or an
 * unchanged behavior (U-n). A file with a later criterion's test waits for that unit (those tests are red by design);
 * a file without a tag waits for the full check at the end. Returns the files and the criteria they leave out now.
 */
export function oracleFilesFor<F extends { path: string; data: Buffer }>(files: readonly F[], allowed: readonly string[]): { files: F[]; deferred: string[] } {
  const ok = new Set(allowed);
  const deferred = new Set<string>();
  const keep: F[] = [];
  for (const f of files) {
    const tags = fileTags(f.data.toString("utf8"));
    const later = tags.filter((t) => t.startsWith("AC-") && !ok.has(t));
    if (tags.length > 0 && later.length === 0) keep.push(f);
    else for (const t of tags.filter((x) => x.startsWith("AC-") && ok.has(x))) deferred.add(t);
  }
  return { files: keep, deferred: [...deferred].sort() };
}

const byNumber = (a: string, b: string) => Number(a.slice(3)) - Number(b.slice(3));

/** the criteria whose hidden tests failed (from D5.hidden's failed test ids); ids only, never a test name */
export function failingCriteria(evidence: readonly JobEvidence[]): string[] {
  const d5 = evidence.find((e) => e.detector === "D5.hidden" && e.status === "fail");
  const failed = (d5?.data as { failed?: unknown } | undefined)?.failed;
  const ids = new Set<string>();
  for (const f of Array.isArray(failed) ? failed : []) {
    const t = typeof f === "string" ? oracleTag(f) : null;
    if (t?.startsWith("AC-")) ids.add(t);
  }
  return [...ids].sort(byNumber);
}

/** what the final check left unchecked: criteria a person must prove, and every check that did not run or decide */
export function uncheckedOf(spec: Pick<Spec, "criteria">, evidence: readonly JobEvidence[]): string[] {
  const human = spec.criteria.filter((c) => c.proof === "human").map((c) => `${c.id}: proof by a person`);
  const notRun = evidence.filter((e) => e.status === "unknown" || e.status === "n/a").map((e) => `${e.detector}: not run`);
  return [...human, ...notRun].slice(0, 100);
}

/** the seal of a job (SessionSeal, D-532); result_ref is the job branch head that was checked */
export function sealFor(o: { spec: Spec; specHash: Sha256; oracleHash: Sha256; verdict: VerdictResult; head: string; evidence: readonly JobEvidence[]; ledgerHead: Sha256 | null }): SessionSeal {
  return SessionSeal.parse({
    spec_hash: o.specHash, oracle_hash: o.oracleHash, profile: o.spec.profile, verdict: o.verdict, result_ref: o.head,
    unchecked: uncheckedOf(o.spec, o.evidence), ...(o.ledgerHead ? { ledger_head: o.ledgerHead } : {}),
  });
}

// D-541 (М2 Х5/Х6, docs/prd/heavy-process.md §4–§6): a team only where the work divides. The fable system card (§8.12)
// and Kim et al. show a team is no better than one writer on work that does not split; so only axes that say
// "divisible: yes" make a job run in waves. Everything else keeps the one writer of М1.

export type JobMode = "single" | "waves";

/** waves only when the person's task was understood as divisible; unknown or missing axes stay single */
export function jobMode(axes: Pick<TaskAxes, "divisible"> | null | undefined): JobMode {
  return axes?.divisible === "yes" ? "waves" : "single";
}

/** the wave of each unit: 0 without dependencies, else one more than its latest dependency (the plan has no cycle) */
export function unitWaves(units: readonly Pick<PlanUnit, "id" | "depends_on">[]): Record<string, number> {
  const deps = new Map(units.map((x) => [x.id, x.depends_on]));
  const wave: Record<string, number> = {};
  const of = (id: string, seen: Set<string>): number => {
    const known = wave[id];
    if (known !== undefined) return known;
    if (seen.has(id)) return 0;
    seen.add(id);
    const w = Math.max(-1, ...(deps.get(id) ?? []).filter((d) => deps.has(d)).map((d) => of(d, seen))) + 1;
    wave[id] = w;
    return w;
  };
  for (const x of units) of(x.id, new Set());
  return wave;
}

export interface UnitState { unit_id: string; ord: number; status: string; task_id: string | null; depends_on: readonly string[] }

/**
 * The units to start now. single: the first unit that has not passed, only when it has no task yet (one at a time, in
 * order, like М1). waves: every pending unit without a task whose dependencies all passed, in plan order, up to the
 * slots left by the units still running.
 */
export function unitsToStart(units: readonly UnitState[], mode: JobMode, limit: number): string[] {
  const sorted = [...units].sort((a, b) => a.ord - b.ord);
  if (mode === "single") {
    const next = sorted.find((x) => x.status !== "passed");
    return next && !next.task_id ? [next.unit_id] : [];
  }
  const passed = new Set(sorted.filter((x) => x.status === "passed").map((x) => x.unit_id));
  const busy = sorted.filter((x) => x.task_id !== null && x.status !== "passed").length;
  const free = Math.max(0, limit - busy);
  return sorted
    .filter((x) => x.status === "pending" && !x.task_id && x.depends_on.every((d) => passed.has(d)))
    .slice(0, free)
    .map((x) => x.unit_id);
}
