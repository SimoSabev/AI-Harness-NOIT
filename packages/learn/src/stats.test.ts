import { describe, expect, it } from "vitest";
import { channelQuality, costForecast, forecastAccuracy, learnedQuality, modelRegression, profileAB } from "./stats.js";
import type { CostRow, OutcomeRow, VersionRow, WeekRow } from "./stats.js";

const NOW = new Date("2026-11-26T12:00:00.000Z"); // a Thursday
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

describe("channelQuality (PRD 6.11 т. 3, AC-11.2)", () => {
  const out = (channel_id: string, good: boolean, d = 1, task_type = "bugfix"): OutcomeRow => ({ channel_id, task_type, at: daysAgo(d), good });
  it("Q is the share of VERIFIED-and-merged by (channel, task type); older outcomes weigh less (half-life 30 days)", () => {
    const q = channelQuality([out("a", true, 0), out("a", false, 30), out("b", true, 1, "docs")], NOW);
    expect(q.get("a|bugfix")).toEqual({ q: 0.667, n: 2 });
    expect(q.get("b|docs")).toEqual({ q: 1, n: 1 });
    expect(q.has("a|docs")).toBe(false);
    expect(channelQuality([{ ...out("a", true), at: "bad" }, out("a", true, -2)], NOW).size).toBe(0);
  });

  it("the learned Q replaces the static one after 10 outcomes and flips the choice; before that nothing changes", () => {
    const chans = [{ id: "a", quality: 0.9, label: "A" }, { id: "b", quality: 0.8, label: "B" }];
    const nine = Array.from({ length: 9 }, (_, i) => out("a", false, i));
    expect(learnedQuality(chans, channelQuality(nine, NOW), "bugfix")).toEqual(chans);
    const ten = [...nine, out("a", false, 9)];
    const after = learnedQuality(chans, channelQuality(ten, NOW), "bugfix");
    expect(after).toEqual([{ id: "a", quality: 0, label: "A" }, chans[1]]);
    expect(learnedQuality(chans, channelQuality(ten, NOW), "docs")).toEqual(chans);
  });
});

describe("costForecast (PRD 6.11 т. 4)", () => {
  const row = (usd: number, d: number, o: Partial<CostRow> = {}): CostRow => ({ repo_id: "r", task_type: "bugfix", agent: "claude", usd, at: daysAgo(d), ...o });
  const key = { repo_id: "r", task_type: "bugfix", agent: "claude" } as const;
  it("the median of the last 10 tasks of (repo, type, agent); the default budget is twice that", () => {
    const h = [...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => row(d / 10, d)), row(9, 20), row(5, 1, { agent: "codex" }), row(0, 0)];
    expect(costForecast(h, key)).toEqual({ forecast_usd: 0.55, budget_usd: 1.1, n: 10 });
    expect(costForecast([row(0.3, 1), row(0.1, 2), row(0.2, 3)], key)).toEqual({ forecast_usd: 0.2, budget_usd: 0.4, n: 3 });
    expect(costForecast([row(0, 1)], key)).toBeNull();
    expect(costForecast([row(15, 1)], key)?.budget_usd).toBe(20); // never above the policy's task_usd maximum
  });

  it("forecastAccuracy walks forward: a task counts after 20 of its kind; within ±50% of the real cost", () => {
    const h = Array.from({ length: 30 }, (_, i) => row(i === 25 ? 5 : 1, 60 - i));
    expect(forecastAccuracy(h)).toEqual({ tasks: 10, within: 9, share: 0.9 });
    expect(forecastAccuracy(h.slice(0, 20))).toEqual({ tasks: 0, within: 0, share: null });
  });
});

describe("profileAB (PRD 6.11 т. 5)", () => {
  const r = (version: number, result: VersionRow["result"], o: Partial<VersionRow> = {}): VersionRow => ({ version, task_type: "bugfix", result, attempts: 1, usd: 0.5, ...o });
  it("version B against A over the task types both ran: VERIFIED share, rounds, cost", () => {
    const rows = [r(2, "VERIFIED"), r(2, "FAILED", { attempts: 3, usd: 1.5 }), r(3, "VERIFIED"), r(3, "VERIFIED", { attempts: 2 }), r(3, "VERIFIED", { task_type: "docs" })];
    expect(profileAB(rows, 2, 3)).toEqual({
      task_types: ["bugfix"],
      a: { version: 2, tasks: 2, verified_share: 0.5, avg_rounds: 2, avg_usd: 1 },
      b: { version: 3, tasks: 2, verified_share: 1, avg_rounds: 1.5, avg_usd: 0.5 },
    });
    expect(profileAB(rows, 2, 9)).toEqual({ task_types: [], a: { version: 2, tasks: 0, verified_share: null, avg_rounds: null, avg_usd: null }, b: { version: 9, tasks: 0, verified_share: null, avg_rounds: null, avg_usd: null } });
  });
});

describe("modelRegression (PRD 6.11 т. 6)", () => {
  const v = (model: string, day: string, ok: boolean): WeekRow => ({ model, at: `${day}T10:00:00.000Z`, verified: ok });
  const week = (model: string, monday: string, verified: number, total: number) => Array.from({ length: total }, (_, i) => v(model, monday, i < verified));
  it("the VERIFIED share of the last full week fell more than 20% against the week before → a card; the person decides", () => {
    // full weeks before Thursday 26.11: 16.11–22.11 and 09.11–15.11
    const rows = [...week("claude:x", "2026-11-09", 8, 10), ...week("claude:x", "2026-11-16", 6, 10), ...week("codex:y", "2026-11-09", 8, 10), ...week("codex:y", "2026-11-16", 7, 10)];
    expect(modelRegression(rows, NOW)).toEqual([{ kind: "model_regression", source: "rule:model_regression", model: "claude:x", week: "2026-11-16", prev_week: "2026-11-09", share: 0.6, prev_share: 0.8, tasks: 10, prev_tasks: 10 }]);
  });

  it("too few tasks in a week, the current partial week, or a rise: nothing", () => {
    expect(modelRegression([...week("m", "2026-11-09", 4, 4), ...week("m", "2026-11-16", 0, 4)], NOW)).toEqual([]);
    expect(modelRegression([...week("m", "2026-11-16", 10, 10), ...week("m", "2026-11-23", 0, 10)], NOW)).toEqual([]);
    expect(modelRegression([...week("m", "2026-11-09", 5, 10), ...week("m", "2026-11-16", 9, 10)], NOW)).toEqual([]);
    expect(modelRegression([{ model: "m", at: "x", verified: true }], NOW)).toEqual([]);
  });
});
