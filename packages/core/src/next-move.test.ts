import { describe, expect, it } from "vitest";
import { SELF_FINISH, nextMove } from "./next-move.js";
import type { SelfFinishInput } from "./next-move.js";

// Round 1, feature 1 „Сам довършва“ (D-521): a wait that is a timer or a retry, not a decision, is finished by Mandat.
// Every move has a cap and a terminal exit ("ask"); keys, permissions, TOTP, UNKNOWN, review comments and a human stop
// are never decided here.
const NOW = "2026-11-14T12:00:00.000Z";
const at = (min: number) => new Date(Date.parse(NOW) + min * 60_000).toISOString();
const base: SelfFinishInput = {
  state: "HELD", wait_reason: null, last_result: null, reasons: [], attempt: 1, attempts_max: 5, auto_retries: 0,
  ci_rounds: 0, ci_cap: 2, resets_at: null, held_since: at(-1), now: NOW, night: false,
};
const m = (o: Partial<SelfFinishInput>) => nextMove({ ...base, ...o });

describe("nextMove: the waits Mandat finishes alone (D-521)", () => {
  it("channel_limit: waits until resets_at, then a new attempt", () => {
    expect(m({ wait_reason: "channel_limit", resets_at: at(30) })).toEqual({ move: "wait", until: at(30), why: "channel_limit" });
    expect(m({ wait_reason: "channel_limit", resets_at: at(-1) })).toEqual({ move: "retry", retry_reason: "auto", why: "channel_limit" });
  });
  it("channel_limit without resets_at: the backoff from when it was held", () => {
    expect(m({ wait_reason: "channel_limit", held_since: at(-1) })).toEqual({ move: "wait", until: at(-1 + SELF_FINISH.backoff_min), why: "channel_limit" });
    expect(m({ wait_reason: "channel_limit", held_since: at(-SELF_FINISH.backoff_min) })).toMatchObject({ move: "retry" });
  });
  it("no_channel: the backoff, then a new attempt (the selection runs again)", () => {
    expect(m({ wait_reason: "no_channel" })).toMatchObject({ move: "wait", why: "no_channel" });
    expect(m({ wait_reason: "no_channel", held_since: at(-60) })).toEqual({ move: "retry", retry_reason: "auto", why: "no_channel" });
  });
  it("agent_failed: rate_limited, overloaded, timed_out retry after a growing backoff; key_rejected and unknown ask", () => {
    for (const c of ["rate_limited", "overloaded", "timed_out"]) {
      expect(m({ wait_reason: `agent_failed:${c}`, held_since: at(-60) })).toEqual({ move: "retry", retry_reason: "auto", why: `agent_failed:${c}` });
    }
    // the second automatic retry waits twice as long
    expect(m({ wait_reason: "agent_failed:overloaded", auto_retries: 1, held_since: at(-SELF_FINISH.backoff_min) })).toMatchObject({ move: "wait", until: at(SELF_FINISH.backoff_min) });
    expect(m({ wait_reason: "agent_failed:key_rejected" })).toMatchObject({ move: "ask" });
    expect(m({ wait_reason: "agent_failed:unknown" })).toMatchObject({ move: "ask" });
  });
  it("ci_failed: „Fix CI“ alone while rounds are left", () => {
    expect(m({ wait_reason: "ci_failed", ci_rounds: 1 })).toEqual({ move: "retry", retry_reason: "ci", why: "ci_failed" });
    expect(m({ wait_reason: "ci_failed", ci_rounds: 2 })).toEqual({ move: "ask", why: "ci_rounds" });
  });
  it("base_moved: a new attempt on the new main", () => {
    expect(m({ wait_reason: "base_moved" })).toEqual({ move: "retry", retry_reason: "auto", why: "base_moved" });
  });
  it("FAILED (BLOCKED): a new attempt with Mandat's note, unless the class cannot be fixed by retrying", () => {
    expect(m({ state: "BLOCKED", last_result: "FAILED", reasons: ["D2:missing_test:t > a"] })).toEqual({ move: "retry", retry_reason: "auto", why: "failed" });
    for (const r of ["POLICY:base_untrusted:x", "INFRA:install", "E_KEY_MISSING", "HELD:approval"]) {
      expect(m({ state: "BLOCKED", last_result: "FAILED", reasons: ["D2:missing_test:t", r] })).toEqual({ move: "ask", why: "unsolvable" });
    }
  });
});

describe("nextMove: never alone (D-521)", () => {
  it("what needs a person: approvals, keys, tools, UNKNOWN, empty change, a moved head, a stop", () => {
    for (const w of ["approval", "approval_2fa", "second_factor", "key_rejected", "tool_approval", "unknown", "empty_change", "head_moved", null]) {
      expect(m({ wait_reason: w })).toMatchObject({ move: "ask" });
    }
    expect(m({ state: "HELD", last_result: "UNKNOWN", wait_reason: "unknown" })).toMatchObject({ move: "ask" });
    expect(m({ state: "BLOCKED", wait_reason: "stopped", last_result: "FAILED", reasons: ["D2:missing_test:t"] })).toEqual({ move: "ask", why: "stopped" });
    expect(m({ state: "BLOCKED", last_result: null, wait_reason: "infra:docker" })).toMatchObject({ move: "ask" });
  });
  it("caps: the automatic retries, the task's attempts, the night shift (its own tick)", () => {
    expect(m({ wait_reason: "base_moved", auto_retries: SELF_FINISH.max_auto_retries })).toEqual({ move: "ask", why: "auto_retries" });
    expect(m({ wait_reason: "base_moved", attempt: 5, attempts_max: 5 })).toEqual({ move: "ask", why: "attempts" });
    expect(m({ wait_reason: "base_moved", night: true })).toEqual({ move: "none", why: "night" });
  });
  it("a task that is not waiting is not Mandat's to move", () => {
    for (const s of ["CREATED", "RUNNING", "VERIFY_1", "GATED", "DELIVERED", "CLOSED"]) expect(m({ state: s, wait_reason: "base_moved" })).toEqual({ move: "none", why: "not_waiting" });
  });
  it("a bad clock or a bad resets_at never retries early", () => {
    expect(m({ wait_reason: "channel_limit", resets_at: "not a date", held_since: at(-1) })).toMatchObject({ move: "wait" });
    expect(m({ wait_reason: "no_channel", held_since: "not a date" })).toEqual({ move: "ask", why: "bad_time" });
  });
});
