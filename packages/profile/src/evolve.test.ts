import { describe, expect, it } from "vitest";
import { ProfileLayers, demoProfileLayers } from "@mandat/contract";
import type { ProfileLayers as Layers, ProfileManifest } from "@mandat/contract";
import { NO_HIDDEN_PROBE, NO_TEST_ENV, TESTS_KEPT, ablationCandidates, applyChange, hasChange, removeChange, isNarrowing, predictionHeld, rulesFromFailures } from "./evolve.js";
import type { FailureRow } from "./evolve.js";

// D-530 (round 2): profile evolution with evidence. The pure part: recurring failures → a manifest with a fixed
// narrowing change and a prediction; the change applied; a classifier that only lets narrowing through; the prediction
// checked against the next tasks.
const NOW = "2026-11-16T12:00:00.000Z";
const daysAgo = (d: number) => new Date(Date.parse(NOW) - d * 86_400_000).toISOString();
const base = (): Layers => ProfileLayers.parse(demoProfileLayers());
const fail = (task_id: string, reasons: string[], o: { d?: number; type?: FailureRow["task_type"] } = {}): FailureRow => ({ task_id, task_type: o.type ?? "bugfix", at: daysAgo(o.d ?? 1), reasons });

describe("rulesFromFailures", () => {
  it("three tasks of one class in 30 days → one manifest with the evidence and a prediction for that task type", () => {
    const m = rulesFromFailures([fail("t_a", ["D2:missing_test:x"]), fail("t_b", ["D2:weakened_assertions:y"]), fail("t_c", ["D2:skipped:z"]), fail("t_d", ["D8:lint_fail:-"])], base(), NOW);
    expect(m).toEqual([{ change: { rule: "tests_kept", layer: "b", detail: "" }, evidence: ["t_a", "t_b", "t_c"], reason_class: "D2:missing_test", prediction: { task_type: "bugfix", next_n: 10, max_repeats: 0 } }]);
  });

  it("a protected or out-of-contract path is grouped by its glob; old failures and other task types do not count", () => {
    const rows = [
      fail("t_1", ["D4:out_of_contract:ops/**"]), fail("t_2", ["D4:out_of_contract:ops/**"]), fail("t_3", ["D3:protected_path:ops/**"]),
      fail("t_4", ["D4:out_of_contract:docs/**"]), fail("t_5", ["D4:out_of_contract:docs/**"]), fail("t_6", ["D4:out_of_contract:docs/**"], { d: 40 }),
      fail("t_7", ["D4:out_of_contract:docs/**"], { type: "free" }),
    ];
    const m = rulesFromFailures(rows, base(), NOW);
    expect(m.map((x) => [x.change.detail, x.evidence])).toEqual([["ops/**", ["t_1", "t_2", "t_3"]]]);
    expect(m[0]?.change).toEqual({ rule: "protect_path", layer: "c", detail: "ops/**" });
    // the demo profile already denies writing infra/**: nothing to propose
    expect(rulesFromFailures([fail("t_8", ["D4:out_of_contract:infra/**"]), fail("t_9", ["D4:out_of_contract:infra/**"]), fail("t_10", ["D4:out_of_contract:infra/**"])], base(), NOW)).toEqual([]);
  });

  it("test paths are never denied: a bugfix contract keeps tests out, but other task types must still write them", () => {
    for (const glob of ["tests/**", "src/__tests__/**", "**/*.spec.ts", "e2e/**/*.test.js", ...base().a.tests.test_globs]) {
      const rows = [fail("t_1", [`D4:out_of_contract:${glob}`]), fail("t_2", [`D4:out_of_contract:${glob}`]), fail("t_3", [`D4:out_of_contract:${glob}`])];
      expect(rulesFromFailures(rows, base(), NOW)).toEqual([]);
    }
  });

  it("nothing is proposed when the profile already has it, or when the check command it needs is missing", () => {
    const has = base();
    const withBoundary: Layers = { ...has, b: { ...has.b, boundaries: [...has.b.boundaries, TESTS_KEPT] } };
    const lint = [fail("t_a", ["D8:lint_fail:-"]), fail("t_b", ["D8:lint_fail:-"]), fail("t_c", ["D8:lint_fail:-"])];
    expect(rulesFromFailures([fail("t_a", ["D2:missing_test:x"]), fail("t_b", ["D2:missing_test:x"]), fail("t_c", ["D2:missing_test:x"])], withBoundary, NOW)).toEqual([]);
    const noLint: Layers = { ...has, b: { ...has.b, commands: { ...has.b.commands, lint: undefined } } };
    expect(rulesFromFailures(lint, noLint, NOW)).toEqual([]);
    const withHook: Layers = { ...has, b: { ...has.b, commands: { ...has.b.commands, lint: "pnpm lint" } }, d: [...has.d, { event: "post_tool", matcher: null, script: "lint-changed", args: {} }] };
    expect(rulesFromFailures(lint, withHook, NOW)).toEqual([]);
  });

  it("a task counts once per class even with several reasons of it; a bad time never counts", () => {
    const rows = [fail("t_a", ["D2:missing_test:x", "D2:skipped:y"]), fail("t_b", ["D2:missing_test:x"]), { ...fail("t_c", ["D2:missing_test:x"]), at: "nope" }];
    expect(rulesFromFailures(rows, base(), NOW)).toEqual([]);
  });
});

describe("applyChange and isNarrowing", () => {
  it("each rule narrows: a boundary, a hook after edits, a deny on writing the path", () => {
    const b = { ...base(), b: { ...base().b, commands: { ...base().b.commands, lint: "pnpm lint", typecheck: "pnpm typecheck" } } };
    for (const change of [
      { rule: "tests_kept", layer: "b", detail: "" },
      { rule: "lint_hook", layer: "d", detail: "" },
      { rule: "type_hook", layer: "d", detail: "" },
      { rule: "protect_path", layer: "c", detail: "ops/**" },
    ] as const) {
      const after = applyChange(b, change);
      expect(ProfileLayers.parse(after)).toEqual(after);
      expect(isNarrowing(b, after)).toBe(true);
      expect(after).not.toEqual(b);
    }
    expect(applyChange(b, { rule: "protect_path", layer: "c", detail: "ops/**" }).c.at(-1)).toEqual({ subject: "any", tool: "path:write:ops/**", decision: "deny", reason: "recurring failures (D-530)" });
  });

  it("anything that loosens is not narrowing: an allow, a removed boundary, a higher limit, another layer changed", () => {
    const b = base();
    expect(isNarrowing(b, b)).toBe(true);
    expect(isNarrowing(b, { ...b, c: [...b.c, { subject: "any", tool: "net:example.com", decision: "allow", reason: "x" }] })).toBe(false);
    expect(isNarrowing(b, { ...b, b: { ...b.b, boundaries: b.b.boundaries.slice(1) } })).toBe(b.b.boundaries.length === 0);
    expect(isNarrowing(b, { ...b, g: { ...b.g, max_diff_lines: b.g.max_diff_lines + 1 } })).toBe(false);
    expect(isNarrowing(b, { ...b, g: { ...b.g, max_diff_lines: Math.max(1, b.g.max_diff_lines - 1) } })).toBe(true);
    expect(isNarrowing(b, { ...b, b: { ...b.b, summary: `${b.b.summary} more` } })).toBe(false);
    expect(isNarrowing(b, { ...b, h: { ...b.h, routing: [] } })).toBe(b.h.routing.length === 0);
    const denied = { ...b, c: [...b.c, { subject: "any" as const, tool: "path:write:x/**", decision: "deny" as const, reason: "r" }] };
    expect(isNarrowing(denied, { ...denied, c: denied.c.map((r) => (r.tool === "path:write:x/**" ? { ...r, decision: "allow" as const } : r)) })).toBe(false);
  });
});

describe("predictionHeld", () => {
  const manifest: ProfileManifest = { change: { rule: "tests_kept", layer: "b", detail: "" }, evidence: ["t_a", "t_b", "t_c"], reason_class: "D2:missing_test", prediction: { task_type: "bugfix", next_n: 3, max_repeats: 0 } };
  it("waits for next_n tasks of the type; a repeat of the class beyond max_repeats falsifies it at once", () => {
    expect(predictionHeld(manifest, [fail("t_x", [])])).toEqual({ done: false, held: true, seen: 1, repeats: 0 });
    expect(predictionHeld(manifest, [fail("t_x", []), fail("t_y", ["D8:lint_fail:-"]), fail("t_z", [], { type: "free" }), fail("t_w", [])])).toEqual({ done: true, held: true, seen: 3, repeats: 0 });
    expect(predictionHeld(manifest, [fail("t_x", ["D2:missing_test:q"])])).toEqual({ done: true, held: false, seen: 1, repeats: 1 });
  });
});

describe("gaming the checks becomes a rule too (D-549)", () => {
  it("code only for the tests (D11:test_env, D13:test_env_branch) → a fixed boundary; a look for hidden checks → another", () => {
    const m = rulesFromFailures([fail("t_a", ["D11:test_env:src/a.ts:3"]), fail("t_b", ["D13:test_env_branch:src/b.ts:9"]), fail("t_c", ["D13:test_env_branch:src/c.ts:1"]), fail("t_d", ["D13:hidden_probe:tool:2"]), fail("t_e", ["D13:hidden_probe:tool:1"]), fail("t_f", ["D13:hidden_probe:tool:4"])], base(), NOW);
    expect(m.map((x) => [x.change.rule, x.reason_class, x.evidence])).toEqual([
      ["no_test_env", "D11:test_env", ["t_a", "t_b", "t_c"]],
      ["no_hidden_probe", "D13:hidden_probe", ["t_d", "t_e", "t_f"]],
    ]);
    const after = applyChange(applyChange(base(), m[0]!.change), m[1]!.change);
    expect(after.b.boundaries).toEqual(expect.arrayContaining([NO_TEST_ENV, NO_HIDDEN_PROBE]));
    expect(isNarrowing(base(), after)).toBe(true);
    expect(rulesFromFailures([fail("t_a", ["D11:test_env:x:1"]), fail("t_b", ["D11:test_env:y:1"]), fail("t_c", ["D11:test_env:z:1"])], after, NOW)).toEqual([]);
  });
  it("a changed runner config (D13:test_config_change) → no writing to that file; a test script line in package.json → nothing", () => {
    const m = rulesFromFailures(["t_a", "t_b", "t_c"].map((t) => fail(t, ["D13:test_config_change:vitest.config.ts", "D13:test_config_change:package.json:7"])), base(), NOW);
    expect(m.map((x) => x.change)).toEqual([{ rule: "protect_path", layer: "c", detail: "vitest.config.ts" }]);
    // the prediction counts the class that made the change, whichever detector reported it
    expect(predictionHeld(m[0]!, [fail("t_x", ["D13:test_config_change:vitest.config.ts"], { d: 0 })]).held).toBe(false);
  });
});

describe("removing a part when the model changes (D-553)", () => {
  it("removeChange undoes applyChange exactly, for every rule; hasChange tells whether the part is there", () => {
    const changes = [
      { rule: "tests_kept", layer: "b", detail: "" }, { rule: "no_test_env", layer: "b", detail: "" }, { rule: "no_hidden_probe", layer: "b", detail: "" },
      { rule: "protect_path", layer: "c", detail: "ops/**" },
    ] as const;
    for (const c of changes) {
      const on = applyChange(base(), c);
      expect(hasChange(on, c)).toBe(true);
      expect(hasChange(base(), c)).toBe(false);
      expect(removeChange(on, c)).toEqual(base());
      // removing widens: never a narrowing, so never accepted by Mandat alone
      expect(isNarrowing(on, removeChange(on, c))).toBe(false);
    }
  });
  it("a part is a candidate when it is in the profile and was accepted under another model than the one now", () => {
    const on = applyChange(base(), { rule: "tests_kept", layer: "b", detail: "" });
    const accepted = [
      { trial: "tr1", change: { rule: "tests_kept", layer: "b", detail: "" }, model: "claude:sonnet-old" },
      { trial: "tr2", change: { rule: "protect_path", layer: "c", detail: "ops/**" }, model: "claude:sonnet-old" },
    ] as const;
    expect(ablationCandidates(accepted, on, "claude:sonnet-new").map((x) => x.trial)).toEqual(["tr1"]);
    expect(ablationCandidates(accepted, on, "claude:sonnet-old")).toEqual([]);
    expect(ablationCandidates(accepted, on, null)).toEqual([]);
  });
});

describe("the changes learning proposes (D-641)", () => {
  const T = "tests/cart.test.ts > adds an item";
  it("a flaky test goes into layer A tests.flaky; removing it restores the profile exactly; it never narrows", () => {
    const p = base();
    const c = { rule: "flaky_test", layer: "a", detail: T } as const;
    expect(hasChange(p, c)).toBe(false);
    const after = applyChange(p, c);
    expect(after.a.tests.flaky).toEqual([T]);
    expect(hasChange(after, c)).toBe(true);
    expect(isNarrowing(p, after)).toBe(false);
    expect(removeChange(after, c)).toEqual(p);
    expect(applyChange(after, c)).toEqual(after); // twice is once
  });

  it("an allow or deny of a tool replaces the any-subject rule of that tool; deny narrows, allow does not", () => {
    const p = { ...base(), c: [...base().c, { subject: "any", tool: "bash:pnpm add *", decision: "ask", reason: "x" }] } as Layers;
    const allow = { rule: "tool_allow", layer: "c", detail: "bash:pnpm add *" } as const;
    const deny = { rule: "tool_deny", layer: "c", detail: "bash:pnpm add *" } as const;
    const a = applyChange(p, allow);
    expect(a.c.filter((r) => r.tool === "bash:pnpm add *")).toEqual([{ subject: "any", tool: "bash:pnpm add *", decision: "allow", reason: "learned from asks (D-641)" }]);
    expect(hasChange(a, allow)).toBe(true);
    expect(hasChange(a, deny)).toBe(false);
    expect(isNarrowing(p, a)).toBe(false);
    const d = applyChange(p, deny);
    expect(isNarrowing(p, d)).toBe(true);
    expect(hasChange(removeChange(d, deny), deny)).toBe(false);
    // a rule for one agent only is left alone
    const scoped = { ...p, c: [...p.c, { subject: "agent:codex", tool: "bash:pnpm add *", decision: "deny", reason: "y" }] } as Layers;
    expect(applyChange(scoped, allow).c.some((r) => r.subject === "agent:codex" && r.decision === "deny")).toBe(true);
  });
});
