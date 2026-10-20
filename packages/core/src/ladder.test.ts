import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { H_DOWN_DEFAULT, H_UP_DEFAULT, LADDER_STEP_FAILURE, LADDER_STEP_SUCCESS, ladderStep, simulateLadder, successesToNextLevel } from "./ladder.js";
import type { LadderInput, LadderState } from "./ladder.js";

const zero: LadderState = { level: 0, s_up: 0, s_down: 0, pinned: false };
const run = (s: LadderState, inputs: LadderInput[]) => inputs.reduce((acc, e) => ladderStep(acc, e).next, s);
const n = (k: number, e: LadderInput): LadderInput[] => Array.from({ length: k }, () => e);

describe("ladder (спец. т. 7, D-208)", () => {
  it("константи", () => {
    expect(LADDER_STEP_SUCCESS).toBeCloseTo(0.1112, 4);
    expect(LADDER_STEP_FAILURE).toBeCloseTo(-1.0986, 4);
    expect([H_UP_DEFAULT, H_DOWN_DEFAULT]).toEqual([5, 3.5]);
  });
  it("45 успеха от 0 → ниво 1; 44 → ниво 0", () => {
    expect(successesToNextLevel(zero)).toBe(45);
    expect(run(zero, n(44, "success")).level).toBe(0);
    const after45 = run(zero, n(45, "success"));
    expect(after45).toEqual({ level: 1, s_up: 0, s_down: 0, pinned: false });
    expect(ladderStep(run(zero, n(44, "success")), "success").reason).toBe("success");
  });
  it("1 провал след 44 успеха → s_up = max(0, s_up + стъпка)", () => {
    const s44 = run(zero, n(44, "success"));
    const r = ladderStep(s44, "failure");
    expect(r.next.s_up).toBeCloseTo(Math.max(0, 44 * LADDER_STEP_SUCCESS + LADDER_STEP_FAILURE), 10);
    expect(r.next.level).toBe(0);
    expect(r.delta).toBe(0);
  });
  it("провали до s_down ≥ 3,5 → ниво −1 и нулиране", () => {
    const l2: LadderState = { level: 2, s_up: 0, s_down: 0, pinned: false };
    expect(run(l2, n(3, "failure")).level).toBe(2);
    const r = ladderStep(run(l2, n(3, "failure")), "failure");
    expect(r.next).toEqual({ level: 1, s_up: 0, s_down: 0, pinned: false });
    expect(r.delta).toBe(-1);
    expect(r.reason).toBe("failure");
    expect(run(zero, n(10, "failure")).level).toBe(0);
  });
  it("успех намалява s_down; ниво 3 е таван", () => {
    const s = ladderStep({ level: 1, s_up: 0, s_down: 2, pinned: false }, "success").next;
    expect(s.s_down).toBeCloseTo(2 - LADDER_STEP_SUCCESS, 10);
    expect(successesToNextLevel({ level: 3, s_up: 0, s_down: 0, pinned: false })).toBe(null);
    expect(run({ level: 3, s_up: 0, s_down: 0, pinned: false }, n(100, "success")).level).toBe(3);
  });
  it("hard_fail при pinned → 0 и unpinned; pinned не се мени от success/failure", () => {
    const pinned: LadderState = { level: 2, s_up: 1, s_down: 0, pinned: true };
    expect(ladderStep(pinned, "hard_fail")).toEqual({ next: { level: 0, s_up: 0, s_down: 0, pinned: false }, delta: -2, reason: "hard_fail" });
    const p = run(pinned, n(60, "success"));
    expect(p.level).toBe(2);
    expect(p.s_up).toBeGreaterThan(5);
    expect(run(pinned, n(10, "failure")).level).toBe(2);
  });
  it("neutral не мени нищо", () => {
    const s: LadderState = { level: 1, s_up: 2, s_down: 1, pinned: false };
    expect(ladderStep(s, "neutral")).toEqual({ next: s, delta: 0, reason: "none" });
  });
  it("собствени прагове", () => {
    expect(successesToNextLevel(zero, 1)).toBe(9);
    expect(ladderStep({ level: 0, s_up: 0.95, s_down: 0, pinned: false }, "success", { h_up: 1 }).next.level).toBe(1);
    expect(ladderStep({ level: 1, s_up: 0, s_down: 0.5, pinned: false }, "failure", { h_down: 1 }).next.level).toBe(0);
  });
  it("property: нивото е 0..3; s_up, s_down ≥ 0", () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom<LadderInput>("success", "failure", "hard_fail", "neutral"), { maxLength: 300 }), fc.boolean(), (inputs, pinned) => {
        let s: LadderState = { ...zero, pinned };
        for (const e of inputs) {
          s = ladderStep(s, e).next;
          expect([0, 1, 2, 3]).toContain(s.level);
          expect(s.s_up).toBeGreaterThanOrEqual(0);
          expect(s.s_down).toBeGreaterThanOrEqual(0);
        }
      }),
    );
  });
  it("simulateLadder е детерминистичен по seed", () => {
    const a = simulateLadder({ p: 0.95, h: 5, runs: 200, seed: 1 });
    expect(simulateLadder({ p: 0.95, h: 5, runs: 200, seed: 1 })).toEqual(a);
    expect(a.mean).toBeGreaterThan(45);
    expect(simulateLadder({ p: 1, h: 5, runs: 3, seed: 2 }).mean).toBe(45);
  });
});
