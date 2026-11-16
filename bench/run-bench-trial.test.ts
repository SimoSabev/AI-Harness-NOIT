import { describe, expect, it } from "vitest";
import { ProfileLayers, demoProfileLayers } from "@mandat/contract";
import { runBench } from "./run-bench.js";
import { SCENARIOS } from "./scenarios.js";

// D-530 (round 2): the bench as the regression gate of a profile trial. The same scenarios run with the profile under
// trial (every scenario, the checks ones keep the shop's own lint and typecheck) and only those of the task type's
// contract: "free" runs the free-contract scenarios, any other type the bugfix ones.
type Call = { contractPath: string; agent: string; profile?: { layers: { b: { boundaries: string[]; commands: Record<string, string> } } } };
const fakeRun = (calls: Call[]) => (o: Call) => {
  calls.push(o);
  const s = SCENARIOS.find((x) => `fake:${x.fake}` === o.agent);
  return Promise.resolve({ verdict: { result: s?.expected ?? "FAILED", reasons: s?.reasons ?? [] }, agentExit: 0, error: null });
};

describe("runBench for a profile trial (D-530)", () => {
  const layers = ProfileLayers.parse(demoProfileLayers());
  const trial = { ...layers, b: { ...layers.b, boundaries: [...layers.b.boundaries, "marker boundary"] } };

  it("free → only the free-contract scenarios, each with the profile under trial", async () => {
    const calls: Call[] = [];
    const r = await runBench({ home: "/h", contractPath: "/bugfix.json", freeContractPath: "/free.json", layers: trial, kind: "free", run: fakeRun(calls) as never });
    const free = SCENARIOS.filter((s) => s.contract === "free");
    expect(calls.map((c) => c.contractPath)).toEqual(free.map(() => "/free.json"));
    expect(calls.every((c) => c.profile?.layers.b.boundaries.includes("marker boundary"))).toBe(true);
    expect(r.rows).toHaveLength(free.length);
  });

  it("another type → the bugfix scenarios; a checks scenario keeps the shop's lint and typecheck on top of the trial", async () => {
    const calls: Call[] = [];
    await runBench({ home: "/h", contractPath: "/bugfix.json", freeContractPath: "/free.json", layers: trial, kind: "default", run: fakeRun(calls) as never });
    expect(calls.every((c) => c.contractPath === "/bugfix.json")).toBe(true);
    expect(calls).toHaveLength(SCENARIOS.filter((s) => s.contract !== "free").length);
    const checks = SCENARIOS.filter((s) => s.contract !== "free" && s.checks).map((s) => `fake:${s.fake}`);
    for (const c of calls.filter((x) => checks.includes(x.agent))) {
      expect(c.profile?.layers.b.boundaries).toContain("marker boundary");
      expect(c.profile?.layers.b.commands.lint).toBeTruthy();
    }
  });
});
