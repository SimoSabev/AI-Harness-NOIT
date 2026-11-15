import { describe, expect, it } from "vitest";
import { twinMayDecide, twinModel, twinOffer, twinPredict, twinScore, wilsonLower } from "./twin.js";
import type { TwinActInput } from "./twin.js";

// D-523 „Двойникът на собственика“: the pure part. The model weighs the owner's past decisions per class (newer weigh
// more), the prediction abstains when the history is thin or split, the score counts only real predictions, the offer
// needs a lower confidence bound, and the twin may act only inside a long list of "never".
const K = "00000000-0000-4000-8000-000000000001|bugfix|claude|approval";
const K2 = "00000000-0000-4000-8000-000000000001|feature|claude|approval";
const NOW = "2026-11-15T12:00:00.000Z";
const daysAgo = (d: number) => new Date(Date.parse(NOW) - d * 86_400_000).toISOString();
const dec = (decision: "approved" | "rejected", d = 1, class_key = K) => ({ class_key, decision, at: daysAgo(d) });

describe("twinModel", () => {
  it("counts decisions per class with a weight that halves every 30 days", () => {
    const m = twinModel([dec("approved", 0), dec("approved", 30), dec("rejected", 60), dec("approved", 1, K2)], NOW);
    expect(m[K]?.n).toBe(3);
    expect(m[K]?.approved).toBeCloseTo(1.5, 5);
    expect(m[K]?.rejected).toBeCloseTo(0.25, 5);
    expect(m[K2]?.n).toBe(1);
  });

  it("ignores decisions from the future and bad times", () => {
    const m = twinModel([{ class_key: K, decision: "approved", at: daysAgo(-2) }, { class_key: K, decision: "approved", at: "nope" }], NOW);
    expect(m[K]).toBeUndefined();
  });
});

describe("twinPredict", () => {
  it("abstains with fewer than 3 decisions", () => {
    expect(twinPredict(twinModel([dec("approved"), dec("approved")], NOW), K)).toEqual({ predicted: "abstain", p: 1, n: 2 });
    expect(twinPredict({}, K)).toEqual({ predicted: "abstain", p: 0, n: 0 });
  });

  it("predicts the clear majority and abstains on a split", () => {
    const yes = twinPredict(twinModel([dec("approved"), dec("approved"), dec("approved"), dec("rejected", 200)], NOW), K);
    expect(yes.predicted).toBe("approved");
    expect(yes.p).toBeGreaterThan(0.9);
    expect(twinPredict(twinModel([dec("rejected"), dec("rejected"), dec("rejected")], NOW), K).predicted).toBe("rejected");
    expect(twinPredict(twinModel([dec("approved"), dec("rejected"), dec("approved"), dec("rejected")], NOW), K).predicted).toBe("abstain");
  });
});

describe("wilsonLower", () => {
  it("is 0 with no data, grows with the sample and stays below the share", () => {
    expect(wilsonLower(0, 0)).toBe(0);
    expect(wilsonLower(8, 8)).toBeLessThan(0.8);
    expect(wilsonLower(11, 11)).toBeGreaterThanOrEqual(0.8);
    expect(wilsonLower(9, 10)).toBeLessThan(0.9);
  });
});

describe("twinScore and twinOffer", () => {
  const scored = (k: number, wrong: number, class_key = K) => [
    ...Array.from({ length: k }, () => ({ class_key, predicted: "approved" as const, actual: "approved" as const })),
    ...Array.from({ length: wrong }, () => ({ class_key, predicted: "approved" as const, actual: "rejected" as const })),
  ];

  it("counts only real predictions with a known decision", () => {
    const s = twinScore([...scored(3, 1), { class_key: K, predicted: "abstain", actual: "approved" }, { class_key: K, predicted: "approved", actual: null }]);
    expect(s[K]).toEqual({ scored: 4, correct: 3, lower: wilsonLower(3, 4) });
  });

  it("offers a class only with ≥ 8 scored and a lower bound ≥ 0.8, and never twice", () => {
    expect(twinOffer(twinScore(scored(8, 0))[K], false)).toBe(false);
    expect(twinOffer(twinScore(scored(12, 0))[K], false)).toBe(true);
    expect(twinOffer(twinScore(scored(12, 0))[K], true)).toBe(false);
    expect(twinOffer(twinScore(scored(12, 4))[K], false)).toBe(false);
    expect(twinOffer(undefined, false)).toBe(false);
  });
});

describe("twinMayDecide", () => {
  const HASH = `sha256:${"a".repeat(64)}`;
  const ok: TwinActInput = {
    rule: { weekly_budget: 5, policy_hash: HASH, revoked_at: null },
    policy_hash_now: HASH,
    used_this_week: 0,
    prediction: { predicted: "approved", p: 0.95, n: 12 },
    score: { scored: 12, correct: 12, lower: wilsonLower(12, 12) },
    task: { state: "HELD", wait_reason: "approval", last_result: "VERIFIED", requires_second_factor: false, effective_level: 1 },
  };

  it("approves inside every bound", () => {
    expect(twinMayDecide(ok)).toEqual({ act: true, decision: "approved" });
  });

  it.each([
    ["no_rule", { ...ok, rule: null }],
    ["revoked", { ...ok, rule: { ...ok.rule!, revoked_at: NOW } }],
    ["policy_changed", { ...ok, policy_hash_now: `sha256:${"b".repeat(64)}` }],
    ["no_policy", { ...ok, policy_hash_now: null }],
    ["budget", { ...ok, used_this_week: 5 }],
    ["not_waiting", { ...ok, task: { ...ok.task, state: "GATED" } }],
    ["not_approval", { ...ok, task: { ...ok.task, wait_reason: "tool_approval" } }],
    ["not_verified", { ...ok, task: { ...ok.task, last_result: "UNKNOWN" } }],
    ["second_factor", { ...ok, task: { ...ok.task, requires_second_factor: true } }],
    ["level", { ...ok, task: { ...ok.task, effective_level: 2 } }],
    ["prediction", { ...ok, prediction: { predicted: "rejected", p: 0.9, n: 12 } }],
    ["prediction", { ...ok, prediction: { predicted: "abstain", p: 0.5, n: 12 } }],
    ["accuracy", { ...ok, score: { scored: 14, correct: 10, lower: wilsonLower(10, 14) } }],
  ] as const)("leaves it to the owner: %s", (why, input) => {
    expect(twinMayDecide(input as TwinActInput)).toEqual({ act: false, why });
  });
});
