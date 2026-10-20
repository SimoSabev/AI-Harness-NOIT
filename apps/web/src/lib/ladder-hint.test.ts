import { describe, expect, it } from "vitest";
import { H_UP_DEFAULT, LADDER_STEP_SUCCESS } from "@mandat/core";
import { ladderHint } from "./ladder-hint";

describe("ladder hint (т. 8.1)", () => {
  it("„още N ПРОВЕРЕНО до ниво L+1“ по successesToNextLevel", () => {
    const sUp = H_UP_DEFAULT - 4 * LADDER_STEP_SUCCESS + 0.01;
    expect(ladderHint({ level: 2, s_up: sUp, pinned: false })).toBe("ниво 2, още 4 ПРОВЕРЕНО до ниво 3");
    expect(ladderHint({ level: 1, s_up: H_UP_DEFAULT - 0.05, pinned: false })).toBe("ниво 1, още 1 ПРОВЕРЕНО до ниво 2");
    expect(ladderHint({ level: 0, s_up: 0, pinned: false })).toBe("ниво 0, още 45 ПРОВЕРЕНО до ниво 1");
  });
  it("ниво 3", () => {
    expect(ladderHint({ level: 3, s_up: 0, pinned: true })).toBe("ниво 3 (закрепено)");
    expect(ladderHint({ level: 3, s_up: 0, pinned: false })).toBe("ниво 3 (най-високо)");
    expect(ladderHint({ level: 1, s_up: 0, pinned: true })).toBe("ниво 1 (закрепено)");
  });
});
