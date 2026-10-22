import type { HarnessProfile, ToolRule } from "@mandat/contract";

export interface CompileCtx {
  runId: string;
  /** who the rules are for: e.g. ["agent:claude", "account:work", "any"] (+ "night" in a night shift) */
  subjects: string[];
  /** SKILL.md contents by name (approved, from the skills catalog); a skill without content is reported unsupported */
  skills?: Record<string, string>;
}
export const HARNESS_DIR = "/m/in/harness";
export const HOOKS = "/opt/mandat/hooks";
export type Files = { path: string; bytes: string; mode: "0444" | "0555" }[];

export function rulesFor(p: HarnessProfile, subjects: readonly string[]): ToolRule[] {
  const s = new Set([...subjects, "any"]);
  return p.layers.c.filter((r) => s.has(r.subject));
}
export const uniq = (xs: string[]) => [...new Set(xs)];

export function policyJson(p: HarnessProfile, ctx: CompileCtx): string {
  const rules = rulesFor(p, ctx.subjects).map((r) => ({ tool: r.tool, decision: r.decision, reason: r.reason }));
  return JSON.stringify({ version: 1, subjects: uniq([...ctx.subjects, "any"]), rules, commands: p.layers.b.commands, max_subagents: p.layers.g.max_subagents, max_depth: p.layers.g.max_depth }, null, 2) + "\n";
}

/** Layer B (+ the definition of done from G) as plain instructions for any agent. */
export function instructions(p: HarnessProfile): string {
  const b = p.layers.b;
  const out: string[] = ["# Project instructions (from the harness profile; the repo's own instruction files are not read)", ""];
  if (b.summary) out.push(b.summary, "");
  const cmds = Object.entries(b.commands);
  if (cmds.length) out.push("## Commands", ...cmds.map(([k, v]) => `- ${k}: \`${v}\``), "");
  for (const [title, xs] of [["Boundaries", b.boundaries], ["Style", b.style], ["Conventions", b.conventions]] as const) if (xs.length) out.push(`## ${title}`, ...xs.map((x) => `- ${x}`), "");
  const dod = Object.entries(p.layers.g.definition_of_done);
  if (dod.length) out.push("## Definition of done", ...dod.flatMap(([t, xs]) => (xs ?? []).map((x) => `- ${t}: ${x}`)), "");
  return out.join("\n");
}

export const HARNESS_ALWAYS = [
  { rule: "path:write outside allowed_paths", why: "D4 fails a change outside the contract's allowed paths after the export" },
  { rule: "control files changed by the agent", why: "D3 marks a changed .claude/, .codex/, .mcp.json, AGENTS.md or CLAUDE.md as UNKNOWN; the control layer itself is read-only" },
];
