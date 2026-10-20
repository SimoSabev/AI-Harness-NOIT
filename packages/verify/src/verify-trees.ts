import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { hashJcs, parseVitestReport } from "@mandat/contract";
import type { ChangedFile, ErrorCode, Evidence, ParsedReport, RepoConfig } from "@mandat/contract";
import { anyMatch, d1, d10Lockfile, d2, d3, d3CoveredPaths, d4, declaredTestCount, ev, mustPass, na, weakenedAssertions } from "@mandat/core";
import type { CoreSecurityHint } from "@mandat/core";
import { cleanClone, readLockfile, removeTree } from "@mandat/export";
import type { DockerRunner } from "@mandat/sandbox";
import type { startRunGate } from "./gate.js";
import { runTestProcedure } from "./test-procedure.js";
import type { TestProcedureResult } from "./test-procedure.js";
import { buildVerifyTree, listFiles, snapshot } from "./trees.js";

// E0 т. 7.8 (moved from apps/worker/src/run.ts, D-205): baseline (cached) → trees H, A, B → D10, D3, D4, D1, D2, MUST_PASS.

export class VerifyInfraError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}
const infra = (code: ErrorCode, message: string): never => {
  throw new VerifyInfraError(code, message);
};

export interface VerifyTreesInput {
  docker: DockerRunner;
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
  /** clean clone of base (E0 provision); the caller removes it */
  baseDir: string;
  diffPatch: Buffer;
  files: ChangedFile[];
  rc: RepoConfig;
  allowedPaths: string[];
  mayChangeTests: boolean;
  mustPass: string[];
  external: boolean;
  tmpRoot: string;
  startGate?: typeof startRunGate;
  runTests?: typeof runTestProcedure;
  /** reports a/b are written by the caller (it knows what to redact) */
  onReports?: (a: { raw: string | null; exit: number | null }, b: { raw: string | null; exit: number | null }) => void | Promise<void>;
  onSecurity?: (h: CoreSecurityHint) => void;
  onGateLog?: (tree: "base" | "a" | "b", file: string) => void;
  progress?: (line: string) => void;
}

export interface VerifyTreesResult {
  evidence: Evidence[];
  cachedBaseline: boolean;
}

/** Test files changed in the diff (by the repo test globs), for the AST check. */
function changedTestFiles(files: ChangedFile[], rc: RepoConfig): string[] {
  return files.filter((f) => f.status !== "D" && !f.binary && anyMatch(rc.tests.test_globs, f.path) && /\.[cm]?[jt]sx?$/.test(f.path)).map((f) => f.path);
}

export async function verifyTrees(i: VerifyTreesInput): Promise<VerifyTreesResult> {
  const rc = i.rc;
  const evidence: Evidence[] = [];
  const runTests = i.runTests ?? runTestProcedure;
  const testsInput = (tree: "base" | "a" | "b", treeDir: string) => ({
    docker: i.docker, runId: i.runId, runDir: i.runDir, mandatHome: i.mandatHome, home: i.home, tree, treeDir, testsCommand: rc.tests.command,
    testsEnv: rc.tests.env, images: i.images, timeoutMs: 600_000, infraUser: i.infraUser, ipv6Sysctl: i.ipv6Sysctl, ...(i.extraCa ? { extraCa: i.extraCa } : {}),
    ...(i.startGate ? { startGate: i.startGate } : {}),
  });
  // 1) baseline (cache D-018, D-097)
  const cacheFile = path.join(i.mandatHome, "cache", "baseline", `${i.baseSha}-${hashJcs(rc.tests).slice("sha256:".length)}.json`);
  let baseline: ParsedReport | null = null;
  if (existsSync(cacheFile)) {
    const p = parseVitestReport(readFileSync(cacheFile, "utf8"), "/m/work");
    if (p.valid) baseline = p;
    else rmSync(cacheFile, { force: true });
  }
  const cachedBaseline = baseline !== null;
  if (baseline === null) {
    const b = await runTests(testsInput("base", i.baseDir));
    i.onGateLog?.("base", path.join(i.runDir, "gate", "base", "log", "events.jsonl"));
    if (!b.ok) infra(b.code, `baseline: ${b.code}`);
    const okB = b as Extract<TestProcedureResult, { ok: true }>;
    if (!okB.report.valid || okB.raw === null) infra("E_BASELINE_INVALID", "baseline report invalid");
    baseline = okB.report;
    mkdirSync(path.dirname(cacheFile), { recursive: true });
    writeFileSync(cacheFile, okB.raw as string);
  }
  const bl = baseline as ParsedReport;
  // 2) trees H, A, B
  const head = await cleanClone({ mirrorPath: i.mirrorPath, baseSha: i.baseSha, tmpRoot: i.tmpRoot, name: "h" });
  if (i.diffPatch.length > 0) {
    const ap = await head.git.run(["apply", "--index", "--binary", "--whitespace=nowarn", "-"], { cwd: head.dir, input: i.diffPatch });
    if (ap.code !== 0) infra("E_DOCKER", "cannot materialize head");
  }
  const baseSnap = snapshot(i.baseDir);
  const headSnap = snapshot(head.dir);
  const D3 = d3({ files: i.files, base: baseSnap, head: headSnap, rc });
  for (const h of D3.security) i.onSecurity?.(h);
  const D4 = d4({ files: i.files, allowedPaths: i.allowedPaths, coveredByD3: d3CoveredPaths(i.files, rc, baseSnap, headSnap) });
  const D10 = d10Lockfile({ baseLock: readLockfile(i.baseDir), headLock: readLockfile(head.dir) });
  evidence.push(D10.evidence, D3.evidence, D4.evidence);
  if (D10.evidence.status === "fail") {
    evidence.push(na("D1.base_tests", "lockfile rejected"), na("D2.inventory", "lockfile rejected"), na("MUST_PASS", "lockfile rejected"));
    removeTree(head.dir);
    return { evidence, cachedBaseline };
  }
  // AST inputs for D2 (D-233, S31), from the head tree before it is removed
  const wa = weakenedAssertions(
    changedTestFiles(i.files, rc).flatMap((p) => {
      const b = baseSnap.get(p);
      const h = headSnap.get(p);
      return b && h ? [{ path: p, base: b.toString("utf8"), head: h.toString("utf8") }] : [];
    }),
  );
  let declared: number | null = 0;
  for (const p of listFiles(head.dir).filter((f) => anyMatch(rc.tests.test_globs, f) && /\.(spec|test)\.[cm]?[jt]sx?$/.test(f))) {
    const n = declaredTestCount(readFileSync(path.join(head.dir, p), "utf8"), p);
    declared = n === null || declared === null ? null : declared + n;
  }
  const aDir = path.join(i.tmpRoot, "tree-a");
  const bDir = path.join(i.tmpRoot, "tree-b");
  buildVerifyTree({ baseDir: i.baseDir, headDir: head.dir, outDir: aDir, rc, kind: "a" });
  buildVerifyTree({ baseDir: i.baseDir, headDir: head.dir, outDir: bDir, rc, kind: "b" });
  removeTree(head.dir);
  const A = await runTests(testsInput("a", aDir));
  i.onGateLog?.("a", path.join(i.runDir, "gate", "a", "log", "events.jsonl"));
  if (!A.ok) infra(A.code === "E_INSTALL_BASE" ? "E_INSTALL_TREE" : A.code, `tree A: ${A.code}`);
  const B = await runTests(testsInput("b", bDir));
  i.onGateLog?.("b", path.join(i.runDir, "gate", "b", "log", "events.jsonl"));
  if (!B.ok) infra(B.code === "E_INSTALL_BASE" ? "E_INSTALL_TREE" : B.code, `tree B: ${B.code}`);
  const a = A as Extract<TestProcedureResult, { ok: true }>;
  const b = B as Extract<TestProcedureResult, { ok: true }>;
  await i.onReports?.({ raw: a.raw, exit: a.exit }, { raw: b.raw, exit: b.exit });
  evidence.push(a.timedOut ? ev("D1.base_tests", "unknown", "tests timed out", {}, { cls: "timeout", id: "-" }) : d1(bl, a.report).evidence);
  evidence.push(
    b.timedOut
      ? ev("D2.inventory", "unknown", "tests timed out", {}, { cls: "timeout", id: "-" })
      : d2({
          baseline: bl, b: b.report, exitB: b.exit ?? 1, diffPatch: i.diffPatch.toString("utf8"), mayChangeTests: i.mayChangeTests,
          a: a.report, weakenedAssertions: wa, declaredTests: declared, external: i.external,
        }).evidence,
  );
  evidence.push(i.mustPass.length === 0 && i.external ? na("MUST_PASS", "no contract") : mustPass({ ids: i.mustPass, a: a.report, b: b.report }).evidence);
  const cnt = (r: ParsedReport) => (r.valid ? `${[...r.tests.values()].filter((s) => s === "passed").length}/${r.total} passed` : `invalid (${r.error})`);
  i.progress?.(`[verify]    baseline${cachedBaseline ? " (cached)" : ""} · A ${cnt(a.report)} · B ${cnt(b.report)}`);
  return { evidence, cachedBaseline };
}
