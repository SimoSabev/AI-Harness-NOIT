import { describe, expect, it } from "vitest";
import type { LimitSnapshot } from "@mandat/contract";
import { usageView, windowSpan } from "./usage";

// D-629 (Simo 26.11.2026): one page that says what each model and account costs and what is left — by the facts the
// harness has: what every task and conversation spent (USD), how much work it did, and whether the account is in its limit.
// D-647 (Simo 26.11.2026, „daily или weekly в зависимост от провайдъра … ако е API, да са пари“): a subscription shows its
// provider's own windows with what is left and the reset; a key shows money; no data is said, never "free".
const now = Date.parse("2026-11-26T12:00:00Z");
const r = (agent: string, usd: number, at: string, o: Partial<{ kind: "task" | "chat"; model: string | null; minutes: number; result: string | null }> = {}) =>
  ({ agent, model: o.model ?? "m1", kind: o.kind ?? "task", usd, minutes: o.minutes ?? 0, result: o.result ?? null, at });
const agents = [
  { id: "claude@a", label: "Claude · a@x", limitedUntil: "2026-11-26T15:00:00Z" },
  { id: "claude@b", label: "Claude · b@x", limitedUntil: null },
  { id: "codex", label: "Codex", limitedUntil: "2026-11-20T00:00:00Z" },
  { id: "claude+c1", label: "Claude · my key", limitedUntil: null },
  { id: "fake:honest-fix", label: "Demo", limitedUntil: null },
];
const snap = (agent: string, windows: LimitSnapshot["windows"]): LimitSnapshot => ({ agent, at: "2026-11-26T11:00:00.000Z", windows });
const windows: Record<string, LimitSnapshot> = {
  "claude@a": snap("claude@a", [
    { id: "seven_day", minutes: 10080, used: 0.53, resets_at: "2026-11-30T09:00:00.000Z", status: "allowed" },
    { id: "five_hour", minutes: 300, used: 1, resets_at: "2026-11-26T15:00:00.000Z", status: "rejected" },
  ]),
  // a plan with only a weekly window (as the provider sent it), whose last window already reset
  "claude@b": snap("claude@b", [{ id: "seven_day", minutes: 10080, used: 0.9, resets_at: "2026-11-26T10:00:00.000Z", status: "warning" }]),
};

describe("usageView (D-629, D-647)", () => {
  const rows = [
    r("claude@a", 1.5, "2026-11-26T09:00:00Z", { result: "VERIFIED", minutes: 4 }),
    r("claude@a", 0.5, "2026-11-25T09:00:00Z", { kind: "chat", model: "m2" }),
    r("claude@b", 0, "2026-11-20T09:00:00Z", { result: "FAILED", minutes: 2 }),
    r("claude+c1", 1, "2026-11-26T08:00:00Z", { result: "VERIFIED" }),
    r("codex", 2, "2026-11-21T09:00:00Z"),
    r("codex", 9, "2026-10-01T09:00:00Z"),
  ];
  const v = usageView(rows, agents, { now, days: 7, windows });

  it("totals count only money paid per use: a subscription's amount is the value of its work, not a bill", () => {
    expect(v.totals).toEqual({ today: 1, period: 3, value: 2, tasks: 4, chats: 1, verified: 2, perVerified: 1.5, minutes: 6 });
  });
  it("one row per account the box offers (even unused), then any other agent; paid first by money, then the rest", () => {
    expect(v.rows.map((x) => [x.id, x.billing, x.usd, x.tasks, x.chats, x.today])).toEqual([
      ["codex", "key", 2, 1, 0, 0],
      ["claude+c1", "key", 1, 1, 0, 1],
      ["claude@a", "plan", 2, 1, 1, 1.5],
      ["claude@b", "plan", 0, 1, 0, 0],
      ["fake:honest-fix", "free", 0, 0, 0, 0],
    ]);
    expect(v.rows[0]?.share).toBeCloseTo(2 / 3);
    expect(v.rows.find((x) => x.id === "claude@a")?.share).toBe(0);
    expect(v.rows.find((x) => x.id === "claude@a")?.models).toEqual([{ model: "m1", usd: 1.5 }, { model: "m2", usd: 0.5 }]);
  });
  it("a subscription: its own windows, shortest first, with what is left and the reset; a passed reset is full again", () => {
    const a = v.rows.find((x) => x.id === "claude@a")?.left;
    expect(a).toEqual({
      kind: "windows", seen: "2026-11-26T11:00:00.000Z", limitedUntil: "2026-11-26T15:00:00Z",
      windows: [
        { id: "five_hour", minutes: 300, left: 0, resetsAt: "2026-11-26T15:00:00.000Z", status: "rejected", reset: false },
        { id: "seven_day", minutes: 10080, left: 0.47, resetsAt: "2026-11-30T09:00:00.000Z", status: "allowed", reset: false },
      ],
    });
    expect(v.rows.find((x) => x.id === "claude@b")?.left).toEqual({
      kind: "windows", seen: "2026-11-26T11:00:00.000Z", limitedUntil: null,
      windows: [{ id: "seven_day", minutes: 10080, left: 1, resetsAt: null, status: null, reset: true }],
    });
  });
  it("the longest window's use goes in the spent column of a subscription", () => {
    expect(v.rows.find((x) => x.id === "claude@a")?.planUsed).toEqual({ id: "seven_day", minutes: 10080, used: 0.53 });
    expect(v.rows.find((x) => x.id === "claude@b")?.planUsed).toEqual({ id: "seven_day", minutes: 10080, used: 0 });
    expect(v.rows.find((x) => x.id === "codex")?.planUsed).toBeNull();
  });
  it("no windows from the provider: said as such (with a known limit), never “free”; a key: money; a demo: free", () => {
    const none = usageView([], agents, { now, days: 7 });
    expect(none.rows.find((x) => x.id === "claude@a")?.left).toEqual({ kind: "no_data", limitedUntil: "2026-11-26T15:00:00Z" });
    expect(none.rows.find((x) => x.id === "claude@b")?.left).toEqual({ kind: "no_data", limitedUntil: null });
    expect(v.rows.find((x) => x.id === "codex")?.left).toEqual({ kind: "money", today: 0, period: 2 });
    expect(v.rows.find((x) => x.id === "fake:honest-fix")?.left).toEqual({ kind: "free" });
  });
  it("a bar per day of the period (money paid per use), oldest first, today last", () => {
    expect(v.days).toHaveLength(7);
    expect(v.days.at(-1)).toEqual({ day: "2026-11-26", usd: 1 });
    expect(v.days.at(-6)).toEqual({ day: "2026-11-21", usd: 2 });
  });
  it("nothing spent: zeros, never a division by zero", () => {
    const e = usageView([], [], { now, days: 30 });
    expect(e.totals).toEqual({ today: 0, period: 0, value: 0, tasks: 0, chats: 0, verified: 0, perVerified: null, minutes: 0 });
    expect(e.days).toHaveLength(30);
    expect(e.rows).toEqual([]);
  });
});

describe("windowSpan (D-647)", () => {
  it("the window's length as a person says it, from its minutes; the provider's extra scope stays", () => {
    expect(windowSpan({ id: "five_hour", minutes: 300 })).toEqual({ span: "hours", n: 5, scope: null });
    expect(windowSpan({ id: "daily", minutes: 1440 })).toEqual({ span: "day", n: 1, scope: null });
    expect(windowSpan({ id: "seven_day", minutes: 10080 })).toEqual({ span: "week", n: 1, scope: null });
    expect(windowSpan({ id: "seven_day_opus", minutes: 10080 })).toEqual({ span: "week", n: 1, scope: "Opus" });
    expect(windowSpan({ id: "seven_day_overage_included", minutes: 10080 })).toEqual({ span: "week", n: 1, scope: "overage included" });
    expect(windowSpan({ id: "new_window", minutes: null })).toEqual({ span: "other", n: 0, scope: "new window" });
  });
});
