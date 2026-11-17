import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { packageManagerOf } from "@mandat/contract";
import type { OracleProblem, RepoConfig } from "@mandat/contract";
import { oracleChange, splitHidden } from "@mandat/core";
import type { HiddenResult } from "@mandat/core";
import { cleanClone, removeTree } from "@mandat/export";
import type { DockerRunner } from "@mandat/sandbox";
import type { startRunGate } from "./gate.js";
import { runTestProcedure } from "./test-procedure.js";
import type { HiddenTests } from "./verify-trees.js";

// D-534 (М1 Х3): the oracle's tests against the current base, in a fresh volume of their own run (the same machinery as
// tree B: own gate for the install, tests with --network none). The base is a clean clone of the mirror; the tests are
// written under their directory, exactly where D5 puts them for the writer's tree B. Nothing reaches the mirror.

export interface OracleBaseInput {
  docker: DockerRunner;
  /** a run id of its own: its volume and gate are new, never the oracle agent's */
  runId: string;
  runDir: string;
  mandatHome: string;
  home: string;
  images: { sandbox: string; gate: string; proxy: string };
  infraUser: string;
  extraCa?: string;
  ipv6Sysctl: boolean;
  mirrorPath: string;
  baseSha: string;
  rc: RepoConfig;
  tests: HiddenTests;
  tmpRoot: string;
  startGate?: typeof startRunGate;
  runTests?: typeof runTestProcedure;
}
export type OracleBaseResult = { ok: true; results: HiddenResult[]; timedOut: boolean } | { ok: false; code: string };

export async function runOracleOnBase(i: OracleBaseInput): Promise<OracleBaseResult> {
  const base = await cleanClone({ mirrorPath: i.mirrorPath, baseSha: i.baseSha, tmpRoot: i.tmpRoot, name: "oracle-base" });
  try {
    for (const f of i.tests.files) {
      const rel = path.posix.normalize(`${i.tests.dir}/${f.path}`);
      if (rel.startsWith("..") || path.posix.isAbsolute(rel) || !rel.startsWith(`${i.tests.dir.replace(/\/+$/, "")}/`)) return { ok: false, code: "E_ORACLE_PATH" };
      mkdirSync(path.dirname(path.join(base.dir, rel)), { recursive: true });
      writeFileSync(path.join(base.dir, rel), f.data);
    }
    const r = await (i.runTests ?? runTestProcedure)({
      docker: i.docker, runId: i.runId, runDir: i.runDir, mandatHome: i.mandatHome, home: i.home, tree: "b", treeDir: base.dir, testsCommand: i.rc.tests.command,
      testsEnv: i.rc.tests.env, images: i.images, timeoutMs: 600_000, packageManager: packageManagerOf(i.rc), infraUser: i.infraUser, ipv6Sysctl: i.ipv6Sysctl,
      ...(i.extraCa ? { extraCa: i.extraCa } : {}), ...(i.startGate ? { startGate: i.startGate } : {}),
    });
    if (!r.ok) return { ok: false, code: r.code };
    return { ok: true, results: r.report.valid ? splitHidden(r.report, i.tests.dir).hidden : [], timedOut: r.timedOut };
  } finally {
    removeTree(base.dir);
  }
}

export type OracleChangeResult =
  | { ok: true; tests: { path: string; data: Buffer }[]; problems: OracleProblem[]; base: { results: HiddenResult[]; timedOut: boolean } | null }
  | { ok: false; code: string };

/**
 * D-534: the oracle agent's exported change → its test files (relative to `dir`) and, when the change is tests only,
 * their results on the base. A change that touches anything else is not run at all (the problems say why).
 */
export async function oracleFromChange(i: Omit<OracleBaseInput, "tests"> & { diffPatch: Buffer; dir: string }): Promise<OracleChangeResult> {
  const head = await cleanClone({ mirrorPath: i.mirrorPath, baseSha: i.baseSha, tmpRoot: i.tmpRoot, name: "oracle-head" });
  let tests: { path: string; data: Buffer }[];
  let problems: OracleProblem[];
  try {
    if (i.diffPatch.length > 0) {
      const ap = await head.git.run(["apply", "--index", "--binary", "--whitespace=nowarn", "-"], { cwd: head.dir, input: i.diffPatch });
      if (ap.code !== 0) return { ok: false, code: "E_ORACLE_APPLY" };
    }
    const names = await head.git.run(["diff", "--cached", "--name-only", "-z", "--no-renames"], { cwd: head.dir });
    const paths = names.stdout.toString("utf8").split("\0").filter(Boolean);
    const c = oracleChange({ paths, dir: i.dir });
    problems = c.problems;
    const prefix = `${i.dir.replace(/\/+$/, "")}/`;
    tests = c.tests.flatMap((p) => {
      try {
        return [{ path: p, data: readFileSync(path.join(head.dir, prefix + p)) }];
      } catch {
        return []; // a deleted file is not a test
      }
    });
  } finally {
    removeTree(head.dir);
  }
  if (problems.length > 0 || tests.length === 0) return { ok: true, tests, problems, base: null };
  const r = await runOracleOnBase({ ...i, tests: { dir: i.dir, files: tests } });
  if (!r.ok) return r;
  return { ok: true, tests, problems, base: { results: r.results, timedOut: r.timedOut } };
}
