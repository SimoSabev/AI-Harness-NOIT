import { describe, expect, it } from "vitest";
import { LedgerKind, TWIN_LIMITS, TwinClassKey, TwinPrediction, TwinRule, twinClassKey } from "./index.js";

// Round 1, feature 2 „Двойникът на собственика“ (D-523, approved by Simo 15.11.2026): the owner's twin learns from
// the owner's own decisions, first in shadow (it predicts and is scored), later it decides one class by a rule.
const REPO = "00000000-0000-4000-8000-000000000001";
const USER = "00000000-0000-4000-8000-0000000000aa";

describe("twin contract (D-523)", () => {
  it("a class key is repo|type|agent|reason and round-trips", () => {
    const k = twinClassKey({ repo_id: REPO, type: "bugfix", agent: "claude", reason: "approval" });
    expect(k).toBe(`${REPO}|bugfix|claude|approval`);
    expect(TwinClassKey.parse(k)).toBe(k);
    // the live test (15.11.2026): tasks from the web run on an account or a connection agent
    for (const agent of ["claude@personal", "codex+work-1", "fake:b10-ci-change"]) expect(twinClassKey({ repo_id: REPO, type: "free", agent, reason: "approval" })).toContain(agent);
    expect(() => TwinClassKey.parse(`${REPO}|bugfix|Claude Max|approval`)).toThrow();
    expect(() => TwinClassKey.parse("a|b")).toThrow();
    expect(() => TwinClassKey.parse(`${REPO}|bugfix|claude|approval|x`)).toThrow();
  });

  it("a prediction is approved, rejected or abstain, with p in [0,1] and n ≥ 0", () => {
    const k = twinClassKey({ repo_id: REPO, type: "bugfix", agent: "claude", reason: "approval" });
    const p = { task_id: "t_x", attempt: 1, class_key: k, predicted: "abstain", p: 0.5, n: 0, at: "2026-11-15T10:00:00.000Z" };
    expect(TwinPrediction.parse(p)).toEqual(p);
    expect(() => TwinPrediction.parse({ ...p, predicted: "maybe" })).toThrow();
    expect(() => TwinPrediction.parse({ ...p, p: 1.2 })).toThrow();
    expect(() => TwinPrediction.parse({ ...p, extra: 1 })).toThrow();
  });

  it("a rule is bound to the policy hash and has a weekly budget of at most the cap", () => {
    const k = twinClassKey({ repo_id: REPO, type: "bugfix", agent: "claude", reason: "approval" });
    const r = { org_id: REPO, class_key: k, approved_by: USER, approved_at: "2026-11-15T10:00:00.000Z", weekly_budget: 5, policy_hash: `sha256:${"a".repeat(64)}`, revoked_at: null };
    expect(TwinRule.parse(r)).toEqual(r);
    expect(TWIN_LIMITS.weekly_budget).toBe(5);
    expect(() => TwinRule.parse({ ...r, weekly_budget: TWIN_LIMITS.weekly_budget + 1 })).toThrow();
    expect(() => TwinRule.parse({ ...r, policy_hash: "x" })).toThrow();
  });

  it("the ledger knows twin_rule and twin_decided", () => {
    expect(LedgerKind.parse("twin_rule")).toBe("twin_rule");
    expect(LedgerKind.parse("twin_decided")).toBe("twin_decided");
  });
});
