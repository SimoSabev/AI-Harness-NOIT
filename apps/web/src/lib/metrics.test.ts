import { describe, expect, it } from "vitest";
import { metricsOf } from "./metrics";
import type { MetricTask } from "./metrics";

// Round 2: the metrics page. What a person wants to know at a glance: how much got done, how much of it without them,
// what an accepted change cost, and how well the twin knows them. Pure: the page and the tests share it.
const NOW = "2026-11-16T12:00:00.000Z";
const daysAgo = (d: number) => new Date(Date.parse(NOW) - d * 86_400_000).toISOString();
const task = (o: Partial<MetricTask>): MetricTask => ({ id: "t_x", finished_at: daysAgo(1), outcome: "accepted", usd: 0.1, human: 0, by_twin: false, self_retries: 0, ...o });

describe("metricsOf", () => {
  it("counts the finished tasks of the window, the accepted ones and those that needed nobody", () => {
    const m = metricsOf([
      task({ id: "t_a", human: 0 }),
      task({ id: "t_b", human: 2 }),
      task({ id: "t_c", outcome: "rejected", human: 1 }),
      task({ id: "t_d", outcome: "failed" }),
      task({ id: "t_old", finished_at: daysAgo(40) }),
    ], { now: NOW, days: 30, twin: { scored: 0, correct: 0 } });
    expect(m.finished).toBe(4);
    expect(m.accepted).toBe(2);
    expect(m.withoutYou).toBe(1);
    expect(m.successRate).toBeCloseTo(0.5);
    expect(m.withoutYouRate).toBeCloseTo(0.5);
  });

  it("cost per accepted change counts what every task of the window cost, failed ones too", () => {
    const m = metricsOf([task({ usd: 0.3 }), task({ usd: 0.2, outcome: "failed" }), task({ usd: 0.1 })], { now: NOW, days: 30, twin: { scored: 0, correct: 0 } });
    expect(m.usd).toBeCloseTo(0.6);
    expect(m.usdPerAccepted).toBeCloseTo(0.3);
  });

  it("the twin's decisions and Mandat's own new attempts are counted; the twin's accuracy comes with its sample", () => {
    const m = metricsOf([task({ by_twin: true }), task({ self_retries: 2 }), task({ self_retries: 1, outcome: "failed" })], { now: NOW, days: 7, twin: { scored: 12, correct: 11 } });
    expect(m.byTwin).toBe(1);
    expect(m.selfRetries).toBe(3);
    expect(m.twin).toEqual({ scored: 12, correct: 11, rate: 11 / 12 });
  });

  it("nothing finished → no rates, no division by zero", () => {
    const m = metricsOf([], { now: NOW, days: 7, twin: { scored: 0, correct: 0 } });
    expect(m).toMatchObject({ finished: 0, accepted: 0, successRate: null, withoutYouRate: null, usdPerAccepted: null, twin: { rate: null } });
  });

  it("weeks: the last four weeks, oldest first, each with accepted and without-you counts", () => {
    const m = metricsOf([task({ finished_at: daysAgo(1) }), task({ finished_at: daysAgo(2), human: 1 }), task({ finished_at: daysAgo(9) }), task({ finished_at: daysAgo(25), outcome: "failed" })], { now: NOW, days: 30, twin: { scored: 0, correct: 0 } });
    expect(m.weeks).toHaveLength(4);
    expect(m.weeks.map((w) => w.accepted)).toEqual([0, 0, 1, 2]);
    expect(m.weeks.map((w) => w.withoutYou)).toEqual([0, 0, 1, 1]);
    expect(m.weeks[3]?.from).toBe(daysAgo(7).slice(0, 10));
  });

  it("an unreadable time never counts", () => {
    expect(metricsOf([task({ finished_at: "nope" })], { now: NOW, days: 30, twin: { scored: 0, correct: 0 } }).finished).toBe(0);
  });
});
