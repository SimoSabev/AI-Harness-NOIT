import { describe, expect, it } from "vitest";
import type { SelfFinishTick } from "@mandat/worker";
import { selfTicker } from "./commands/worker.js";

// D-521: the daytime „Сам довършва“ tick runs beside the night tick, at most every 30 s, and logs only the retries.
describe("self-finish ticker (D-521)", () => {
  it("throttles to every 30 s; logs what Mandat started alone; MANDAT_SELF_FINISH=0 turns it off", async () => {
    let t = 0;
    const calls: number[] = [];
    const logs: string[] = [];
    const results: SelfFinishTick[] = [{ retried: ["t_a"], waiting: ["t_b"] }, { retried: [], waiting: ["t_b"] }];
    const tick = selfTicker({ env: {}, now: () => t, log: (l) => logs.push(l), tick: () => { calls.push(t); return Promise.resolve(results[calls.length - 1] ?? { retried: [], waiting: [] }); } });
    await tick();
    t = 10_000;
    await tick();
    t = 30_000;
    await tick();
    expect(calls).toEqual([0, 30_000]);
    expect(logs).toEqual(["[self] new attempt by Mandat: t_a"]);
    const off: number[] = [];
    await selfTicker({ env: { MANDAT_SELF_FINISH: "0" }, now: () => 0, log: () => undefined, tick: () => { off.push(1); return Promise.resolve({ retried: [], waiting: [] }); } })();
    expect(off).toEqual([]);
  });
});
