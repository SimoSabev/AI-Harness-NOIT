import { EVOLVE_LIMITS, jcs } from "@mandat/contract";
import type { HookSpec, ProfileChange, ProfileLayers, ProfileManifest, TaskType, ToolRule } from "@mandat/contract";

// D-530 (round 2): profile evolution with evidence, the pure part. A verdict reason class that recurs (≥ 3 tasks of one
// task type in 30 days) maps to ONE fixed narrowing change — never text an LLM wrote (PRD-9). The manifest carries the
// evidence and a prediction (the class does not come back in the next N tasks of the type); isNarrowing is the only
// door for a change Mandat may accept by itself; predictionHeld decides keep or roll back.

export interface FailureRow { task_id: string; task_type: TaskType; at: string; reasons: readonly string[] }

export const TESTS_KEPT = "Never delete, skip or weaken an existing test; fix the code under test instead.";
const DAY = 86_400_000;

/** a verdict reason → the change it argues for (null: no rule for it) */
function changeOf(reason: string): { change: ProfileChange; cls: string } | null {
  const [det, cls, ...rest] = reason.split(":");
  const klass = `${det}:${cls}`;
  const detail = rest.join(":");
  if (det === "D2" && (cls === "missing_test" || cls === "weakened_assertions" || cls === "skipped")) return { change: { rule: "tests_kept", layer: "b", detail: "" }, cls: klass };
  if (det === "D8" && cls === "lint_fail") return { change: { rule: "lint_hook", layer: "d", detail: "" }, cls: klass };
  if (det === "D8" && cls === "type_fail") return { change: { rule: "type_hook", layer: "d", detail: "" }, cls: klass };
  if ((det === "D4" && cls === "out_of_contract") || (det === "D3" && cls === "protected_path")) {
    return /^[A-Za-z0-9_.*/{},@+-]{1,120}$/.test(detail) && !detail.includes("..") ? { change: { rule: "protect_path", layer: "c", detail }, cls: klass } : null;
  }
  return null;
}
const keyOf = (c: ProfileChange) => `${c.rule}|${c.detail}`;
const HOOK: Record<"lint_hook" | "type_hook", HookSpec["script"]> = { lint_hook: "lint-changed", type_hook: "typecheck-changed" };
const writeDeny = (glob: string) => `path:write:${glob}`;

/** Does the profile already have this change, or does it lack what the change needs (a lint / typecheck command)? */
function notNeeded(p: ProfileLayers, c: ProfileChange): boolean {
  if (c.rule === "tests_kept") return p.b.boundaries.includes(TESTS_KEPT) || p.b.boundaries.length >= 40;
  if (c.rule === "lint_hook" || c.rule === "type_hook") {
    const cmd = c.rule === "lint_hook" ? p.b.commands.lint : p.b.commands.typecheck;
    return !cmd || p.d.some((h) => h.script === HOOK[c.rule as "lint_hook" | "type_hook"]) || p.d.length >= 40;
  }
  return p.c.some((r) => r.tool === writeDeny(c.detail) && r.decision === "deny" && r.subject === "any") || p.c.length >= 500;
}

export function rulesFromFailures(rows: readonly FailureRow[], profile: ProfileLayers, now: string): ProfileManifest[] {
  const t = Date.parse(now);
  const groups = new Map<string, { change: ProfileChange; cls: string; type: TaskType; tasks: string[] }>();
  for (const r of rows) {
    const at = Date.parse(r.at);
    if (!Number.isFinite(at) || at > t || t - at > EVOLVE_LIMITS.window_days * DAY) continue;
    for (const reason of r.reasons) {
      const c = changeOf(reason);
      if (!c) continue;
      const k = `${keyOf(c.change)}|${r.task_type}`;
      const g = groups.get(k) ?? { change: c.change, cls: c.cls, type: r.task_type, tasks: [] };
      if (!g.tasks.includes(r.task_id)) g.tasks.push(r.task_id);
      groups.set(k, g);
    }
  }
  return [...groups.values()]
    .filter((g) => g.tasks.length >= EVOLVE_LIMITS.min_evidence && !notNeeded(profile, g.change))
    .map((g) => ({ change: g.change, evidence: g.tasks.slice(0, 50), reason_class: g.cls, prediction: { task_type: g.type, next_n: EVOLVE_LIMITS.next_n, max_repeats: 0 } }));
}

/** The profile with the change applied (a new object; the input is untouched). */
export function applyChange(p: ProfileLayers, c: ProfileChange): ProfileLayers {
  if (c.rule === "tests_kept") return { ...p, b: { ...p.b, boundaries: [...p.b.boundaries, TESTS_KEPT] } };
  if (c.rule === "lint_hook" || c.rule === "type_hook") return { ...p, d: [...p.d, { event: "post_tool", matcher: null, script: HOOK[c.rule], args: {} }] };
  const rule: ToolRule = { subject: "any", tool: writeDeny(c.detail), decision: "deny", reason: "recurring failures (D-530)" };
  return { ...p, c: [...p.c, rule] };
}

const same = (a: unknown, b: unknown) => jcs(a) === jcs(b);
const superset = <T>(after: readonly T[], before: readonly T[]) => before.every((x) => after.some((y) => same(x, y)));
const RANK = { allow: 0, ask: 1, deny: 2 } as const;

/** True only when `after` can do nothing `before` could not: rules only stricter, lists only longer, limits only lower. */
export function isNarrowing(before: ProfileLayers, after: ProfileLayers): boolean {
  if (!same(before.a, after.a) || !same(before.e, after.e) || !same(before.f, after.f) || !same(before.h, after.h)) return false;
  const { boundaries: bb, ...restB } = before.b;
  const { boundaries: ab, ...restA } = after.b;
  if (!same(restB, restA) || !superset(ab, bb)) return false;
  const key = (r: ToolRule) => `${r.subject}\u0000${r.tool}`;
  const strictest = (rs: readonly ToolRule[]) => {
    const m = new Map<string, number>();
    for (const r of rs) m.set(key(r), Math.max(m.get(key(r)) ?? 0, RANK[r.decision]));
    return m;
  };
  const cb = strictest(before.c);
  const ca = strictest(after.c);
  for (const [k, v] of cb) if ((ca.get(k) ?? -1) < v) return false;
  for (const r of after.c) if (!cb.has(key(r)) && r.decision === "allow") return false;
  if (!superset(after.d, before.d)) return false;
  const g0 = before.g;
  const g1 = after.g;
  if (g1.mutants < g0.mutants || g1.max_diff_lines > g0.max_diff_lines || g1.max_subagents > g0.max_subagents || g1.max_depth > g0.max_depth || g1.wip_limit > g0.wip_limit || g1.ci_rounds > g0.ci_rounds) return false;
  if (g0.same_file === "wait" && g1.same_file !== "wait") return false;
  if (g0.review === "advisory" && g1.review !== "advisory") return false;
  if (!superset(g1.required_detectors, g0.required_detectors) || !superset(g1.requires_research, g0.requires_research)) return false;
  for (const [type, items] of Object.entries(g0.definition_of_done)) if (!superset(g1.definition_of_done[type as TaskType] ?? [], items ?? [])) return false;
  return same(g0.ui_paths, g1.ui_paths) && same(g0.ui_routes ?? null, g1.ui_routes ?? null) && g0.hidden_tests_dir === g1.hidden_tests_dir;
}

/** The prediction over the tasks after the change: done after next_n tasks of the type; a repeat beyond max falsifies it. */
export function predictionHeld(m: ProfileManifest, later: readonly FailureRow[]): { done: boolean; held: boolean; seen: number; repeats: number } {
  const target = keyOf(m.change);
  let seen = 0;
  let repeats = 0;
  const rows = later.filter((r) => r.task_type === m.prediction.task_type && Number.isFinite(Date.parse(r.at))).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  for (const r of rows) {
    if (seen >= m.prediction.next_n) break;
    seen++;
    if (r.reasons.some((x) => { const c = changeOf(x); return c !== null && keyOf(c.change) === target; })) repeats++;
    if (repeats > m.prediction.max_repeats) return { done: true, held: false, seen, repeats };
  }
  return { done: seen >= m.prediction.next_n, held: true, seen, repeats };
}
