import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import type { D8Dependency } from "@mandat/core";
import path from "node:path";
import { hashJcs, packageManagerOf, parseVitestReport } from "@mandat/contract";
import type { ChangedFile, ErrorCode, Evidence, ParsedReport, RepoConfig } from "@mandat/contract";
import { addedDependencies, addedLines, anyMatch, applySite, d1, d10Lockfile, d12Ui, d5Hidden, d8Static, splitHidden, d11Mutation, d2, d3, d3CoveredPaths, d4, declaredTestCount, ev, mustPass, mutationSites, na, specialCases, testEnvChecks, weakenedAssertions } from "@mandat/core";
import type { MutationSite } from "@mandat/core";
import type { CoreSecurityHint } from "@mandat/core";
import { cleanClone, readLockfile, removeTree } from "@mandat/export";
import type { DockerRunner } from "@mandat/sandbox";
import type { startRunGate } from "./gate.js";
import { runTestProcedure } from "./test-procedure.js";
import type { CheckResult, TestProcedureResult } from "./test-procedure.js";
import { registryFacts } from "./registry-facts.js";
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

export interface UiCheck { paths: string[]; devCommand: string | null; image: string | null; routes: string[] }
export interface HiddenTests { dir: string; files: { path: string; data: Buffer }[] }

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
  /** v5 E9б (D5): a person's hidden tests, copied into tree B only (never into the agent's tree) */
  hidden?: HiddenTests | null;
  /** v5 E9б (D8): the project's lint and typecheck commands (from the profile or the caller) */
  checks?: { name: "lint" | "typecheck"; command: string }[];
  /** v5 E9б (D12, D-364): when the change touches `paths`, tree B's app (the dev command) is opened in a browser */
  ui?: UiCheck;
  allowedPaths: string[];
  mayChangeTests: boolean;
  mustPass: string[];
  external: boolean;
  tmpRoot: string;
  startGate?: typeof startRunGate;
  runTests?: typeof runTestProcedure;
  /** v5 E9б (D8): license and age of new dependencies (default: the npm registry from the host) */
  depFacts?: (deps: { name: string; spec: string }[]) => Promise<D8Dependency[]>;
  /** reports a/b are written by the caller (it knows what to redact) */
  onReports?: (a: { raw: string | null; exit: number | null }, b: { raw: string | null; exit: number | null }) => void | Promise<void>;
  onSecurity?: (h: CoreSecurityHint) => void;
  onGateLog?: (tree: "base" | "a" | "b", file: string) => void;
  progress?: (line: string) => void;
  /** D-300: at most this many mutants of the changed source lines (0 = off); default MAX_MUTANTS */
  maxMutants?: number;
}

/** D-300: each mutant reruns the tests on the installed tree B (no new install); 3 keeps a task within minutes. */
export const MAX_MUTANTS = 3;

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
    testsEnv: rc.tests.env, images: i.images, timeoutMs: 600_000, packageManager: packageManagerOf(rc), infraUser: i.infraUser, ipv6Sysctl: i.ipv6Sysctl, ...(i.extraCa ? { extraCa: i.extraCa } : {}),
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
  // D8: the checks on base (cached per base and commands; a cached baseline without them runs base for the checks only)
  const checks = i.checks ?? [];
  let baseChecks: CheckResult[] = [];
  if (checks.length > 0) {
    const checksFile = path.join(i.mandatHome, "cache", "checks", `${i.baseSha}-${hashJcs(checks).slice("sha256:".length)}.json`);
    if (existsSync(checksFile)) baseChecks = JSON.parse(readFileSync(checksFile, "utf8")) as CheckResult[];
    else {
      const bc = await runTests({ ...testsInput("base", i.baseDir), testsCommand: "true", checks });
      if (!bc.ok) infra(bc.code, `base checks: ${bc.code}`);
      baseChecks = (bc as Extract<TestProcedureResult, { ok: true }>).checks ?? [];
      mkdirSync(path.dirname(checksFile), { recursive: true });
      writeFileSync(checksFile, JSON.stringify(baseChecks));
    }
  }
  // D12: only a change that touches a UI path; without a dev command or the browser image the check cannot run (unknown)
  const uiTouched = i.ui !== undefined && i.ui.paths.length > 0 && i.files.some((f) => anyMatch(i.ui?.paths ?? [], f.path));
  const uiCheck = uiTouched && i.ui?.devCommand && i.ui.image ? { image: i.ui.image, devCommand: i.ui.devCommand, routes: i.ui.routes } : null;
  // D-364: the base screenshots for the visual diff, once per base commit and UI settings (a base that does not come up → none)
  const baseShots: Record<string, Buffer> = {};
  if (uiCheck) {
    const dir = path.join(i.mandatHome, "cache", "ui", `${i.baseSha}-${hashJcs(uiCheck).slice("sha256:".length, "sha256:".length + 16)}`);
    if (!existsSync(path.join(dir, "done"))) {
      const bu = await runTests({ ...testsInput("base", i.baseDir), testsCommand: "true", ui: uiCheck });
      if (!bu.ok) infra(bu.code, `base UI: ${bu.code}`);
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      const r = (bu as Extract<TestProcedureResult, { ok: true }>).ui;
      if (r?.up) for (const [n, data] of Object.entries(r.shots)) writeFileSync(path.join(dir, n), data);
      writeFileSync(path.join(dir, "done"), "");
    }
    for (const n of readdirSync(dir)) if (/^route-[0-4]\.png$/.test(n)) baseShots[n] = readFileSync(path.join(dir, n));
  }
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
  const pm = packageManagerOf(rc);
  const pj = (d: string, p = "package.json") => (existsSync(path.join(d, p)) ? readFileSync(path.join(d, p)) : null);
  // E8и: every other package.json the change touches (workspace packages) is checked like the root one
  const manifests = [...new Set(i.files.flatMap((f) => [f.path, f.old_path ?? f.path]))]
    .filter((p) => p !== "package.json" && /(^|\/)package\.json$/.test(p) && !p.split("/").includes("node_modules"))
    .map((p) => ({ path: p, base: pj(i.baseDir, p), head: pj(head.dir, p) }));
  const D10 = d10Lockfile({ baseLock: readLockfile(i.baseDir, pm), headLock: readLockfile(head.dir, pm), pm, basePkg: pj(i.baseDir), headPkg: pj(head.dir), manifests });
  evidence.push(D10.evidence, D3.evidence, D4.evidence);
  if (D10.evidence.status === "fail") {
    evidence.push(na("D1.base_tests", "lockfile rejected"), na("D2.inventory", "lockfile rejected"), na("MUST_PASS", "lockfile rejected"));
    removeTree(head.dir);
    return { evidence, cachedBaseline };
  }
  // D8: the license and age of what the change adds (the lockfile already passed D10)
  const newDeps = addedDependencies([{ path: "package.json", base: pj(i.baseDir), head: pj(head.dir) }, ...manifests]);
  const deps = newDeps.length > 0 ? await (i.depFacts ?? ((d) => registryFacts(d)))(newDeps) : [];
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
  // D-300: mutation sites on the changed SOURCE lines of tree B (not tests, not protected files)
  const sources = i.files.filter((f) => (f.status === "A" || f.status === "M") && !f.binary && /\.[cm]?[jt]sx?$/.test(f.path) && !anyMatch(rc.tests.test_globs, f.path) && !anyMatch(rc.protected_paths, f.path));
  const sourceFiles = sources.flatMap((f) => (existsSync(path.join(bDir, f.path)) ? [{ path: f.path, content: readFileSync(path.join(bDir, f.path), "utf8") }] : []));
  const added = addedLines(i.diffPatch.toString("utf8"));
  const sites: MutationSite[] = mutationSites({ files: sourceFiles, added, max: i.maxMutants ?? MAX_MUTANTS });
  // D-357: an answer hard-coded for the tests' own inputs passes every mutant; D11 looks for it in the changed lines
  const testEnv = testEnvChecks({ files: sourceFiles, added });
  const special = specialCases({ files: sourceFiles, added, tests: listFiles(bDir).filter((f) => anyMatch(rc.tests.test_globs, f)).slice(0, 200).map((f) => readFileSync(path.join(bDir, f), "utf8")) });
  const mutants = sites.map((st) => {
    const original = readFileSync(path.join(bDir, st.path));
    return { path: st.path, original, mutated: Buffer.from(applySite(original.toString("utf8"), st), "utf8") };
  });
  // D5: the hidden tests go into tree B after the D11 inputs are read (they never shape a mutant or a special case)
  const hidden = i.hidden && i.hidden.files.length > 0 ? i.hidden : null;
  if (hidden) {
    for (const f of hidden.files) {
      const rel = path.posix.normalize(`${hidden.dir}/${f.path}`);
      if (rel.startsWith("..") || path.posix.isAbsolute(rel)) infra("E_DOCKER", "bad hidden test path");
      mkdirSync(path.dirname(path.join(bDir, rel)), { recursive: true });
      writeFileSync(path.join(bDir, rel), f.data);
    }
  }
  const A = await runTests(testsInput("a", aDir));
  i.onGateLog?.("a", path.join(i.runDir, "gate", "a", "log", "events.jsonl"));
  if (!A.ok) infra(A.code === "E_INSTALL_BASE" ? "E_INSTALL_TREE" : A.code, `tree A: ${A.code}`);
  const ui = uiCheck ? { ...uiCheck, baseShots } : null;
  const B = await runTests({ ...testsInput("b", bDir), ...(mutants.length > 0 ? { mutants, mutantTimeoutMs: 180_000 } : {}), ...(checks.length > 0 ? { checks } : {}), ...(ui ? { ui } : {}) });
  i.onGateLog?.("b", path.join(i.runDir, "gate", "b", "log", "events.jsonl"));
  if (!B.ok) infra(B.code === "E_INSTALL_BASE" ? "E_INSTALL_TREE" : B.code, `tree B: ${B.code}`);
  const a = A as Extract<TestProcedureResult, { ok: true }>;
  const bRaw = B as Extract<TestProcedureResult, { ok: true }>;
  // D5: the hidden tests are judged on their own; every other detector sees tree B without them
  const split = hidden ? splitHidden(bRaw.report, hidden.dir) : null;
  const b = split ? { ...bRaw, report: split.visible } : bRaw;
  await i.onReports?.({ raw: a.raw, exit: a.exit }, { raw: b.raw, exit: b.exit });
  if (checks.length > 0 || deps.length > 0) {
    const exitOf = (rs: CheckResult[], n: string) => rs.find((x) => x.name === n)?.exit ?? null;
    evidence.push(d8Static({ checks: checks.map((c) => ({ name: c.name, base: exitOf(baseChecks, c.name), b: exitOf(bRaw.checks ?? [], c.name) })), deps, now: Date.now() }).evidence);
  }
  // AC-5.5: UI paths declared but not touched → D12 n/a; none declared → no D12 evidence at all
  if (!uiTouched && (i.ui?.paths.length ?? 0) > 0) evidence.push(d12Ui({ uiTouched: false, routes: null }).evidence);
  if (uiTouched) {
    const r = bRaw.ui?.up ? bRaw.ui : null;
    if (r) {
      mkdirSync(path.join(i.runDir, "ui"), { recursive: true });
      for (const [name, data] of Object.entries(r.shots)) writeFileSync(path.join(i.runDir, "ui", name), data);
      for (const [name, data] of Object.entries(baseShots)) writeFileSync(path.join(i.runDir, "ui", `base-${name}`), data);
    }
    const routes = r?.routes.map((x) => {
      const base = x.screenshot !== null && baseShots[x.screenshot] ? `ui/base-${x.screenshot}` : null;
      return { ...x, screenshot: x.screenshot !== null && r.shots[x.screenshot] ? `ui/${x.screenshot}` : null, visual_diff: base ? (x.visual_diff ?? null) : null, base_screenshot: base };
    });
    evidence.push(d12Ui({ uiTouched, routes: routes ?? null }).evidence);
  }
  if (hidden && split) evidence.push(bRaw.timedOut ? { ...ev("D5.hidden", "unknown", "tests timed out", {}, { cls: "timeout", id: "-" }), agent_visible: false } : d5Hidden({ hidden: split.hidden, files: hidden.files.length }).evidence);
  evidence.push(a.timedOut ? ev("D1.base_tests", "unknown", "tests timed out", {}, { cls: "timeout", id: "-" }) : d1(bl, a.report, rc.tests.flaky ?? []).evidence);
  evidence.push(
    b.timedOut
      ? ev("D2.inventory", "unknown", "tests timed out", {}, { cls: "timeout", id: "-" })
      : d2({
          baseline: bl, b: b.report, exitB: b.exit ?? 1, diffPatch: i.diffPatch.toString("utf8"), mayChangeTests: i.mayChangeTests,
          a: a.report, weakenedAssertions: wa, declaredTests: declared, external: i.external,
        }).evidence,
  );
  evidence.push(i.mustPass.length === 0 && i.external ? na("MUST_PASS", "no contract") : mustPass({ ids: i.mustPass, a: a.report, b: b.report }).evidence);
  const bClean = !b.timedOut && (split ? b.report.valid && b.report.success : b.exit === 0) && b.report.valid;
  evidence.push(special.length > 0 || testEnv.length > 0 ? d11Mutation({ sites, runs: [], b: b.report, special, testEnv }).evidence : sites.length === 0 ? na("D11.mutation", "no mutable changed lines") : !bClean ? na("D11.mutation", "tests did not pass on B") : d11Mutation({ sites, runs: b.mutants ?? sites.map(() => null), b: b.report }).evidence);
  const cnt = (r: ParsedReport) => (r.valid ? `${[...r.tests.values()].filter((s) => s === "passed").length}/${r.total} passed` : `invalid (${r.error})`);
  const mut = evidence.at(-1);
  i.progress?.(`[verify]    baseline${cachedBaseline ? " (cached)" : ""} · A ${cnt(a.report)} · B ${cnt(b.report)}${mut && mut.status !== "n/a" ? ` · mutants ${mut.summary}` : ""}`);
  return { evidence, cachedBaseline };
}
