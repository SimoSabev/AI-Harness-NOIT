import { hiddenFileOf, oracleTag, sha256Tag } from "@mandat/contract";
import type { ParsedReport, TestStatus } from "@mandat/contract";
import type { Detected } from "./canary.js";
import { ev } from "./evidence.js";

// v5 E9б (5.2): D5 hidden tests. A person's tests live outside the repo and are copied into tree B only (after the
// export, before install); the agent never has them. Their names never reach the agent: the signature carries a hash and
// the evidence is not agent-visible (a retry note or a night question is built from signatures).
export interface HiddenResult { id: string; status: TestStatus }

/** "h" + the first 8 hex of sha256(test id) */
export const hiddenId = (id: string): string => `h${sha256Tag(id).slice("sha256:".length, "sha256:".length + 8)}`;

/**
 * The tests of the copied hidden files go to D5; the rest go on to D1, D2, MUST_PASS and D11 unchanged. D-536: `files`
 * are the copied files' paths from the repo root (a `__hidden__` folder at any depth); only those count, so a writer's
 * own test in a look-alike `__hidden__` folder can never stand in for hidden tests the runner did not pick up.
 */
export function splitHidden(r: ParsedReport, files: readonly string[]): { visible: ParsedReport; hidden: HiddenResult[] } {
  if (!r.valid) return { visible: r, hidden: [] };
  const copied = new Set(files);
  const visible = new Map<string, TestStatus>();
  const hidden: HiddenResult[] = [];
  for (const [id, status] of r.tests) {
    if (copied.has(hiddenFileOf(id))) hidden.push({ id, status });
    else visible.set(id, status);
  }
  return { visible: { valid: true, success: ![...visible.values()].includes("failed"), total: visible.size, tests: visible }, hidden };
}

/** D-536: a valid report without any hidden result means the runner never picked the files up (UNKNOWN, never a pass) */
export function d5Hidden(o: { hidden: HiddenResult[]; files: number; reportValid?: boolean; scope?: readonly string[] }): Detected {
  if (o.scope) return d5Scoped({ ...o, scope: o.scope });
  return d5All(o);
}

/** D-574 (live test 22.11): a job unit runs the whole hidden files; only its scope (the criteria allowed so far and the
 *  U- tests) decides, and `met` lists the criteria whose tests all passed anywhere (an earlier unit may have built one) */
function d5Scoped(o: { hidden: HiddenResult[]; files: number; reportValid?: boolean; scope: readonly string[] }): Detected {
  const inScope = new Set(o.scope);
  const tagOf = (id: string): string | null => oracleTag(id);
  const mine = o.hidden.filter((h) => {
    const t = tagOf(h.id);
    return t === null || t.startsWith("U-") || inScope.has(t);
  });
  const byTag = new Map<string, boolean>();
  for (const h of o.hidden) {
    const t = tagOf(h.id);
    if (t?.startsWith("AC-")) byTag.set(t, (byTag.get(t) ?? true) && h.status === "passed");
  }
  const met = [...byTag].filter(([, ok]) => ok).map(([t]) => t).sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)));
  // no test of the scope ran: the runner missed the files (or the oracle has none for it), never a silent pass
  if (o.hidden.length > 0 && !mine.some((h) => { const t = tagOf(h.id); return t !== null && inScope.has(t); }) && o.scope.some((s) => s.startsWith("AC-"))) {
    return { evidence: { ...ev("D5.hidden", "unknown", "no hidden test of this unit's criteria ran", { files: o.files, met }, { cls: "not_run", id: String(o.files) }), agent_visible: false }, security: [] };
  }
  const r = d5All({ ...o, hidden: mine });
  return { ...r, evidence: { ...r.evidence, data: { ...(r.evidence.data as Record<string, unknown>), met } } };
}

function d5All(o: { hidden: HiddenResult[]; files: number; reportValid?: boolean }): Detected {
  const quiet = (e: ReturnType<typeof ev>) => ({ ...e, agent_visible: false });
  if (o.hidden.length === 0 && o.reportValid === true) {
    return { evidence: quiet(ev("D5.hidden", "unknown", `the test runner did not pick up the ${o.files} hidden test file(s); put them where the project's runner finds them`, { files: o.files }, { cls: "not_discovered", id: String(o.files) })), security: [] };
  }
  if (o.hidden.length === 0) return { evidence: quiet(ev("D5.hidden", "unknown", `${o.files} hidden test file(s) did not run`, { files: o.files }, { cls: "not_run", id: String(o.files) })), security: [] };
  const failed = o.hidden.filter((h) => h.status === "failed");
  if (failed.length === 0) return { evidence: quiet(ev("D5.hidden", "pass", `${o.hidden.length}/${o.hidden.length} hidden test(s) passed`, { passed: o.hidden.length, total: o.hidden.length })), security: [] };
  return {
    evidence: quiet(ev("D5.hidden", "fail", `${failed.length} of ${o.hidden.length} hidden test(s) failed`, { failed: failed.map((h) => h.id).slice(0, 50), passed: o.hidden.length - failed.length, total: o.hidden.length }, { cls: "hidden_fail", id: hiddenId((failed[0] as HiddenResult).id) })),
    security: [],
  };
}
