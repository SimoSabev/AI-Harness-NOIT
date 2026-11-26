import { describe, expect, it } from "vitest";
import { ProfileLayers, demoProfileLayers } from "@mandat/contract";
import type { ProfileChange, ProfileLayers as Layers } from "@mandat/contract";
import { applyChange } from "@mandat/profile";
import { gateDecision, keepsHardRules, undoChange, watchDecision, weakens } from "./auto.js";
import type { BenchScore, WatchRow } from "./auto.js";

// D-647 (Simo 26.11.2026, „за ученето да е автоматично, а не ръчно“): a learned proposal applies itself after the bench
// gate, without a person; one that can weaken the verdict (a flaky test, an allowed tool) is also watched and rolls
// itself back when the failures or the model regressions get worse. The hard rules of AGENTS.md stay.
const base = (): Layers => {
  const p = ProfileLayers.parse(demoProfileLayers());
  return { ...p, c: p.c.filter((r) => !r.tool.startsWith("path:write:infra")) };
};
const ok = (over: Partial<BenchScore> = {}): BenchScore => ({ pass: 10, total: 10, false_verified: 0, heldout: { pass: 5, total: 5, false_verified: 0 }, ...over });
const PROTECT: ProfileChange = { rule: "protect_path", layer: "c", detail: "infra/**" };
const FLAKY: ProfileChange = { rule: "flaky_test", layer: "a", detail: "tests/cart.test.ts > adds an item" };
const ALLOW: ProfileChange = { rule: "tool_allow", layer: "c", detail: "bash:pnpm add *" };
const DENY: ProfileChange = { rule: "tool_deny", layer: "c", detail: "bash:pnpm add *" };
const gate = (change: ProfileChange, before: BenchScore, after: BenchScore, o: { requireHeldout?: boolean; candidate?: Layers } = {}) => {
  const layers = base();
  return gateDecision({ layers, candidate: o.candidate ?? applyChange(layers, change), change, before, after, requireHeldout: o.requireHeldout ?? true });
};

describe("weakens", () => {
  it("a flaky test and an allowed tool can weaken the verdict; the D-530 narrowings and a deny cannot", () => {
    expect([FLAKY, ALLOW].map(weakens)).toEqual([true, true]);
    expect([PROTECT, DENY, { rule: "tests_kept", layer: "b", detail: "" } as ProfileChange].map(weakens)).toEqual([false, false, false]);
  });
});

describe("gateDecision: apply or not, without a person", () => {
  it("a narrowing that holds on the bench applies and is watched by its prediction (D-530)", () => {
    expect(gate(PROTECT, ok(), ok())).toMatchObject({ apply: true, watch: "prediction" });
  });

  it("a worse bench or a worse held-out set → not applied", () => {
    expect(gate(PROTECT, ok(), ok({ pass: 9 }))).toMatchObject({ apply: false, why: expect.stringMatching(/bench got worse/) });
    expect(gate(PROTECT, ok({ false_verified: 0 }), ok({ false_verified: 1, pass: 10 }))).toMatchObject({ apply: false });
    expect(gate(FLAKY, ok(), ok({ heldout: { pass: 4, total: 5, false_verified: 0 } }))).toMatchObject({ apply: false, why: expect.stringMatching(/held-out/) });
  });

  it("a weakening change applies only with no false VERIFIED on either set, and is watched for regressions", () => {
    expect(gate(FLAKY, ok(), ok())).toMatchObject({ apply: true, watch: "regression" });
    expect(gate(ALLOW, ok(), ok())).toMatchObject({ apply: true, watch: "regression" });
    // not worse than before, but the bench with the change still calls a broken solution VERIFIED
    expect(gate(FLAKY, ok({ false_verified: 1 }), ok({ false_verified: 1 }))).toMatchObject({ apply: false, why: expect.stringMatching(/false VERIFIED/) });
    expect(gate(ALLOW, ok({ heldout: { pass: 5, total: 5, false_verified: 1 } }), ok({ heldout: { pass: 5, total: 5, false_verified: 1 } }))).toMatchObject({ apply: false, why: expect.stringMatching(/false VERIFIED/) });
  });

  it("a weakening change needs the held-out set even when the caller does not require it", () => {
    const noHeld = { pass: 10, total: 10, false_verified: 0 };
    expect(gate(FLAKY, noHeld, noHeld, { requireHeldout: false })).toMatchObject({ apply: false, why: expect.stringMatching(/held-out/) });
    expect(gate(PROTECT, noHeld, noHeld, { requireHeldout: false })).toMatchObject({ apply: true });
    expect(gate(PROTECT, noHeld, noHeld, { requireHeldout: true })).toMatchObject({ apply: false });
  });

  it("an allow that would widen a deny (not narrowing) is still the regression-watched path", () => {
    const layers = base();
    const withDeny = applyChange(layers, DENY);
    expect(gateDecision({ layers: withDeny, candidate: applyChange(withDeny, ALLOW), change: ALLOW, before: ok(), after: ok(), requireHeldout: true })).toMatchObject({ apply: true, watch: "regression" });
  });
});

describe("keepsHardRules (AGENTS.md)", () => {
  it("learning never touches protected_paths or any other part of layer A but tests.flaky", () => {
    const p = base();
    expect(keepsHardRules(p, applyChange(p, FLAKY))).toBe(true);
    const moved = { ...p, a: { ...p.a, protected_paths: [] } };
    expect(keepsHardRules(p, moved)).toBe(false);
    expect(gate(PROTECT, ok(), ok(), { candidate: { ...applyChange(p, PROTECT), a: moved.a } })).toMatchObject({ apply: false, why: expect.stringMatching(/hard rule/) });
  });

  it("never a learned allow for a way out of the sandbox or a write: net:*, git push, path:write:, mandat:", () => {
    const p = base();
    for (const tool of ["net:api.segment.io", "bash:git push origin", "path:write:.github/**", "mandat:*"]) {
      const after = { ...p, c: [...p.c, { subject: "any" as const, tool, decision: "allow" as const, reason: "x" }] };
      expect([tool, keepsHardRules(p, after)]).toEqual([tool, false]);
    }
    expect(keepsHardRules(p, applyChange(p, ALLOW))).toBe(true);
  });

  it("layers E–H never change by learning", () => {
    const p = base();
    expect(keepsHardRules(p, { ...p, g: { ...p.g, mutants: p.g.mutants + 1 } })).toBe(false);
    expect(keepsHardRules(p, { ...p, h: { ...p.h, routing: [] } })).toBe(p.h.routing.length === 0);
  });
});

describe("undoChange: back to what the change replaced", () => {
  it("an allow that replaced an ask goes back to the ask; a flaky test leaves the list", () => {
    const p = base();
    const asked = { ...p, c: [...p.c, { subject: "any" as const, tool: "bash:pnpm add *", decision: "ask" as const, reason: "a person decides" }] };
    const applied = applyChange(asked, ALLOW);
    expect(undoChange(applied, asked, ALLOW).c.filter((r) => r.tool === "bash:pnpm add *")).toEqual([{ subject: "any", tool: "bash:pnpm add *", decision: "ask", reason: "a person decides" }]);
    const f = applyChange(p, FLAKY);
    expect(undoChange(f, p, FLAKY).a.tests.flaky ?? []).toEqual(p.a.tests.flaky ?? []);
  });

  it("keeps what came after the change (another accepted change stays)", () => {
    const p = base();
    const both = applyChange(applyChange(p, ALLOW), PROTECT);
    const back = undoChange(both, p, ALLOW);
    expect(back.c.some((r) => r.tool === "path:write:infra/**" && r.decision === "deny")).toBe(true);
    expect(back.c.some((r) => r.tool === "bash:pnpm add *")).toBe(false);
  });
});

describe("watchDecision: a weakening change rolls itself back when things get worse", () => {
  const APPLIED = "2026-11-10T12:00:00.000Z";
  const at = (days: number) => new Date(Date.parse(APPLIED) + days * 86_400_000).toISOString();
  const rows = (bad: number, n: number, from: number): WatchRow[] => Array.from({ length: n }, (_, i) => ({ at: at(from + i * 0.1), bad: i < bad }));
  const watch = (before: WatchRow[], after: WatchRow[], o: { regressions?: string[]; now?: string } = {}) =>
    watchDecision({ applied_at: APPLIED, now: o.now ?? at(30), before, after, regressions: (o.regressions ?? []).map((week) => ({ week })) });

  it("fewer than 5 tasks after → wait", () => {
    expect(watch(rows(5, 20, -10), rows(4, 4, 1))).toMatchObject({ action: "wait", seen: 4 });
  });

  it("a larger share of failures after than before → roll back", () => {
    expect(watch(rows(2, 20, -10), rows(2, 5, 1))).toMatchObject({ action: "rollback", share_before: 0.1, share_after: 0.4, why: expect.stringMatching(/failures got worse/) });
  });

  it("not worse over 10 tasks and the week's regression card had its chance → keep, and the watch is over", () => {
    expect(watch(rows(4, 20, -10), rows(1, 10, 1))).toMatchObject({ action: "keep", seen: 10 });
    // the 10th task is in the week of 16.11; its card comes on the Monday after → until 24.11 the watch waits
    expect(watch(rows(4, 20, -10), rows(1, 10, 6), { now: at(13) })).toMatchObject({ action: "wait" });
  });

  it("a model regression card for a week that overlaps the watch → roll back; an older week does not count", () => {
    expect(watch(rows(4, 20, -10), rows(0, 6, 1), { regressions: ["2026-11-09"] })).toMatchObject({ action: "rollback", why: expect.stringMatching(/regression/) });
    expect(watch(rows(4, 20, -10), rows(0, 10, 1), { regressions: ["2026-11-02"] })).toMatchObject({ action: "keep" });
  });

  it("only the first 10 tasks after and the last 20 before count", () => {
    // 30 old tasks: the 10 oldest were all bad, the last 20 have 2 bad → 10% before
    const before = [...rows(10, 10, -20), ...rows(2, 20, -10)];
    // first 10 after: 1 bad; later ones all bad but outside the window
    const after = [...rows(1, 10, 1), ...rows(10, 10, 3)];
    expect(watch(before, after)).toMatchObject({ action: "keep", share_before: 0.1, share_after: 0.1 });
  });
});
