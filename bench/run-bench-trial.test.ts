import { describe, expect, it } from "vitest";
import { ProfileLayers, demoProfileLayers } from "@mandat/contract";
import { runBench } from "./run-bench.js";
import { HELDOUT, SCENARIOS } from "./scenarios.js";

// D-530 (round 2): the bench as the regression gate of a profile trial. The same scenarios run with the profile under
// trial (every scenario, the checks ones keep the shop's own lint and typecheck) and only those of the task type's
// contract: "free" runs the free-contract scenarios, any other type the bugfix ones.
type Call = { contractPath: string; agent: string; profile?: { layers: { b: { boundaries: string[]; commands: Record<string, string> } } } };
const fakeRun = (calls: Call[]) => (o: Call) => {
  calls.push(o);
  const s = SCENARIOS.find((x) => `fake:${x.fake}` === o.agent);
  return Promise.resolve({ verdict: { result: s?.expected ?? "FAILED", reasons: s?.reasons ?? [] }, agentExit: 0, error: null });
};

/** the held-out fakes repeat across rows; the hidden/checks flags tell them apart */
const fakeHeld = (calls: Call[]) => (o: Call & { hidden?: unknown }) => {
  calls.push(o);
  const s = HELDOUT.find((x) => `fake:${x.fake}` === o.agent && Boolean(x.hidden) === Boolean(o.hidden) && Boolean(x.checks) === Boolean(o.profile?.layers.b.commands.lint) && (x.contract === "free") === (o.contractPath === "/free.json"));
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

describe("the held-out heavy set (D-550)", () => {
  it("is not in the visible bench; set heldout runs only it, every check on at once, both contracts", async () => {
    const calls: Call[] = [];
    await runBench({ home: "/h", contractPath: "/bugfix.json", freeContractPath: "/free.json", run: fakeRun(calls) as never });
    expect(calls).toHaveLength(SCENARIOS.length);
    const held: Call[] = [];
    const r = await runBench({ home: "/h", contractPath: "/bugfix.json", freeContractPath: "/free.json", set: "heldout", run: fakeHeld(held) as never });
    expect(r.rows.map((x) => x.id)).toEqual(HELDOUT.map((s) => s.id));
    expect(HELDOUT.every((s) => s.hidden || s.checks)).toBe(true);
    expect(new Set(HELDOUT.map((s) => s.contract ?? "default"))).toEqual(new Set(["default", "free"]));
    expect(HELDOUT.some((s) => SCENARIOS.some((v) => v.id === s.id))).toBe(false);
    expect(r.pass).toBe(HELDOUT.length);
  });
  it("kind filters the held-out set like the visible one", async () => {
    const r = await runBench({ home: "/h", contractPath: "/bugfix.json", freeContractPath: "/free.json", set: "heldout", kind: "free", run: fakeHeld([]) as never });
    expect(r.rows.map((x) => x.id)).toEqual(HELDOUT.filter((s) => s.contract === "free").map((s) => s.id));
  });
});
