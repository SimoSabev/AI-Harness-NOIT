import { readFileSync } from "node:fs";
import path from "node:path";
import { isFakeCodexScenario, isFakeScenario } from "@mandat/agents";
import type { FakeCodexScenario, FakeScenario } from "@mandat/agents";
import { HarnessProfile } from "@mandat/contract";
import { runTask } from "@mandat/worker";
import type { RunTaskOutput } from "@mandat/worker";
import type { DockerRunner } from "@mandat/sandbox";
import { displayPath, printJson } from "../output.js";
import type { Io } from "../output.js";

export function formatVerdict(io: Io, r: RunTaskOutput): string {
  const v = r.verdict;
  if (!v) return `ERROR ${r.error?.code ?? "?"}: ${r.error?.message ?? ""}\n`;
  const lines = [v.result === "VERIFIED" ? "VERDICT: VERIFIED" : `VERDICT: ${v.result}  reasons: ${v.reasons.join(", ")}`];
  const parts = v.evidence.map((e) => `${e.detector} ${e.status}${e.status !== "pass" && e.status !== "n/a" && e.signature ? ` (${e.signature})` : ""}`);
  for (let i = 0; i < parts.length; i += 5) lines.push(`  ${parts.slice(i, i + 5).join(" · ")}`);
  if (r.ledger && r.runDir) lines.push(`ledger: seq ${r.ledger.from}..${r.ledger.to} · ${displayPath(io, path.join(r.runDir, "verdict.json"))}`);
  return lines.join("\n") + "\n";
}

/** 6.13: `mandat run --contract <file> --agent <claude|fake:<scenario>> [--keep] [--json]`. Exit per D-026. */
export async function runCommand(io: Io, o: { mandatHome: string; contract: string; agent: string; keep: boolean; json: boolean; docker?: DockerRunner; profile?: string }): Promise<number> {
  const agent = o.agent;
  if (agent !== "claude" && !(agent.startsWith("fake:") && isFakeScenario(agent.slice(5))) && !(agent.startsWith("fake-codex:") && isFakeCodexScenario(agent.slice(11)))) {
    io.stderr(`unknown agent: ${agent} (claude | fake:<scenario> | fake-codex:<scenario>)\n`);
    if (o.json) printJson(io, { error: { code: "E_USAGE", message: `unknown agent: ${agent}` }, exit: 2 });
    return 2;
  }
  // v5 E8а: --profile <harness profile JSON> → the compiled control layer for the agent
  let profile: HarnessProfile | undefined;
  if (o.profile) {
    const parsed = HarnessProfile.safeParse(JSON.parse(readFileSync(path.resolve(io.cwd, o.profile), "utf8")));
    if (!parsed.success) {
      io.stderr(`invalid harness profile: ${parsed.error.issues[0]?.path.join(".") ?? ""} ${parsed.error.issues[0]?.message ?? ""}\n`);
      return 2;
    }
    profile = parsed.data;
  }
  const r = await runTask({
    home: o.mandatHome,
    contractPath: path.resolve(io.cwd, o.contract),
    agent: agent as "claude" | `fake:${FakeScenario}` | `fake-codex:${FakeCodexScenario}`,
    ...(profile ? { profile } : {}),
    keep: o.keep,
    json: o.json,
    ...(o.docker ? { docker: o.docker } : {}),
    internals: { env: io.env, progress: (l) => (o.json ? io.stderr(l + "\n") : io.stdout(l + "\n")) },
  });
  if (o.json) {
    if (r.verdict) printJson(io, { ...r.verdict, ledger: r.ledger, run_dir: r.runDir, exit: r.exit });
    else printJson(io, { error: r.error, exit: r.exit });
  } else {
    if (r.error && !r.verdict) io.stderr(`${r.error.code}: ${r.error.message}\n`);
    else io.stdout(formatVerdict(io, r));
  }
  return r.exit;
}
