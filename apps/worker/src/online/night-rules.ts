// v5 E9а (2.4 / D-320): the rules of the night shift as pure functions. A verdict decides retry, park or done; a parked
// task gets a question in human words with a deterministic proposal by the class of its reason (never the agent's text
// as the proposal itself); the shift goes on with the next task.

/** classes nobody can fix by retrying at night: policy, infrastructure, a HELD that waits for a person, a missing resource (E_*) */
const UNSOLVABLE = /^(POLICY:|INFRA:|HELD:|E_[A-Z_]+$)/;
export const unsolvable = (reasons: string[]): boolean => reasons.some((r) => UNSOLVABLE.test(r));

export interface NightVerdict { result: "VERIFIED" | "FAILED" | "UNKNOWN"; reasons: string[] }
export interface NightAttempt { attempt: number; level: number; lines: number }
export interface NightRulesLite { retries: number; auto_merge: { min_level: number; max_lines: number } }
export type NightAction = { action: "done"; status: "merged" | "waiting" } | { action: "retry" } | { action: "park" };

/** VERIFIED: merged only within the night's auto_merge rule (level ≥ min_level, lines ≤ max_lines), else it waits for a person */
export function afterVerdict(v: NightVerdict, a: NightAttempt, rules: NightRulesLite): NightAction {
  if (v.result === "VERIFIED") return { action: "done", status: a.level >= rules.auto_merge.min_level && a.lines <= rules.auto_merge.max_lines ? "merged" : "waiting" };
  if (unsolvable(v.reasons)) return { action: "park" };
  return a.attempt <= rules.retries ? { action: "retry" } : { action: "park" };
}

const after = (reasons: string[], prefix: string): string | null => {
  const r = reasons.find((x) => x.startsWith(prefix));
  return r === undefined ? null : r.slice(prefix.length);
};
/** the first reason with a rule decides; the text is fixed per class (the reason's own detail in code style) */
export function proposalFor(reasons: string[]): string {
  const out = after(reasons, "D4:out_of_contract:");
  if (out !== null) return `Add ${out} to allowed_paths of this task type, or narrow the task so it stays inside the contract.`;
  const missing = after(reasons, "D2:missing_test:");
  if (missing !== null) return `Restore the test \`${missing}\`, or run the task as a feature that may change tests.`;
  const weak = after(reasons, "D2:weakened_assertions:");
  if (weak !== null) return `Keep the assertions of \`${weak}\`; if the expectation really changed, say so in the task.`;
  const must = after(reasons, "MUST_PASS:not_passed:");
  if (must !== null) return `The change does not make \`${must}\` pass; describe the expected behaviour more precisely or point to the code.`;
  const lock = after(reasons, "D10:lock_missing:");
  if (lock !== null) return `Commit the lockfile together with the new dependency ${lock}, or ask for the change without it.`;
  const prot = after(reasons, "D3:");
  if (prot !== null) return `The change touches a protected file (${prot}); approve it by hand or keep the task away from it.`;
  const special = after(reasons, "D11:special_case:");
  if (special !== null) return `The code special-cases a test input at ${special}; ask for a general fix.`;
  const survived = after(reasons, "D11:survived:");
  if (survived !== null) return `The tests do not notice a change at ${survived}; add a test that pins the behaviour.`;
  if (reasons.some((r) => r.startsWith("INFRA:"))) return "Infrastructure failed (install, gate or sandbox); run `mandat doctor` and retry the task.";
  if (reasons.some((r) => r.startsWith("POLICY:"))) return "The project policy blocked the run; check .mandat.yml on the base branch.";
  if (reasons.some((r) => r.startsWith("HELD:"))) return "The task waited for a person at night; answer on the card and continue.";
  if (reasons.some((r) => /^E_[A-Z_]+$/.test(r))) return "A resource was missing (key, image or account); add it under Keys or Settings and continue.";
  return "Read the verdict on the card and decide; Mandat has no rule for this reason yet.";
}

/** "<RESULT> after N attempt(s): `r1`, `r2`" in at most 1000 characters */
export function whatStopped(v: NightVerdict, attempts: number): string {
  const head = `${v.result} after ${attempts} attempt(s): `;
  const parts: string[] = [];
  let len = head.length;
  for (const r of v.reasons) {
    const p = `\`${r.replace(/`/g, "'").slice(0, 300)}\``;
    if (len + p.length + 2 > 1000) break;
    parts.push(p);
    len += p.length + 2;
  }
  return head + parts.join(", ");
}

export interface NightReport { merged: number; waiting: number; parked: number; failed: number; skipped: number; spent_usd: number; learned: string[] }
export function nightReport(items: { status: string }[], spentUsd: number, learned: string[]): NightReport {
  const n = (s: string) => items.filter((i) => i.status === s).length;
  return { merged: n("merged"), waiting: n("waiting"), parked: n("parked"), failed: n("failed"), skipped: n("skipped"), spent_usd: Math.round(spentUsd * 100) / 100, learned: learned.slice(0, 20) };
}
