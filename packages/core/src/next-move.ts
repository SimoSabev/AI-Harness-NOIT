import type { VerdictResult } from "@mandat/contract";

// Round 1, feature 1 „Сам довършва“ (D-521): about ten of the places where Mandat waits for a person are a timer or a
// retry, not a decision. This pure function says what Mandat does alone with a waiting task: wait until a time, start a
// new attempt, or leave it to the person. Every automatic move has a cap and ends in "ask". It never decides keys,
// permissions, TOTP, an UNKNOWN verdict, review comments, an empty change, a moved PR head or a human stop.
export const SELF_FINISH = {
  /** automatic attempts per task, over all reasons (the task's attempts_max still applies) */
  max_auto_retries: 2,
  /** the first backoff after a hold; it doubles with every automatic retry */
  backoff_min: 10,
} as const;

export interface SelfFinishInput {
  state: string;
  wait_reason: string | null;
  last_result: VerdictResult | null;
  /** the reasons of the last verdict */
  reasons: string[];
  attempt: number;
  attempts_max: number;
  /** attempts Mandat already started alone (retry_reason auto/ci by Mandat) */
  auto_retries: number;
  ci_rounds: number;
  /** layer G ci_rounds of the approved profile (2 by default) */
  ci_cap: number;
  /** the provider's reset time of the last channel_limit, if it said one */
  resets_at: string | null;
  /** when the task entered its current state */
  held_since: string;
  now: string;
  /** a night-shift task: the night tick decides it (night-rules) */
  night: boolean;
}

export type SelfMove =
  | { move: "retry"; retry_reason: "auto" | "ci"; why: string }
  | { move: "wait"; until: string; why: string }
  | { move: "ask"; why: string }
  | { move: "none"; why: "night" | "not_waiting" };

/** the classes no retry fixes: policy, infrastructure, a HELD for a person, a missing resource (as at night, D-320) */
const UNSOLVABLE = /^(POLICY:|INFRA:|HELD:|E_[A-Z_]+$)/;
/** provider problems that pass by themselves */
const TRANSIENT = new Set(["agent_failed:rate_limited", "agent_failed:overloaded", "agent_failed:timed_out"]);

export function nextMove(i: SelfFinishInput): SelfMove {
  if (i.night) return { move: "none", why: "night" };
  if (i.state !== "HELD" && i.state !== "BLOCKED") return { move: "none", why: "not_waiting" };
  if (i.wait_reason === "stopped") return { move: "ask", why: "stopped" };
  // D-607 (live test 25.11, run 8): a limit is not a failed attempt; its reset is waited out even at the last attempt
  if (i.state === "HELD" && i.wait_reason === "channel_limit") return afterHold(i);
  if (i.attempt >= i.attempts_max) return { move: "ask", why: "attempts" };
  if (i.auto_retries >= SELF_FINISH.max_auto_retries) return { move: "ask", why: "auto_retries" };
  return i.state === "BLOCKED" ? afterFailure(i) : afterHold(i);
}

function afterFailure(i: SelfFinishInput): SelfMove {
  if (i.last_result !== "FAILED" || i.reasons.length === 0) return { move: "ask", why: "blocked" };
  if (i.reasons.some((r) => UNSOLVABLE.test(r))) return { move: "ask", why: "unsolvable" };
  return { move: "retry", retry_reason: "auto", why: "failed" };
}

function afterHold(i: SelfFinishInput): SelfMove {
  const w = i.wait_reason ?? "";
  if (w === "base_moved") return { move: "retry", retry_reason: "auto", why: w };
  if (w === "ci_failed") return i.ci_rounds < i.ci_cap ? { move: "retry", retry_reason: "ci", why: w } : { move: "ask", why: "ci_rounds" };
  if (w === "channel_limit") {
    const reset = i.resets_at === null ? NaN : Date.parse(i.resets_at);
    if (Number.isFinite(reset)) return reset > Date.parse(i.now) ? { move: "wait", until: new Date(reset).toISOString(), why: w } : { move: "retry", retry_reason: "auto", why: w };
    return afterBackoff(i, w);
  }
  if (w === "no_channel" || TRANSIENT.has(w)) return afterBackoff(i, w);
  return { move: "ask", why: w === "" ? "held" : w };
}

/** backoff_min · 2^auto_retries after the hold began, then a new attempt */
function afterBackoff(i: SelfFinishInput, why: string): SelfMove {
  const since = Date.parse(i.held_since);
  const now = Date.parse(i.now);
  if (!Number.isFinite(since) || !Number.isFinite(now)) return { move: "ask", why: "bad_time" };
  const due = since + SELF_FINISH.backoff_min * 2 ** i.auto_retries * 60_000;
  return due > now ? { move: "wait", until: new Date(due).toISOString(), why } : { move: "retry", retry_reason: "auto", why };
}
