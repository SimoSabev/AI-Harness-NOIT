import { TWIN_LIMITS } from "@mandat/contract";
import type { TwinChoice } from "@mandat/contract";

// D-523 „Двойникът на собственика“: pure functions, no I/O. The teacher is the owner's own decisions in the ledger
// (approve/reject of a changeset), never an LLM. The twin may only take one kind of decision alone, an approval of a
// VERIFIED change that needs no second factor at level ≤ 1, under a rule the owner approved once; everything else
// (keys, TOTP, new permissions, UNKNOWN, MCP, skills, remote) never reaches this function as an approval wait.

/** a one-sided 95 % lower bound (z = 1.645): 11 correct out of 11 is the first all-correct run that clears 0.8 */
const Z = 1.645;
const DAY = 86_400_000;

export interface TwinDecision { class_key: string; decision: TwinChoice; at: string }
export interface TwinClassStats { approved: number; rejected: number; n: number }
export type TwinModel = Record<string, TwinClassStats>;
export interface TwinGuess { predicted: TwinChoice | "abstain"; p: number; n: number }

/** Weighted counts per class: a decision's weight halves every half_life_days; future or unreadable times are dropped. */
export function twinModel(history: readonly TwinDecision[], now: string): TwinModel {
  const t = Date.parse(now);
  const out: TwinModel = {};
  for (const d of history) {
    const at = Date.parse(d.at);
    if (!Number.isFinite(at) || !Number.isFinite(t) || at > t) continue;
    const w = 0.5 ** ((t - at) / DAY / TWIN_LIMITS.half_life_days);
    const s = out[d.class_key] ?? { approved: 0, rejected: 0, n: 0 };
    out[d.class_key] = { ...s, [d.decision]: s[d.decision] + w, n: s.n + 1 };
  }
  return out;
}

/** The majority of the weighted history, or abstain when it is thin (< min_history) or split (< abstain_below). */
export function twinPredict(model: TwinModel, key: string): TwinGuess {
  const s = model[key];
  if (!s) return { predicted: "abstain", p: 0, n: 0 };
  const total = s.approved + s.rejected;
  const choice: TwinChoice = s.approved >= s.rejected ? "approved" : "rejected";
  const p = total > 0 ? Math.max(s.approved, s.rejected) / total : 0;
  if (s.n < TWIN_LIMITS.min_history || p < TWIN_LIMITS.abstain_below) return { predicted: "abstain", p, n: s.n };
  return { predicted: choice, p, n: s.n };
}

/** Wilson score lower bound of k successes in n. */
export function wilsonLower(k: number, n: number): number {
  if (n <= 0) return 0;
  const p = k / n;
  const z2 = Z * Z;
  return (p + z2 / (2 * n) - Z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
}

export interface TwinScored { class_key: string; predicted: TwinChoice | "abstain"; actual: TwinChoice | null }
export interface TwinScore { scored: number; correct: number; lower: number }

/** Shadow accuracy per class: only real predictions (not abstain) whose real decision is known count. */
export function twinScore(rows: readonly TwinScored[]): Record<string, TwinScore> {
  const acc: Record<string, { scored: number; correct: number }> = {};
  for (const r of rows) {
    if (r.predicted === "abstain" || r.actual === null) continue;
    const s = acc[r.class_key] ?? { scored: 0, correct: 0 };
    acc[r.class_key] = { scored: s.scored + 1, correct: s.correct + (r.predicted === r.actual ? 1 : 0) };
  }
  return Object.fromEntries(Object.entries(acc).map(([k, s]) => [k, { ...s, lower: wilsonLower(s.correct, s.scored) }]));
}

/** Offer the rule ONCE: enough scored predictions, a lower bound high enough, and no rule (approved or declined) yet. */
export function twinOffer(score: TwinScore | undefined, ruleExists: boolean): boolean {
  return !ruleExists && score !== undefined && score.scored >= TWIN_LIMITS.min_decided && score.lower >= TWIN_LIMITS.min_lower;
}

export interface TwinActInput {
  rule: { weekly_budget: number; policy_hash: string; revoked_at: string | null } | null;
  policy_hash_now: string | null;
  used_this_week: number;
  prediction: TwinGuess;
  score: TwinScore | undefined;
  task: { state: string; wait_reason: string | null; last_result: string | null; requires_second_factor: boolean; effective_level: number | null };
}
export type TwinAct = { act: true; decision: "approved" } | { act: false; why: string };

/** May the twin approve this one? Each "no" names why; the first that applies wins. */
export function twinMayDecide(i: TwinActInput): TwinAct {
  const no = (why: string): TwinAct => ({ act: false, why });
  if (!i.rule) return no("no_rule");
  if (i.rule.revoked_at !== null) return no("revoked");
  if (i.policy_hash_now === null) return no("no_policy");
  if (i.policy_hash_now !== i.rule.policy_hash) return no("policy_changed");
  if (i.used_this_week >= i.rule.weekly_budget) return no("budget");
  if (i.task.state !== "HELD") return no("not_waiting");
  if (i.task.wait_reason !== "approval") return no("not_approval");
  if (i.task.last_result !== "VERIFIED") return no("not_verified");
  if (i.task.requires_second_factor) return no("second_factor");
  if ((i.task.effective_level ?? 0) >= 2) return no("level");
  if (i.prediction.predicted !== "approved") return no("prediction");
  if (!i.score || i.score.lower < TWIN_LIMITS.min_lower) return no("accuracy");
  return { act: true, decision: "approved" };
}
