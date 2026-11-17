import { oracleTag, unchangedId } from "@mandat/contract";
import type { Evidence, OracleProblem, ParsedReport, Spec, TestStatus } from "@mandat/contract";
import type { HiddenResult } from "./d5.js";
import type { MutantRun, MutationSite } from "./d11.js";
import { ev } from "./evidence.js";

// D-534 (М1 Х3, heavy-process §3): the oracle checked before the writer starts, and graded after the writer passed.
// Pure: the sandbox runs are done by @mandat/verify.

/** the oracle agent's change: files under its directory are the tests (paths relative to it); anything else is a problem */
export function oracleChange(o: { paths: readonly string[]; dir: string }): { tests: string[]; problems: OracleProblem[] } {
  const prefix = `${o.dir.replace(/\/+$/, "")}/`;
  const tests: string[] = [];
  const problems: OracleProblem[] = [];
  for (const p of [...o.paths].sort()) {
    if (p.startsWith(prefix) && /\.(spec|test)\.[cm]?[jt]sx?$/.test(p)) tests.push(p.slice(prefix.length));
    else problems.push({ kind: "non_test_change", id: p.slice(0, 300) });
  }
  if (tests.length === 0) problems.push({ kind: "no_tests", id: "-" });
  return { tests, problems };
}

export interface RedOnBase {
  ready: boolean;
  red_on_base: { criterion_id: string; red: boolean }[];
  problems: OracleProblem[];
}

/**
 * The oracle's tests on the current base. A criterion (proof other than human) needs ≥ 1 test tagged with its id and
 * every one of them red; an unchanged behavior needs ≥ 1 test tagged U-n and every one of them green. Every test has a
 * known tag. Problems name criterion ids and counts, never a test's name (the person sees them; the writer never does).
 */
export function classifyRedOnBase(o: { spec: Spec; results: readonly HiddenResult[] | null }): RedOnBase {
  const problems: OracleProblem[] = [];
  const criteria = o.spec.criteria;
  if (o.results === null || o.results.length === 0) {
    return { ready: false, red_on_base: criteria.map((c) => ({ criterion_id: c.id, red: false })), problems: [{ kind: "not_run", id: "-" }] };
  }
  const by = new Map<string, TestStatus[]>();
  let untagged = 0;
  const known = new Set([...criteria.map((c) => c.id), ...o.spec.unchanged.map((_, n) => unchangedId(n))]);
  const unknown = new Set<string>();
  for (const r of o.results) {
    const tag = oracleTag(r.id);
    if (tag === null) untagged++;
    else if (!known.has(tag)) unknown.add(tag);
    else by.set(tag, [...(by.get(tag) ?? []), r.status]);
  }
  if (untagged > 0) problems.push({ kind: "untagged_test", id: String(untagged) });
  for (const t of [...unknown].sort()) problems.push({ kind: "unknown_tag", id: t });
  const redOnBase = criteria.map((c) => {
    const st = by.get(c.id) ?? [];
    const red = st.length > 0 && st.every((s) => s === "failed");
    if (c.proof !== "human") {
      if (st.length === 0) problems.push({ kind: "untagged_criterion", id: c.id });
      else if (st.some((s) => s === "passed")) problems.push({ kind: "green_on_base", id: c.id });
      else if (!red) problems.push({ kind: "not_run", id: c.id });
    }
    return { criterion_id: c.id, red };
  });
  o.spec.unchanged.forEach((_, n) => {
    const id = unchangedId(n);
    const st = by.get(id) ?? [];
    if (st.length === 0) problems.push({ kind: "unchanged_untagged", id });
    else if (st.some((s) => s === "failed")) problems.push({ kind: "unchanged_red", id });
    else if (!st.every((s) => s === "passed")) problems.push({ kind: "not_run", id });
  });
  return { ready: problems.length === 0, red_on_base: redOnBase, problems };
}

/** killed by the oracle: a hidden test that passed on B does not pass on the mutant (or the run timed out or broke) */
function killedByOracle(r: MutantRun, hiddenOnMutant: readonly HiddenResult[], hiddenOnB: readonly HiddenResult[]): boolean {
  if (r.timedOut || !r.report.valid) return true;
  const after = new Map(hiddenOnMutant.map((h) => [h.id, h.status]));
  return hiddenOnB.some((h) => h.status === "passed" && after.get(h.id) !== "passed");
}

/**
 * D-534 (heavy-process §3 „оракулът се проверява сам с мутации“): the writer's changed code, broken on purpose, must
 * be caught by the approved oracle's hidden tests at least `threshold` of the time; below it the verdict cannot be
 * VERIFIED (UNKNOWN "oracle too weak"). Not agent-visible: which mutant survived would tell the writer what the oracle
 * does not check.
 */
export function d11Oracle(o: { sites: readonly MutationSite[]; runs: readonly (MutantRun | null)[]; hiddenOf: (r: ParsedReport) => HiddenResult[]; hiddenOnB: readonly HiddenResult[]; threshold: number }): { evidence: Evidence } {
  const quiet = (e: Evidence): { evidence: Evidence } => ({ evidence: { ...e, agent_visible: false } });
  if (o.sites.length === 0) return quiet(ev("D11.oracle", "n/a", "no mutable changed lines"));
  if (o.runs.length !== o.sites.length || o.runs.some((r) => r === null)) return quiet(ev("D11.oracle", "unknown", "mutants not run", { sites: o.sites.length }, { cls: "not_run", id: "-" }));
  const killed = (o.runs as MutantRun[]).filter((r) => killedByOracle(r, o.hiddenOf(r.report), o.hiddenOnB)).length;
  const total = o.sites.length;
  const score = killed / total;
  const data = { killed, total, score: Math.round(score * 1000) / 1000, threshold: o.threshold };
  if (score < o.threshold) return quiet(ev("D11.oracle", "unknown", `oracle too weak: its hidden tests caught ${killed}/${total} mutants (needs ${Math.round(o.threshold * 100)}%)`, data, { cls: "oracle_too_weak", id: `${killed}/${total}` }));
  return quiet(ev("D11.oracle", "pass", `the oracle caught ${killed}/${total} mutants`, data));
}
