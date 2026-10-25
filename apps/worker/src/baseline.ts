import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { packageManagerOf, repoConfigFromPolicy, ulid } from "@mandat/contract";
import type { MandatPolicy, ParsedReport } from "@mandat/contract";
import { flakyFrom } from "@mandat/core";
import type { Baseline } from "@mandat/onboard";
import { dockerText, imageTags, probeIpv6, realDockerRunner } from "@mandat/sandbox";
import type { DockerRunner } from "@mandat/sandbox";
import { hostConfig, infraUserFor, runTestProcedure } from "@mandat/verify";

// E7г (v5 т. 3.4 (1), D-314): the baseline of a newly connected repo = the tests of base run twice in the sandbox.
export interface BaselineRun { report: ParsedReport; ms: number; timedOut: boolean }

export function baselineFromRuns(runs: (BaselineRun | null)[]): Baseline {
  const [r1, r2] = runs;
  if (!r1 || !r1.report.valid || r1.timedOut) {
    return { status: "error", test_ids_count: 0, skipped: 0, duration_s: r1 ? Math.round(r1.ms / 1000) : 0, report_valid: false, flaky: [] };
  }
  const tests = r1.report.tests;
  const both = r2 && r2.report.valid && !r2.timedOut ? r2 : null;
  const second = both?.report.valid ? both.report.tests : null;
  const failed = [...tests.values()].includes("failed") || (second !== null && [...second.values()].includes("failed"));
  const ms = both ? (r1.ms + both.ms) / 2 : r1.ms;
  return {
    status: failed ? "failed" : "ok",
    test_ids_count: tests.size,
    skipped: [...tests.values()].filter((s) => s === "skipped").length,
    duration_s: Math.round(ms / 1000),
    report_valid: true,
    flaky: both ? flakyFrom(r1.report, both.report) : [],
  };
}

/** Two runs of runTestProcedure on the base tree (each its own run id, volume and gate). Docker is required. */
export async function runBaseline(treeDir: string, policy: MandatPolicy, o: { mandatHome: string; repoRoot: string; env?: Record<string, string | undefined>; docker?: DockerRunner }): Promise<Baseline> {
  const rc = repoConfigFromPolicy(policy);
  if (!rc.ok) return { status: "error", test_ids_count: 0, skipped: 0, duration_s: 0, report_valid: false, flaky: [] };
  const docker = o.docker ?? realDockerRunner();
  const host = hostConfig(o.env ?? process.env);
  const images = await imageTags(o.repoRoot);
  const { user } = await infraUserFor(docker).catch(() => ({ user: "1000:1000" }));
  const ipv6Sysctl = await probeIpv6(docker, images.sandbox);
  const runs: (BaselineRun | null)[] = [];
  for (let k = 0; k < 2; k++) {
    const runId = `r_${ulid()}`;
    const runDir = path.join(o.mandatHome, "runs", `baseline-${runId}`);
    mkdirSync(runDir, { recursive: true });
    const t0 = Date.now();
    try {
      const r = await runTestProcedure({
        docker, runId, runDir, mandatHome: o.mandatHome, home: os.homedir(), tree: "base", treeDir, testsCommand: rc.config.tests.command, testsEnv: rc.config.tests.env,
        images, timeoutMs: 600_000, packageManager: packageManagerOf(rc.config), infraUser: user, ipv6Sysctl, ...(host.extraCa ? { extraCa: host.extraCa } : {}),
      });
      runs.push(r.ok ? { report: r.report, ms: Date.now() - t0, timedOut: r.timedOut } : null);
    } finally {
      const ps = await dockerText(docker, ["ps", "-aq", "--filter", `label=mandat.run=${runId}`]);
      for (const c of ps.stdout.split("\n").filter(Boolean)) await dockerText(docker, ["rm", "-f", c]);
      await dockerText(docker, ["volume", "rm", "-f", `mandat-vol-${runId}-base`]);
    }
  }
  return baselineFromRuns(runs);
}
