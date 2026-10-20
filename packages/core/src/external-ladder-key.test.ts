import { describe, expect, it } from "vitest";
import { ladderCapFor, ladderStepFor } from "./ladder.js";
import type { LadderState } from "./ladder.js";

describe("external-ladder-key (D-207, S38)", () => {
  it("50 VERIFIED на external:gh:<id> не вдигат нивото над 1 и не пипат ключа claude", () => {
    const keys = new Map<string, LadderState>([["shop|bugfix|claude", { level: 2, s_up: 1, s_down: 0, pinned: false }]]);
    const ext = "shop|bugfix|external:gh:4242";
    keys.set(ext, { level: 0, s_up: 0, s_down: 0, pinned: false });
    for (let k = 0; k < 50 * 3; k++) keys.set(ext, ladderStepFor("external:gh:4242", keys.get(ext) as LadderState, "success").next);
    expect(keys.get(ext)?.level).toBe(1);
    expect(keys.get("shop|bugfix|claude")).toEqual({ level: 2, s_up: 1, s_down: 0, pinned: false });
    expect(ladderCapFor("claude")).toBe(3);
    expect(ladderStepFor("external:mcp-local", { level: 0, s_up: 0, s_down: 0, pinned: false }, "success")).toMatchObject({ reason: "none", delta: 0 });
  });
});
