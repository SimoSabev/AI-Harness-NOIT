import { describe, expect, it } from "vitest";
import type { TwinTick } from "@mandat/worker";
import { twinTicker } from "./commands/worker.js";

// D-523: the twin's tick runs beside the self-finish tick, at most every 30 s; it logs what the twin approved and a
// class offer only the first time it appears; MANDAT_TWIN=0 turns it off.
describe("twin ticker (D-523)", () => {
  it("throttles, logs decisions and new offers once, and turns off", async () => {
    let t = 0;
    const logs: string[] = [];
    const results: TwinTick[] = [
      { predicted: ["t_a"], decided: ["t_b"], offers: ["k1"] },
      { predicted: [], decided: [], offers: ["k1"] },
    ];
    let i = 0;
    const tick = twinTicker({ env: {}, now: () => t, log: (l) => logs.push(l), tick: () => Promise.resolve(results[i++] ?? { predicted: [], decided: [], offers: [] }) });
    await tick();
    t = 10_000;
    await tick();
    t = 30_000;
    await tick();
    expect(i).toBe(2);
    expect(logs).toEqual(["[twin] approved alone: t_b", "[twin] ready to offer: k1"]);
    let off = 0;
    await twinTicker({ env: { MANDAT_TWIN: "0" }, now: () => 0, log: () => undefined, tick: () => { off++; return Promise.resolve({ predicted: [], decided: [], offers: [] }); } })();
    expect(off).toBe(0);
  });
});
