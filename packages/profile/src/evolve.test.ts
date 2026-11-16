import { describe, expect, it } from "vitest";
import { ProfileLayers, demoProfileLayers } from "@mandat/contract";
import type { ProfileLayers as Layers, ProfileManifest } from "@mandat/contract";
import { TESTS_KEPT, applyChange, isNarrowing, predictionHeld, rulesFromFailures } from "./evolve.js";
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
