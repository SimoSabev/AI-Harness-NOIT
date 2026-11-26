import { describe, expect, it } from "vitest";
import { LEARN_LIMITS, LearnCard, LearnSource, ProfileChange, ProfileManifest, sourceOfClass } from "./index.js";

// E9д (spec 5.5, PRD 6.11, D-640/D-641): learning is statistics plus proposals with a named origin; never an LLM's text.
describe("learn contract (D-641)", () => {
  it("a source is rule:<name> in lower snake case", () => {
    expect(LearnSource.parse("rule:d4_repeat")).toBe("rule:d4_repeat");
    for (const bad of ["d4_repeat", "rule:", "rule:D4", "rule:a b", `rule:${"x".repeat(41)}`]) expect(() => LearnSource.parse(bad)).toThrow();
  });

  it("each D-530/D-549 failure class has a fixed rule name; an unknown class has none", () => {
    expect(sourceOfClass("D4:out_of_contract")).toBe("rule:d4_repeat");
    expect(sourceOfClass("D3:protected_path")).toBe("rule:d3_repeat");
    expect(sourceOfClass("D2:missing_test")).toBe("rule:d2_repeat");
    expect(sourceOfClass("D8:lint_fail")).toBe("rule:lint_repeat");
    expect(sourceOfClass("D8:type_fail")).toBe("rule:type_repeat");
    expect(sourceOfClass("D13:test_config_change")).toBe("rule:test_config_repeat");
    expect(sourceOfClass("D13:hidden_probe")).toBe("rule:hidden_probe_repeat");
    expect(sourceOfClass("D11:test_env")).toBe("rule:test_env_repeat");
    expect(sourceOfClass("D13:test_env_branch")).toBe("rule:test_env_repeat");
    expect(sourceOfClass("D1:regression")).toBe("rule:flaky_repeat");
    expect(sourceOfClass("ASK:tool_ask")).toBe("rule:ask_repeat");
    expect(sourceOfClass("D9:whatever")).toBeNull();
  });

  it("the new changes: a flaky test in layer A, an allow or deny of a tool in layer C; the layer follows the rule", () => {
    expect(ProfileChange.parse({ rule: "flaky_test", layer: "a", detail: "tests/cart.test.ts > adds" }).layer).toBe("a");
    expect(ProfileChange.parse({ rule: "tool_allow", layer: "c", detail: "bash:pnpm add *" }).rule).toBe("tool_allow");
    expect(ProfileChange.parse({ rule: "tool_deny", layer: "c", detail: "net:api.segment.io" }).rule).toBe("tool_deny");
    expect(() => ProfileChange.parse({ rule: "flaky_test", layer: "c", detail: "tests/cart.test.ts > adds" })).toThrow();
    expect(() => ProfileChange.parse({ rule: "tool_allow", layer: "a", detail: "bash:ls" })).toThrow();
    expect(() => ProfileChange.parse({ rule: "tests_kept", layer: "a", detail: "" })).toThrow();
    // the detail must read as what the rule changes: a test id, a tool pattern
    expect(() => ProfileChange.parse({ rule: "flaky_test", layer: "a", detail: "infra/**" })).toThrow();
    expect(() => ProfileChange.parse({ rule: "tool_deny", layer: "c", detail: "rm -rf /" })).toThrow();
  });

  it("a manifest may name its source and carry two tasks of evidence (flaky); one is never enough", () => {
    const m = { change: { rule: "flaky_test", layer: "a", detail: "tests/a.test.ts > b" }, evidence: ["t_a", "t_b"], reason_class: "D1:regression", prediction: { task_type: "bugfix", next_n: 10, max_repeats: 0 }, source: "rule:flaky_repeat" };
    expect(ProfileManifest.parse(m)).toEqual(m);
    expect(() => ProfileManifest.parse({ ...m, evidence: ["t_a"] })).toThrow();
    expect(() => ProfileManifest.parse({ ...m, source: "rule:Bad" })).toThrow();
  });

  it("the limits of PRD 6.11", () => {
    expect(LEARN_LIMITS).toMatchObject({ flaky_min: 2, ask_min: 5, q_min_outcomes: 10, cost_last_n: 10, cost_budget_factor: 2, regression_drop: 0.2 });
    expect(Object.isFrozen(LEARN_LIMITS)).toBe(true);
  });

  it("a card is a model regression warning with its weeks and numbers; nothing else", () => {
    const c = { kind: "model_regression", source: "rule:model_regression", model: "claude:claude-sonnet-5-5", week: "2026-11-16", prev_week: "2026-11-09", share: 0.5, prev_share: 0.8, tasks: 10, prev_tasks: 10 };
    expect(LearnCard.parse(c)).toEqual(c);
    expect(() => LearnCard.parse({ ...c, kind: "rewrite_rules" })).toThrow();
    expect(() => LearnCard.parse({ ...c, share: 2 })).toThrow();
    expect(() => LearnCard.parse({ ...c, note: "x" })).toThrow();
  });
});
