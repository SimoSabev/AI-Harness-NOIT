import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { LOCKFILE, installCommand, isBerryLock, lockAllowlist, parseUiResult, parseVitestReport } from "@mandat/contract";
import type { PackageManager, ParsedReport, UiRunResult } from "@mandat/contract";
import { packTree } from "@mandat/export";
import { dockerText, names } from "@mandat/sandbox";
import type { DockerRunner, Tree } from "@mandat/sandbox";
import { startRunGate } from "./gate.js";
import type { RunGate } from "./gate.js";
import { runSandbox, safeReadVolume } from "./sandbox-exec.js";
import type { SandboxCtx } from "./sandbox-exec.js";

export interface TestProcedureInput {
  docker: DockerRunner;
  runId: string;
  runDir: string;
  mandatHome: string;
  home: string;
  tree: "base" | "a" | "b";
  treeDir: string;
  testsCommand: string;
  testsEnv: Record<string, string>;
  images: { sandbox: string; gate: string };
  timeoutMs: number;
  /** infra settings (D-034, D-150, D-152) */
  infraUser?: string;
  extraCa?: string | undefined;
  ipv6Sysctl?: boolean;
  startGate?: typeof startRunGate;
  /** D-300: after the tests, each mutant (one changed file) runs the same tests on the same installed volume, then is undone */
  mutants?: { path: string; mutated: Buffer; original: Buffer }[];
  /** D-301: npm (default), pnpm or yarn v1 — the lockfile and the install command */
  packageManager?: PackageManager;
  mutantTimeoutMs?: number;
  /** v5 E9б (D8): the project's lint and typecheck, run last on the same installed volume with no network */
  checks?: { name: "lint" | "typecheck"; command: string }[];
  /** v5 E9б (D12, D-364): tree B's dev server and a browser on the run's own internal network; last, after everything else */
  ui?: { image: string; devCommand: string; routes: string[] };
}
export interface UiResult extends UiRunResult { shots: Record<string, Buffer> }
export interface CheckResult { name: "lint" | "typecheck"; exit: number | null }
export interface MutantResult { exit: number | null; timedOut: boolean; report: ParsedReport }
export type TestProcedureResult =
  | { ok: true; exit: number | null; timedOut: boolean; raw: string | null; report: ParsedReport; mutants?: (MutantResult | null)[]; checks?: CheckResult[]; ui?: UiResult | null }
  | { ok: false; code: "E_LOCKFILE_BASE" | "E_GATE_START" | "E_GATE_POLICY" | "E_INSTALL_BASE" | "E_INSTALL_TREE" };

export const REPORT_LIMIT = 20971521;
export const UI_PORT = 4173;
const SHOT_LIMIT = 5 * 1024 * 1024;

/**
 * D12 (D-364): an internal network of this run only (no egress, nothing published); the app container runs the profile's
 * dev command on tree B's installed volume; the browser container gets its own out volume (the app cannot write the
 * result it is judged by), visits the routes and writes result.json + screenshots. Any failure → null (D12: not run).
 */
async function runUiCheck(ctx: SandboxCtx, i: TestProcedureInput & { ui: NonNullable<TestProcedureInput["ui"]> }, vol: string): Promise<UiResult | null> {
  const net = names.uiNet(i.runId);
  const app = names.uiApp(i.runId);
  const out = `mandat-uiout-${i.runId}`;
  try {
    if ((await dockerText(i.docker, ["network", "create", "--internal", "--label", `mandat.run=${i.runId}`, net])).exitCode !== 0) return null;
    await dockerText(i.docker, ["volume", "create", "--label", `mandat.run=${i.runId}`, out]);
    const started = await runSandbox(ctx, {
      role: "ui-app", volume: vol, network: net, detach: true, name: app, env: { phase: "none", extraPublic: { PORT: String(UI_PORT), HOST: "0.0.0.0", ...i.testsEnv } },
      cmd: ["/bin/sh", "-c", i.ui.devCommand], timeoutMs: 60_000,
    });
    if (started.exitCode !== 0) return null;
    const browse = await runSandbox({ ...ctx, image: i.ui.image }, {
      role: "ui", volume: out, network: net, env: { phase: "none", extraPublic: { MANDAT_UI_URL: `http://${app}:${UI_PORT}`, MANDAT_UI_ROUTES: JSON.stringify(i.ui.routes) } },
      cmd: ["node", "/opt/mandat/ui/ui-run.mjs"], timeoutMs: 180_000,
    });
    if (browse.timedOut) return null;
    const result = parseUiResult((await safeReadVolume(ctx, { volume: out, file: "/m/out/ui/result.json", limit: 1024 * 1024, role: "test" }))?.toString("utf8") ?? null);
    if (result === null) return null;
    const shots: Record<string, Buffer> = {};
    for (const r of result.routes) {
      if (r.screenshot === null) continue;
      const b = await safeReadVolume(ctx, { volume: out, file: `/m/out/ui/${r.screenshot}`, limit: SHOT_LIMIT, role: "test" });
      if (b !== null && b.length > 0) shots[r.screenshot] = b;
    }
    return { ...result, shots };
  } finally {
    await dockerText(i.docker, ["rm", "-f", app], 60_000);
    await dockerText(i.docker, ["network", "rm", net], 60_000);
    await dockerText(i.docker, ["volume", "rm", "-f", out], 60_000);
  }
}

/** 7.8(4): own volume, own gate (install phase, lockfile allowlist), install, then tests with --network none. */
export async function runTestProcedure(i: TestProcedureInput): Promise<TestProcedureResult> {
  const tree = i.tree as Tree;
  const vol = names.vol(i.runId, tree);
  const ctx = { docker: i.docker, runId: i.runId, runDir: i.runDir, mandatHome: i.mandatHome, home: i.home, image: i.images.sandbox, ipv6Sysctl: i.ipv6Sysctl ?? true };
  const installCode = i.tree === "base" ? "E_INSTALL_BASE" : "E_INSTALL_TREE";
  const pm = i.packageManager ?? "npm";
  const lockFile = path.join(i.treeDir, LOCKFILE[pm]);
  const lockText = existsSync(lockFile) ? readFileSync(lockFile, "utf8") : null;
  const allow = lockAllowlist(pm, lockText);
  if (!allow.ok) return { ok: false, code: i.tree === "base" ? "E_LOCKFILE_BASE" : "E_INSTALL_TREE" };
  let gate: RunGate | undefined;
  try {
    await dockerText(i.docker, ["volume", "create", "--label", `mandat.run=${i.runId}`, vol]);
    const seed = await runSandbox(ctx, { role: "seed", volume: vol, network: "none", env: { phase: "none" }, cmd: ["tar", "-x", "-C", "/m/work"], stdin: packTree(i.treeDir), timeoutMs: 120_000 });
    if (seed.exitCode !== 0) return { ok: false, code: installCode };
    try {
      gate = await (i.startGate ?? startRunGate)(
        { docker: i.docker, runId: i.runId, runDir: i.runDir, mandatHome: i.mandatHome, home: i.home, tree, gateImage: i.images.gate, user: i.infraUser ?? "1000:1000", extraCa: i.extraCa },
        { phase: "install", routes: allow.routes },
      );
    } catch (e) {
      return { ok: false, code: (e as { code?: string }).code === "E_GATE_POLICY" ? "E_GATE_POLICY" : "E_GATE_START" };
    }
    const inst = await runSandbox(ctx, { role: "install", volume: vol, network: gate.net, tree, env: { phase: "install" }, cmd: installCommand(pm, isBerryLock(lockText)), timeoutMs: 300_000 });
    await gate.stop();
    gate = undefined;
    if (inst.exitCode !== 0 || inst.timedOut) return { ok: false, code: installCode };
    const t = await runSandbox(ctx, { role: "test", volume: vol, network: "none", env: { phase: "test", testsEnv: i.testsEnv }, cmd: ["/bin/sh", "-c", i.testsCommand], timeoutMs: i.timeoutMs });
    const raw = (await safeReadVolume(ctx, { volume: vol, file: "/m/out/report.json", limit: REPORT_LIMIT, role: "test" }))?.toString("utf8") ?? null;
    const report = parseVitestReport(raw, "/m/work");
    // D8: after everything else (a check that writes files cannot change a mutant run); exit null = timed out
    const runChecks = async (): Promise<CheckResult[] | undefined> => {
      if (!i.checks || i.checks.length === 0) return undefined;
      const out: CheckResult[] = [];
      for (const c of i.checks) {
        const r = await runSandbox(ctx, { role: "test", volume: vol, network: "none", env: { phase: "test", testsEnv: i.testsEnv }, cmd: ["/bin/sh", "-c", c.command], timeoutMs: i.timeoutMs });
        out.push({ name: c.name, exit: r.timedOut ? null : r.exitCode });
      }
      return out;
    };
    const runUi = async (): Promise<{ ui?: UiResult | null }> => (i.ui ? { ui: await runUiCheck(ctx, { ...i, ui: i.ui }, vol) } : {});
    if (!i.mutants || i.mutants.length === 0) {
      const checks = await runChecks();
      return { ok: true, exit: t.timedOut ? null : t.exitCode, timedOut: t.timedOut, raw, report, ...(checks ? { checks } : {}), ...(await runUi()) };
    }
    const mutants: (MutantResult | null)[] = [];
    const scratch = mkdtempSync(path.join(path.dirname(i.treeDir), "mutant-"));
    const put = async (rel: string, content: Buffer): Promise<boolean> => {
      const dir = mkdtempSync(path.join(scratch, "f-"));
      try {
        mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
        writeFileSync(path.join(dir, rel), content);
        // the whole (one-file) tar is read before the scratch dir goes away, whatever the container does with stdin
        const chunks: Buffer[] = [];
        for await (const c of packTree(dir)) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c as string));
        const r = await runSandbox(ctx, { role: "seed", volume: vol, network: "none", env: { phase: "none" }, cmd: ["tar", "-x", "-C", "/m/work"], stdin: Readable.from([Buffer.concat(chunks)]), timeoutMs: 60_000 });
        return r.exitCode === 0;
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    };
    try {
      for (const m of i.mutants) {
        if (!(await put(m.path, m.mutated))) {
          mutants.push(null);
          continue;
        }
        // the old report must not stand in for a mutant run that never wrote one
        const mt = await runSandbox(ctx, { role: "test", volume: vol, network: "none", env: { phase: "test", testsEnv: i.testsEnv }, cmd: ["/bin/sh", "-c", `rm -f /m/out/report.json; ${i.testsCommand}`], timeoutMs: i.mutantTimeoutMs ?? i.timeoutMs });
        const mraw = (await safeReadVolume(ctx, { volume: vol, file: "/m/out/report.json", limit: REPORT_LIMIT, role: "test" }))?.toString("utf8") ?? null;
        mutants.push({ exit: mt.timedOut ? null : mt.exitCode, timedOut: mt.timedOut, report: parseVitestReport(mraw, "/m/work") });
        if (!(await put(m.path, m.original))) break;
      }
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
    while (mutants.length < i.mutants.length) mutants.push(null);
    const checks = await runChecks();
    return { ok: true, exit: t.timedOut ? null : t.exitCode, timedOut: t.timedOut, raw, report, mutants, ...(checks ? { checks } : {}), ...(await runUi()) };
  } finally {
    await gate?.stop();
    await dockerText(i.docker, ["volume", "rm", "-f", vol], 60_000);
  }
}
