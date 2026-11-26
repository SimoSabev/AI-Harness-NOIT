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
  // D-522: headless, only these commands are allowed as written; in the live test a chained one was refused and the
  // agent never ran the tests
  const test = b.commands.test && !b.commands.test.includes("{") ? b.commands.test : null;
  // D-707: the final check also runs the profile's typecheck and lint (D8, packages/verify checks.ts); in run 7 of M4 a
  // unit failed only on D8 type_fail, so the writer runs them itself before it stops
  const typecheck = b.commands.typecheck && !b.commands.typecheck.includes("{") ? b.commands.typecheck : null;
  const lint = b.commands.lint ? b.commands.lint.replace(/\s*\{files\}\s*/g, " ").trim() : null;
  if (cmds.length) {
    out.push("## Running the checks", ...(test ? [`- Run \`${test}\` before you finish and make it pass.`] : []));
    if (typecheck) out.push(`- Run \`${typecheck}\` before you finish and make it pass.`);
    if (lint) out.push(`- Run \`${lint}\` on the files you changed before you finish and fix what it reports.`);
    if (typecheck || lint) out.push("- Mandat's final check runs these too; a change that fails them is not accepted.");
    out.push("- Before you stop, check your change against each acceptance criterion of the task, one by one.");
    out.push("- Run each check on its own, not chained with `&&`, `;` or `|`: the sandbox allows these commands only as written.");
    // D-540: in the live test a writer put a heredoc write and the test run into one shell call, was refused, and
    // reported "Bash was denied in this session" — the checks themselves were allowed all along
    out.push("- Change files with the edit tools, never with a shell redirect or heredoc: such a shell call is refused. A refused shell call does not mean the checks are refused; run them.", "");
  }
  for (const [title, xs] of [["Boundaries", b.boundaries], ["Style", b.style], ["Conventions", b.conventions]] as const) if (xs.length) out.push(`## ${title}`, ...xs.map((x) => `- ${x}`), "");
  const dod = Object.entries(p.layers.g.definition_of_done);
  if (dod.length) out.push("## Definition of done", ...dod.flatMap(([t, xs]) => (xs ?? []).map((x) => `- ${t}: ${x}`)), "");
  return out.join("\n");
}

export const HARNESS_ALWAYS = [
  { rule: "path:write outside allowed_paths", why: "D4 fails a change outside the contract's allowed paths after the export" },
  { rule: "control files changed by the agent", why: "D3 marks a changed .claude/, .codex/, .mcp.json, AGENTS.md or CLAUDE.md as UNKNOWN; the control layer itself is read-only" },
];

/**
 * E8g (D-352): layer D as compiled. The policy hook (deny-by-policy) runs before EVERY tool, whatever matcher D gave it:
 * an ask or deny rule on an MCP tool, a path or the network must reach it. With ask/deny rules and no such hook, one is added.
 */
export function harnessHooks(p: HarnessProfile): HarnessProfile["layers"]["d"] {
  const d = p.layers.d.map((h) => (h.event === "pre_tool" && h.script === "deny-by-policy" ? { ...h, matcher: null } : h));
  const needs = p.layers.c.some((r) => r.decision !== "allow");
  if (needs && !d.some((h) => h.event === "pre_tool" && h.script === "deny-by-policy")) d.unshift({ event: "pre_tool", matcher: null, script: "deny-by-policy", args: {} });
  return d;
}
