import { describe, expect, it } from "vitest";
import { nextCooldownS, onLimit } from "./limit-chain.js";
import { ch } from "./select.test-helper.js";

const now = new Date("2026-10-20T12:00:00Z");
const claude = ch({ id: "anthropic-key-demo" });
const openai = ch({ id: "openai-key-demo", provider: "openai", model: "gpt-5.5-codex" });
const base = { current: claude, waits: 0, spills: 0, prevCooldownS: null, estCostUsd: 0.5, now };

describe("limit-chain (Ф3 П6, В-2)", () => {
  it("retry-after 30 s → изчакване (до 3 пъти)", () => {
    expect(onLimit({ ...base, ev: { retryAfterS: 30, resetsAt: null }, fallbacks: [openai] })).toEqual({ action: "wait", seconds: 30 });
    expect(onLimit({ ...base, waits: 3, ev: { retryAfterS: 30, resetsAt: null }, fallbacks: [] }).action).toBe("held");
  });
  it("2 ч без cli_profile → преливане към api_key на openai; cooldown до resets_at", () => {
    const r = onLimit({ ...base, ev: { retryAfterS: 7200, resetsAt: "2026-10-20T14:00:00Z" }, fallbacks: [claude, openai] });
    expect(r.action === "spill" && [r.to.id, r.cooldownUntil, r.selection.reason.rule]).toEqual(["openai-key-demo", "2026-10-20T14:00:00Z", "fallback"]);
  });
  it("без кандидати → HELD; второ преливане → HELD; cli_profile на същия доставчик никога", () => {
    expect(onLimit({ ...base, ev: { retryAfterS: 7200, resetsAt: null }, fallbacks: [] })).toEqual({ action: "held", cooldownUntil: "2026-10-20T12:01:00.000Z", reason: "no_candidate" });
    expect(onLimit({ ...base, spills: 1, ev: { retryAfterS: 7200, resetsAt: null }, fallbacks: [openai] }).action === "held").toBe(true);
    const sameSub = ch({ id: "claude-sub-b", kind: "cli_profile" });
    expect(onLimit({ ...base, ev: { retryAfterS: 7200, resetsAt: null }, fallbacks: [sameSub] }).action).toBe("held");
  });
  it("cooldown без reset: 60 s → ×2 → макс. 1 ч", () => {
    expect([nextCooldownS(null), nextCooldownS(60), nextCooldownS(120), nextCooldownS(2400), nextCooldownS(3600)]).toEqual([60, 120, 240, 3600, 3600]);
  });
});
