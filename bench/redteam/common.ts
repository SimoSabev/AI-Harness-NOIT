import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { DockerRunner } from "@mandat/sandbox";
import { runTask } from "@mandat/worker";
import type { RunHooks, RunTaskOutput } from "@mandat/worker";
import type { FakeScenario } from "@mandat/agents";

export interface RedteamCtx {
  home: string;
  contractPath: string;
  docker?: DockerRunner;
  env?: Record<string, string | undefined>;
}
export interface SubResult {
  id: string;
  sub: string;
  ok: boolean;
  detail: string;
}

export function run(ctx: RedteamCtx, fake: FakeScenario, hooks?: RunHooks): Promise<RunTaskOutput> {
  return runTask({
    home: ctx.home, contractPath: ctx.contractPath, agent: `fake:${fake}`, keep: false, json: true,
    ...(ctx.docker ? { docker: ctx.docker } : {}), ...(hooks ? { hooks } : {}), internals: { ...(ctx.env ? { env: ctx.env } : {}) },
  });
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
