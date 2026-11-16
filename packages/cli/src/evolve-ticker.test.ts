import { describe, expect, it } from "vitest";
import type { EvolveTick } from "@mandat/worker";
import { evolveTicker } from "./commands/worker.js";

// D-530: profile evolution runs beside the worker's other ticks but never blocks them (a bench takes minutes): the tick
// starts in the background, never twice at once, at most every 30 min; after an error it waits 6 hours; MANDAT_EVOLVE=0
// turns it off.
const empty: EvolveTick = { proposed: [], accepted: [], refused: [], rolledBack: [] };

describe("evolve ticker (D-530)", () => {
  it("runs in the background, never overlapping, logs what changed, and waits after an error", async () => {
    let t = 0;
    const logs: string[] = [];
    let release!: () => void;
    let calls = 0;
    const tick = evolveTicker({
      env: {}, now: () => t, log: (l) => logs.push(l),
      tick: () => {
        calls++;
        if (calls === 1) return new Promise<EvolveTick>((r) => (release = () => r({ ...empty, proposed: ["a"], accepted: ["a"] })));
        if (calls === 2) return Promise.reject(new Error("docker down"));
        return Promise.resolve(empty);
      },
    });
    tick();
    t = 31 * 60_000;
    tick(); // the first is still running
    expect(calls).toBe(1);
    release();
    await new Promise((r) => setTimeout(r, 0));
    expect(logs).toEqual(["[evolve] proposed: a", "[evolve] accepted: a"]);
    t = 62 * 60_000;
    tick();
    await new Promise((r) => setTimeout(r, 0));
    expect(logs.at(-1)).toContain("docker down");
    t = 62 * 60_000 + 5 * 3600_000;
    tick(); // within 6 h of the error
    expect(calls).toBe(2);
    t = 62 * 60_000 + 6 * 3600_000 + 1;
    tick();
    expect(calls).toBe(3);
    let off = 0;
    evolveTicker({ env: { MANDAT_EVOLVE: "0" }, now: () => 0, log: () => undefined, tick: () => { off++; return Promise.resolve(empty); } })();
    expect(off).toBe(0);
  });
});
