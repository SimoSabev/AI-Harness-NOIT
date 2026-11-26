import { describe, expect, it } from "vitest";
import { LimitSnapshot, claudeLimitWindows, newestWindows } from "./limit-windows.js";

// D-647 (Simo 26.11.2026, „daily или weekly в зависимост от провайдъра … реално колко остава за всеки“): the windows of a
// subscription come from the provider's own stream, never from a table of plans. Claude Code 2.1.332 (live, 26.11.2026):
// rate_limit_event.rate_limit_info.unifiedWindows carries every window of the account, with its use and reset.
const live = {
  type: "rate_limit_event",
  rate_limit_info: {
    status: "allowed_warning", resetsAt: 1796209200, rateLimitType: "seven_day", utilization: 0.53, overageStatus: "rejected", isUsingOverage: false,
    unifiedWindows: { five_hour: { utilization: 0, resetsAt: 1795734000, status: "allowed" }, seven_day: { utilization: 0.53, resetsAt: 1796209200, status: "allowed" } },
  },
  uuid: "u", session_id: "s",
};

describe("claudeLimitWindows (D-647)", () => {
  it("every window the provider sent, with its length, use and reset — as the live event of 2.1.332 has them", () => {
    expect(claudeLimitWindows(live)).toEqual([
      { id: "five_hour", minutes: 300, used: 0, resets_at: new Date(1795734000 * 1000).toISOString(), status: "allowed" },
      { id: "seven_day", minutes: 10080, used: 0.53, resets_at: new Date(1796209200 * 1000).toISOString(), status: "allowed" },
    ]);
  });
  it("a plan with only a weekly window has only that one: nothing is assumed", () => {
    const weekly = { type: "rate_limit_event", rate_limit_info: { status: "allowed", unifiedWindows: { seven_day: { utilization: 0.1, resetsAt: 1796209200 } } } };
    expect(claudeLimitWindows(weekly)?.map((w) => [w.id, w.status])).toEqual([["seven_day", null]]);
  });
  it("an older CLI without unifiedWindows: the one limiting window from the top-level fields; rejected = used up", () => {
    const old = { type: "rate_limit_event", rate_limit_info: { status: "rejected", resetsAt: 1795734000, rateLimitType: "five_hour" } };
    expect(claudeLimitWindows(old)).toEqual([{ id: "five_hour", minutes: 300, used: 1, resets_at: new Date(1795734000 * 1000).toISOString(), status: "rejected" }]);
    const plain = { type: "rate_limit_event", rate_limit_info: { status: "allowed_warning", rateLimitType: "seven_day_opus", utilization: 0.8 } };
    expect(claudeLimitWindows(plain)).toEqual([{ id: "seven_day_opus", minutes: 10080, used: 0.8, resets_at: null, status: "warning" }]);
  });
  it("other rows, broken windows and a window name it does not know: none or skipped, never a throw", () => {
    expect(claudeLimitWindows({ type: "assistant" })).toBeNull();
    expect(claudeLimitWindows("nope")).toBeNull();
    expect(claudeLimitWindows({ type: "rate_limit_event", rate_limit_info: { status: "allowed" } })).toBeNull();
    expect(claudeLimitWindows({ type: "rate_limit_event", rate_limit_info: { status: "allowed", unifiedWindows: { five_hour: { utilization: "x", resetsAt: 1 } } } })).toBeNull();
    const odd = { type: "rate_limit_event", rate_limit_info: { status: "allowed", unifiedWindows: { new_window: { utilization: 0.2, resetsAt: 1795734000 } } } };
    expect(claudeLimitWindows(odd)).toEqual([{ id: "new_window", minutes: null, used: 0.2, resets_at: new Date(1795734000 * 1000).toISOString(), status: null }]);
  });
});

describe("LimitSnapshot and newestWindows (D-647)", () => {
  it("the ledger payload is checked at the border: an agent ref, a time and 1–8 windows", () => {
    const ok = { agent: "claude@lichno", at: "2026-11-26T10:00:00.000Z", windows: claudeLimitWindows(live) };
    expect(LimitSnapshot.safeParse(ok).success).toBe(true);
    expect(LimitSnapshot.safeParse({ ...ok, agent: "no such agent!" }).success).toBe(false);
    expect(LimitSnapshot.safeParse({ ...ok, windows: [] }).success).toBe(false);
    expect(LimitSnapshot.safeParse({ ...ok, token: "x" }).success).toBe(false);
  });
  it("the newest valid snapshot per agent; broken payloads are skipped", () => {
    const w = claudeLimitWindows(live) ?? [];
    const got = newestWindows([
      { agent: "claude@a", at: "2026-11-26T09:00:00.000Z", windows: w },
      { agent: "claude@a", at: "2026-11-26T10:00:00.000Z", windows: w.slice(1) },
      { agent: "claude@b", at: "2026-11-25T10:00:00.000Z", windows: w },
      { agent: "claude@c", windows: "broken" },
      null,
    ]);
    expect(Object.keys(got).sort()).toEqual(["claude@a", "claude@b"]);
    expect(got["claude@a"]?.windows.map((x) => x.id)).toEqual(["seven_day"]);
  });
});
