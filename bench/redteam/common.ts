import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { DockerRunner } from "@mandat/sandbox";
import { demoProfileLayers, sealProfile } from "@mandat/contract";
import type { GateLogLine, HarnessProfile } from "@mandat/contract";
import { readGateLog, runTask } from "@mandat/worker";
import type { RunHooks, RunTaskInput, RunTaskOutput } from "@mandat/worker";
import type { FakeScenario } from "@mandat/agents";

export interface RedteamCtx {
  home: string;
  contractPath: string;
  docker?: DockerRunner;
  env?: Record<string, string | undefined>;
  /** the repo (images, fixtures); R16 needs it */
  repoRoot?: string;
}
export interface SubResult {
  id: string;
  sub: string;
  ok: boolean;
  detail: string;
}

export function run(ctx: RedteamCtx, fake: FakeScenario, hooks?: RunHooks, extra: Partial<Pick<RunTaskInput, "profile" | "contractPath" | "mcpSecrets">> & { mcpTarballs?: Record<string, Buffer> } = {}): Promise<RunTaskOutput> {
  const { mcpTarballs, ...rest } = extra;
  return runTask({
    home: ctx.home, contractPath: ctx.contractPath, agent: `fake:${fake}`, keep: false, json: true,
    ...(ctx.docker ? { docker: ctx.docker } : {}), ...(hooks ? { hooks } : {}), ...rest,
    internals: { ...(ctx.env ? { env: ctx.env } : {}), ...(ctx.repoRoot ? { repoRoot: ctx.repoRoot } : {}), ...(mcpTarballs ? { mcpTarballs } : {}) },
  });
}

/** The demo harness profile (its control layer: hooks, deny rules) for the attacks that need one. */
export function demoProfile(): HarnessProfile {
  return sealProfile({ version: 1, repo_id: "local", layers: demoProfileLayers(), sources: {}, approved_by: null, approved_at: null });
}

export function gateLog(runDir: string | null): GateLogLine[] {
  return readGateLog(path.join(runDir ?? "/nonexistent", "gate", "log", "events.jsonl"));
}

export function notesOf<T>(runDir: string | null): T | null {
  try {
    return JSON.parse(readFileSync(path.join(runDir ?? "/nonexistent", "notes.txt"), "utf8")) as T;
  } catch {
    return null;
  }
}

export function securityEvents(home: string, runId: string): { kind: string; severity: string }[] {
  const f = path.join(home, "security_events.jsonl");
  if (!existsSync(f)) return [];
  return readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { kind: string; severity: string; run_id: string }).filter((e) => e.run_id === runId);
}

/** Every file under dir whose bytes contain `needle`. */
export function grep(dir: string, needle: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const n of readdirSync(d)) {
      const p = path.join(d, n);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (st.isFile() && readFileSync(p).includes(needle)) out.push(p);
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

export const check = (id: string, sub: string, conds: [boolean, string][]): SubResult => {
  const failed = conds.filter(([ok]) => !ok).map(([, why]) => why);
  return { id, sub, ok: failed.length === 0, detail: failed.length === 0 ? conds.map(([, w]) => w).join("; ") : `FAILED: ${failed.join("; ")}` };
};
