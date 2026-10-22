import { sealProfile } from "@mandat/contract";
import type { FieldSource, HarnessProfile, ProfileLayersInput } from "@mandat/contract";
import { propose } from "./propose.js";
import type { Baseline, Source } from "./propose.js";
import { riskProfile } from "./risk-profile.js";
import type { ScanResult } from "./scan.js";

// v5 т. 4.2 (2) / E8б: the full harness profile (layers A–H) proposed without AI. Every field has a source; B.summary stays
// empty (a model summary is off by default). Nothing is approved here: approve_profile needs a human with TOTP.
export interface GitHistory { subjects: string[]; diffLines: number[] }
export interface ProfileProposal { profile: HarnessProfile; sources: Record<string, FieldSource>; warnings: string[]; needs_human: string[]; blocked: string[] }

const INSTALL: Record<string, string> = { npm: "npm ci --ignore-scripts", pnpm: "pnpm install --frozen-lockfile --ignore-scripts", yarn: "yarn install --frozen-lockfile --ignore-scripts" };
const CONVENTIONAL = /^(feat|fix|docs|chore|refactor|test|perf|build|ci|style|revert)(\([^)]{1,40}\))?!?: \S/;
const fieldSource = (s: Source): FieldSource => (s === "lockfile" ? "lockfile" : s === "ci.yml" ? "ci" : s === "baseline" ? "baseline" : s === "human" ? "human" : s.startsWith("rule:") ? "rule" : "package_json");

function runScript(pm: string, name: string): string {
  if (name === "test") return pm === "npm" ? "npm test" : `${pm} test`;
  return pm === "npm" ? `npm run ${name}` : `${pm} ${name}`;
}
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  if (s.length === 0) return 0;
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? (s[m] as number) : Math.round(((s[m - 1] as number) + (s[m] as number)) / 2);
}

export function proposeProfile(scan: ScanResult, o: { repoId: string; version: number; baseline?: Baseline | null; history?: GitHistory | null }): ProfileProposal {
  const p = propose(scan, { baseline: o.baseline ?? null });
  const sources: Record<string, FieldSource> = {};
  for (const [k, v] of Object.entries(p.field_sources)) sources[`a.${k}`] = fieldSource(v);
  const pm = p.policy.runtime.package_manager;
  // B: what an agent should know
  const commands: ProfileLayersInput["b"]["commands"] = { install: INSTALL[pm] as string };
  if (scan.scripts.test) commands.test = runScript(pm, "test");
  if (scan.scripts.lint) commands.lint = runScript(pm, "lint");
  if (scan.scripts.typecheck) commands.typecheck = runScript(pm, "typecheck");
  if (scan.scripts.dev) commands.dev = runScript(pm, "dev");
  if (p.policy.tests.framework === "vitest") commands.test_one = "npx vitest run {file}";
  if (p.policy.tests.framework === "jest") commands.test_one = "npx jest {file}";
  sources["b.commands"] = "package_json";
  const conventions: string[] = [];
  if (o.history && o.history.subjects.length > 0) {
    const n = o.history.subjects.length;
    const k = o.history.subjects.filter((x) => CONVENTIONAL.test(x)).length;
    if (k * 2 >= n) conventions.push(`commit titles: conventional (<type>: <what>) in ${k}/${n}`);
    if (o.history.diffLines.length > 0) conventions.push(`median change: ${median(o.history.diffLines)} lines`);
    sources["b.conventions"] = "git_history";
  }
  if (scan.style.length > 0) sources["b.style"] = "repo_file";
  const risk = riskProfile(scan);
  const boundaries = [
    ...risk.high.map((h) => `Do not change ${h.glob} (high risk: ${h.rule.slice(5)}).`),
    "Never push, never call the network; the harness delivers the change.",
  ];
  sources["b.boundaries"] = "rule";
  // C: what the agent may not do (any agent); the harness enforces the rest (gate, D3/D4)
  const c: ProfileLayersInput["c"] = [
    { subject: "any", tool: "bash:git push *", decision: "deny", reason: "the harness delivers, never the agent" },
    { subject: "any", tool: "bash:curl *", decision: "deny", reason: "no network outside the gate" },
    { subject: "any", tool: "bash:wget *", decision: "deny", reason: "no network outside the gate" },
    ...risk.high.map((h) => ({ subject: "any", tool: `path:write:${h.glob}`, decision: "deny" as const, reason: `high-risk folder (${h.rule})` })),
  ];
  sources.c = "rule";
  const d: ProfileLayersInput["d"] = [{ event: "pre_tool", matcher: "Bash", script: "deny-by-policy", args: {} }];
  if (commands.typecheck) d.push({ event: "post_tool", matcher: "Edit|Write|MultiEdit", script: "typecheck-changed", args: {} });
  if (commands.test) d.push({ event: "stop", matcher: null, script: "require-tests-ran", args: {} });
  sources.d = "rule";
  const layers: ProfileLayersInput = {
    a: p.policy,
    b: { summary: "", commands, boundaries, task_types: Object.keys(p.policy.task_types), links: [], style: scan.style, conventions },
    c,
    d,
    e: {
      mcp: [{ name: "mandat", transport: "http", package: null, url: "http://egress-gate/mcp/mandat", version: "1", digest: null, tools_hash: null, enabled_tools: ["mandat_status", "mandat_verify", "mandat_explain"], egress_hosts: [], secrets: [] }],
      skills: [],
      plugins: [],
    },
    f: { roles: [{ role: "reviewer", model: "claude-haiku-5-5", tools: ["path:read:**"], max_turns: 20, description: "Reads the change and reports problems; never writes." }] },
    g: {
      required_detectors: p.policy.harness.required_detectors,
      mutants: 3,
      max_diff_lines: 400,
      ui_paths: [],
      definition_of_done: { bugfix: ["a test that failed before passes", "no test removed or weakened"], docs: ["only documentation files change"] },
      max_subagents: 2,
      max_depth: 1,
    },
    h: { budgets: p.policy.budgets, routing: [{ task_type: null, role: "lead", mode: "auto", channel: null, fallback: [] }] },
  };
  for (const k of ["e", "f", "g", "h"]) sources[k] = "rule";
  const profile = sealProfile({ version: o.version, repo_id: o.repoId, layers, sources, approved_by: null, approved_at: null });
  return { profile, sources, warnings: p.warnings, needs_human: p.needs_human, blocked: p.blocked };
}
