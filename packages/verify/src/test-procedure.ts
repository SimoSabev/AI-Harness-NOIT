import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { npmAllowlistFromLockfile, parseVitestReport } from "@mandat/contract";
import type { ParsedReport } from "@mandat/contract";
import { packTree } from "@mandat/export";
import { dockerText, names } from "@mandat/sandbox";
import type { DockerRunner, Tree } from "@mandat/sandbox";
import { startRunGate } from "./gate.js";
import type { RunGate } from "./gate.js";
import { runSandbox, safeReadVolume } from "./sandbox-exec.js";

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
}
export type TestProcedureResult =
  | { ok: true; exit: number | null; timedOut: boolean; raw: string | null; report: ParsedReport }
  | { ok: false; code: "E_LOCKFILE_BASE" | "E_GATE_START" | "E_GATE_POLICY" | "E_INSTALL_BASE" | "E_INSTALL_TREE" };

export const REPORT_LIMIT = 20971521;

/** 7.8(4): own volume, own gate (install phase, lockfile allowlist), install, then tests with --network none. */
export async function runTestProcedure(i: TestProcedureInput): Promise<TestProcedureResult> {
  const tree = i.tree as Tree;
  const vol = names.vol(i.runId, tree);
  const ctx = { docker: i.docker, runId: i.runId, runDir: i.runDir, mandatHome: i.mandatHome, home: i.home, image: i.images.sandbox, ipv6Sysctl: i.ipv6Sysctl ?? true };
  const installCode = i.tree === "base" ? "E_INSTALL_BASE" : "E_INSTALL_TREE";
  const lockFile = path.join(i.treeDir, "package-lock.json");
  let lock: unknown;
  try {
    lock = existsSync(lockFile) ? JSON.parse(readFileSync(lockFile, "utf8")) : null;
  } catch {
    lock = null;
  }
  const allow = npmAllowlistFromLockfile(lock);
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
    const inst = await runSandbox(ctx, { role: "install", volume: vol, network: gate.net, tree, env: { phase: "install" }, cmd: ["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund"], timeoutMs: 300_000 });
    await gate.stop();
    gate = undefined;
    if (inst.exitCode !== 0 || inst.timedOut) return { ok: false, code: installCode };
    const t = await runSandbox(ctx, { role: "test", volume: vol, network: "none", env: { phase: "test", testsEnv: i.testsEnv }, cmd: ["/bin/sh", "-c", i.testsCommand], timeoutMs: i.timeoutMs });
    const raw = (await safeReadVolume(ctx, { volume: vol, file: "/m/out/report.json", limit: REPORT_LIMIT, role: "test" }))?.toString("utf8") ?? null;
    return { ok: true, exit: t.timedOut ? null : t.exitCode, timedOut: t.timedOut, raw, report: parseVitestReport(raw, "/m/work") };
  } finally {
    await gate?.stop();
    await dockerText(i.docker, ["volume", "rm", "-f", vol], 60_000);
  }
}
