import { describe, expect, it } from "vitest";
import { SystemJobs } from "./commands/system-jobs.js";
import type { JobRun } from "./commands/system-jobs.js";

// D-370: the CLI commands from the web — fixed argv, one run per kind, the tail of the output and the parsed --json.
function fakeRunner() {
  const runs: { argv: readonly string[]; out: (s: string) => void; err: (s: string) => void; exit: (code: number) => void }[] = [];
  const run: JobRun = (argv, o) => {
    runs.push({ argv, out: o.stdout, err: o.stderr, exit: o.exit });
  };
  return { run, runs };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const ORG = "d0000000-0000-4000-8000-0000000000a0";

describe("SystemJobs (D-370)", () => {
  it("doctor: running → ok with the parsed JSON and the lines; the same job twice while running → the running one", async () => {
    const f = fakeRunner();
    const j = new SystemJobs({ run: f.run, org: ORG, now: () => new Date("2026-10-23T20:00:00.000Z") });
    expect(j.state("doctor")).toMatchObject({ job: "doctor", state: "idle", lines: [], result: null });
    expect(j.start("doctor")).toMatchObject({ state: "running", started_at: "2026-10-23T20:00:00.000Z" });
    expect(j.start("doctor").state).toBe("running");
    expect(f.runs.map((r) => r.argv)).toEqual([["doctor", "--json"]]);
    f.runs[0]?.err("checking…\n");
    f.runs[0]?.out('{"checks":[{"name":"node","ok":true,"detail":"24.22.0"}],"exit":0}\n');
    f.runs[0]?.exit(0);
    await tick();
    expect(j.state("doctor")).toMatchObject({ state: "ok", exit: 0, finished_at: "2026-10-23T20:00:00.000Z", result: { checks: [{ name: "node", ok: true, detail: "24.22.0" }], exit: 0 } });
    expect(j.state("doctor").lines).toEqual(["checking…"]); // the JSON is the result, not a line
  });
  it("doctor with a failed check exits 3 but its report is still the result (state failed)", async () => {
    const f = fakeRunner();
    const j = new SystemJobs({ run: f.run, org: ORG });
    j.start("doctor");
    f.runs[0]?.out('{"checks":[{"name":"images","ok":false,"detail":"missing"}],"exit":3}\n');
    f.runs[0]?.exit(3);
    await tick();
    expect(j.state("doctor")).toMatchObject({ state: "failed", exit: 3, result: { exit: 3 } });
  });
  it("fixtures: the steps run one after another; a failing step stops the rest", async () => {
    const f = fakeRunner();
    const j = new SystemJobs({ run: f.run, org: ORG });
    j.start("fixtures");
    f.runs[0]?.out("base_commit abc (unchanged)\n");
    f.runs[0]?.exit(0);
    await tick();
    expect(f.runs.map((r) => r.argv)).toEqual([["fixtures", "build"], ["fixtures", "build", "--name", "demo-shop"]]);
    expect(j.state("fixtures").state).toBe("running");
    f.runs[1]?.exit(3);
    await tick();
    expect(j.state("fixtures")).toMatchObject({ state: "failed", exit: 3, result: null });
    const g = fakeRunner();
    const k = new SystemJobs({ run: g.run, org: ORG });
    k.start("fixtures");
    g.runs[0]?.exit(3);
    await tick();
    expect(g.runs).toHaveLength(1);
  });
  it("verify-log gets the local org; only the last 200 lines are kept; images can run next to doctor", async () => {
    const f = fakeRunner();
    const j = new SystemJobs({ run: f.run, org: ORG });
    j.start("verify-log");
    expect(f.runs[0]?.argv).toEqual(["verify-log", "--org", ORG, "--json"]);
    j.start("images");
    for (let i = 0; i < 250; i++) f.runs[1]?.err(`#${i} step\r`);
    expect(j.state("images").lines).toHaveLength(200);
    expect(j.state("images").lines.at(-1)).toBe("#249 step");
    expect(j.all().map((s) => [s.job, s.state])).toEqual([["doctor", "idle"], ["images", "running"], ["images-ui", "idle"], ["fixtures", "idle"], ["fixtures-force", "idle"], ["stats", "idle"], ["verify-log", "running"]]);
  });
  it("a process that cannot start → failed, exit null", async () => {
    const j = new SystemJobs({ run: () => { throw new Error("spawn ENOENT"); }, org: ORG });
    expect(j.start("stats")).toMatchObject({ state: "failed", exit: null });
  });
});
