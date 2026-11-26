import type { HarnessProfile, Materialized, ToolRule } from "@mandat/contract";
import { HARNESS_ALWAYS, HARNESS_DIR, instructions, policyJson, rulesFor } from "./common.js";
import type { CompileCtx, Files } from "./common.js";
import { RULES, ruleKind } from "./rules.js";

// E9в (D-429, D-431): Gemini CLI's control layer, read from github.com/google-gemini/gemini-cli docs (main b8fa817,
// 28.10.2026; D-423). `--policy` loads the TOML rules (docs/reference/policy-engine.md); `--include-directories
// /m/in/harness` puts the harness instructions where the image's settings look for the context file (instructions.md).
// The settings themselves are the image's /etc/gemini-cli/settings.json: the CLI skips a settings file whose parent
// directory is not root-owned, and /m belongs to the agent (D-431, seen in the Docker test) — so none is compiled here.
export const GEMINI_DIR = `${HARNESS_DIR}/gemini`;
const PRIORITY = { deny: 900, ask: 800, allow: 100 } as const;
const str = (s: string) => JSON.stringify(s);
const globRegex = (g: string) => g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");

/** One profile rule as the lines of a TOML [[rule]]; null = not a shell rule (the harness or nothing enforces it). */
export function geminiPolicyRule(r: ToolRule): string[] | null {
  if (ruleKind(r.tool) !== "bash") return null;
  const b = r.tool.slice("bash:".length).trim();
  const match = b === "*" ? [] : /^[^*?]+\*?$/.test(b) ? [`commandPrefix = ${str(b.replace(/\s*\*$/, "").trim())}`] : [`commandRegex = ${str(globRegex(b))}`];
  // headless Gemini CLI turns ask_user into deny; the reason says a person would decide
  const decision = r.decision === "allow" ? "allow" : "deny";
  const msg = r.decision === "ask" ? `needs approval: ${r.reason}` : r.reason;
  return ['toolName = "run_shell_command"', ...match, `decision = ${str(decision)}`, `priority = ${PRIORITY[r.decision]}`, ...(decision === "deny" && msg !== "" ? [`denyMessage = ${str(msg)}`] : [])];
}

export function compileGemini(p: HarnessProfile, ctx: CompileCtx): Materialized {
  const rules = rulesFor(p, ctx.subjects);
  const toml = ["# Mandat harness profile → Gemini CLI policy engine (D-429). Headless: ask_user would be deny anyway.", ""];
  for (const r of rules) {
    const lines = geminiPolicyRule(r);
    if (lines) toml.push("[[rule]]", ...lines, "");
  }
  const files: Files = [
    { path: "gemini/policies/mandat.toml", bytes: toml.join("\n"), mode: "0444" },
    { path: "instructions.md", bytes: instructions(p, ctx.subjects), mode: "0444" },
    { path: "policy.json", bytes: policyJson(p, ctx), mode: "0444" },
  ];
  const unsupported: Materialized["unsupported"] = [
    ...rules.filter((r) => RULES[ruleKind(r.tool)].gemini === "unsupported").map((r) => ({ rule: r.tool, why: "Gemini CLI: this kind of rule is not compiled; the harness cannot see it either" })),
    ...(p.layers.d.length > 0 ? [{ rule: "hooks", why: "Gemini CLI hooks are not compiled yet; the image's settings turn hooks off" }] : []),
    ...p.layers.e.mcp.map((m) => ({ rule: `mcp server ${m.name}`, why: "Gemini CLI: MCP servers are not compiled yet" })),
    ...p.layers.e.skills.map((s) => ({ rule: `skill:${s.name}`, why: "Gemini CLI: skills are not compiled yet" })),
    ...(p.layers.f.roles.length > 0 ? [{ rule: "subagents", why: "Gemini CLI: subagent roles are not compiled yet" }] : []),
  ];
  const enforced = [
    ...rules.filter((r) => RULES[ruleKind(r.tool)].gemini === "harness").map((r) => ({ rule: r.tool, why: ruleKind(r.tool) === "net" ? "the egress gate allows only the declared hosts and routes" : "the sandbox + D4 after the export" })),
    ...rules.filter((r) => ruleKind(r.tool) === "bash" && r.decision === "ask").map((r) => ({ rule: r.tool, why: "ask is a deny in headless Gemini CLI (no person to ask in the run)" })),
    ...HARNESS_ALWAYS,
  ];
  return {
    files: files.sort((a, b) => (a.path < b.path ? -1 : 1)),
    argv: ["--policy", `${GEMINI_DIR}/policies`, "--include-directories", HARNESS_DIR],
    env: {},
    enforced_by_harness: enforced,
    unsupported,
  };
}
