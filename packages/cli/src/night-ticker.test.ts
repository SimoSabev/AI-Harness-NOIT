import { describe, expect, it } from "vitest";
import type { NightTick } from "@mandat/worker";
import { nightTicker } from "./commands/worker.js";

// E9а (v5 5.1): the night shift ticks in the worker's effects loop, at most every 30 s, and says what changed.
describe("night ticker (E9а)", () => {
  it("throttles to every 30 s; logs started, parked and done; a quiet tick logs nothing", async () => {
    let t = 0;
    const calls: number[] = [];
    const logs: string[] = [];
    const results: NightTick[] = [
      { started: ["s1"], parked: [], done: [] },
      { started: [], parked: ["t_night_1", "t_night_2"], done: ["s1"] },
      { started: [], parked: [], done: [] },
    ];
    const tick = nightTicker({ now: () => t, log: (l) => logs.push(l), tick: () => { calls.push(t); return Promise.resolve(results[calls.length - 1] ?? { started: [], parked: [], done: [] }); } });
    await tick();
    t = 10_000;
    await tick();
    t = 30_000;
    await tick();
    t = 61_000;
    await tick();
    expect(calls).toEqual([0, 30_000, 61_000]);
    expect(logs).toEqual(["[night] shift s1 started", "[night] parked: t_night_1, t_night_2", "[night] shift s1 done"]);
  });
});
