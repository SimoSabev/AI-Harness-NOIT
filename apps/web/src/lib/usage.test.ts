import { describe, expect, it } from "vitest";
import { usageView } from "./usage";

// D-629 (Simo 26.11.2026): one page that says what each model and account costs and what is left — by the facts the
// harness has: what every task and conversation spent (USD), how much work it did, and whether the account is in its limit.
const now = Date.parse("2026-11-26T12:00:00Z");
const r = (agent: string, usd: number, at: string, o: Partial<{ kind: "task" | "chat"; model: string | null; minutes: number; result: string | null }> = {}) =>
  ({ agent, model: o.model ?? "m1", kind: o.kind ?? "task", usd, minutes: o.minutes ?? 0, result: o.result ?? null, at });
const agents = [
  { id: "claude@a", label: "Claude · a@x", limitedUntil: "2026-11-26T15:00:00Z" },
  { id: "claude@b", label: "Claude · b@x", limitedUntil: null },
  { id: "codex", label: "Codex", limitedUntil: "2026-11-20T00:00:00Z" },
];

describe("usageView (D-629)", () => {
  const rows = [
    r("claude@a", 1.5, "2026-11-26T09:00:00Z", { result: "VERIFIED", minutes: 4 }),
    r("claude@a", 0.5, "2026-11-25T09:00:00Z", { kind: "chat", model: "m2" }),
    r("claude@b", 1, "2026-11-20T09:00:00Z", { result: "FAILED", minutes: 2 }),
    r("claude@b", 9, "2026-10-01T09:00:00Z"),
    r("gone@old", 0.25, "2026-11-26T08:00:00Z", { result: "VERIFIED" }),
  ];
  const v = usageView(rows, agents, { now, days: 7 });

  it("totals: today, the period, the work done, the cost of an accepted result", () => {
    expect(v.totals).toEqual({ today: 1.75, period: 3.25, tasks: 3, chats: 1, verified: 2, perVerified: 1.625, minutes: 6 });
  });
  it("one row per account the box offers (even unused), then any other agent that spent; most spent first", () => {
    expect(v.rows.map((x) => [x.id, x.usd, x.tasks, x.chats, x.today])).toEqual([
      ["claude@a", 2, 1, 1, 1.5],
      ["claude@b", 1, 1, 0, 0],
      ["gone@old", 0.25, 1, 0, 0.25],
      ["codex", 0, 0, 0, 0],
    ]);
    expect(v.rows[0]?.share).toBeCloseTo(2 / 3.25);
    expect(v.rows[0]?.models).toEqual([{ model: "m1", usd: 1.5 }, { model: "m2", usd: 0.5 }]);
    expect(v.rows.find((x) => x.id === "gone@old")?.label).toBe("gone@old");
  });
  it("what is left: in its limit until the reset, else free (a past reset is free)", () => {
    expect(v.rows.map((x) => [x.id, x.left])).toEqual([
      ["claude@a", { kind: "limit", until: "2026-11-26T15:00:00Z" }],
      ["claude@b", { kind: "free" }],
      ["gone@old", { kind: "free" }],
      ["codex", { kind: "free" }],
    ]);
  });
  it("a bar per day of the period, oldest first, today last", () => {
    expect(v.days).toHaveLength(7);
    expect(v.days.at(-1)).toEqual({ day: "2026-11-26", usd: 1.75 });
    expect(v.days.at(-2)).toEqual({ day: "2026-11-25", usd: 0.5 });
    expect(v.days[0]).toEqual({ day: "2026-11-20", usd: 1 });
  });
  it("nothing spent: zeros, never a division by zero", () => {
    const e = usageView([], [], { now, days: 30 });
    expect(e.totals).toEqual({ today: 0, period: 0, tasks: 0, chats: 0, verified: 0, perVerified: null, minutes: 0 });
    expect(e.days).toHaveLength(30);
    expect(e.rows).toEqual([]);
  });
});
