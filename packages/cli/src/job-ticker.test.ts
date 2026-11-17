import { describe, expect, it } from "vitest";
import type { JobTick } from "@mandat/worker";
import { jobTicker } from "./commands/worker.js";

// D-535: the jobs tick in the background beside the others: never twice at once, at most every 5 s, MANDAT_JOBS=0 off.
const empty: JobTick = { planned: [], started: [], parked: [], sealed: [], merged: [] };
describe("job ticker (D-535)", () => {
  it("runs in the background, never twice at once, throttled; logs plans, parks, seals and merges", async () => {
    let t = 0;
    let release: (v: JobTick) => void = () => undefined;
    const logs: string[] = [];
    let calls = 0;
    const tick = jobTicker({ env: {}, now: () => t, log: (l) => logs.push(l), tick: () => { calls++; return new Promise<JobTick>((r) => { release = r; }); } });
    tick();
    t = 10_000;
    tick(); // still running
    expect(calls).toBe(1);
    release({ ...empty, planned: ["j_a"], sealed: ["j_b"] });
    await new Promise((r) => setTimeout(r, 0));
    expect(logs).toEqual(["[job] planned: j_a", "[job] sealed: j_b"]);
    tick();
    expect(calls).toBe(2);
    const off = jobTicker({ env: { MANDAT_JOBS: "0" }, now: () => 0, log: () => undefined, tick: () => { calls++; return Promise.resolve(empty); } });
    off();
    expect(calls).toBe(2);
  });
});
