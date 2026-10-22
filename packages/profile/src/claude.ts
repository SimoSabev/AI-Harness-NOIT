import type { HarnessProfile, HookSpec, Materialized } from "@mandat/contract";
import { HARNESS_ALWAYS, HARNESS_DIR, HOOKS, instructions, policyJson, rulesFor, uniq } from "./common.js";
import type { CompileCtx, Files } from "./common.js";
import { RULES, claudeRule, claudeToolName, ruleKind } from "./rules.js";

const EVENT: Record<HookSpec["event"], string> = { pre_tool: "PreToolUse", post_tool: "PostToolUse", stop: "Stop", subagent_stop: "SubagentStop", session_start: "SessionStart" };
const command = (h: HookSpec) => [`node ${HOOKS}/${h.script}.mjs`, ...Object.entries(h.args).map(([k, v]) => `--${k}=${JSON.stringify(v)}`)].join(" ");

/** v5 т. 4.1 + D-343: Claude Code reads only what the harness gives it: --settings (permissions, hooks), strict MCP. */
export function compileClaude(p: HarnessProfile, ctx: CompileCtx): Materialized {
  const rules = rulesFor(p, ctx.subjects);
  const native = rules.filter((r) => RULES[ruleKind(r.tool)].claude === "native");
  const perms = { allow: [] as string[], deny: [] as string[], ask: [] as string[] };
  for (const r of native) perms[r.decision].push(...claudeRule(r.tool));
  // --permission-mode dontAsk refuses whatever is not pre-approved: the profile's MCP tools and its own commands are
  const b = p.layers.b.commands;
  for (const c of [b.test, b.lint, b.typecheck]) if (c && !c.includes("{")) perms.allow.push(`Bash(${c} *)`, `Bash(${c})`);
  for (const m of p.layers.e.mcp) perms.allow.push(...(m.enabled_tools ? m.enabled_tools.map((t) => `mcp__${m.name}__${t}`) : [`mcp__${m.name}`]));
  const hooks: Record<string, { matcher?: string; hooks: { type: "command"; command: string; timeout: number }[] }[]> = {};
  for (const h of p.layers.d) (hooks[EVENT[h.event]] ??= []).push({ ...(h.matcher ? { matcher: h.matcher } : {}), hooks: [{ type: "command", command: command(h), timeout: 10 }] });
  const settings = {
    permissions: { allow: uniq(perms.allow), deny: uniq(perms.deny), ask: uniq(perms.ask) },
    hooks,
    pluginConfigs: { "cc-plugin-agents-md@builtin": { options: { instructionFiles: "managed-only" } } },
  };
  const files: Files = [
    { path: "claude/settings.json", bytes: JSON.stringify(settings, null, 2) + "\n", mode: "0444" },
    { path: "policy.json", bytes: policyJson(p, ctx), mode: "0444" },
    { path: "instructions.md", bytes: instructions(p), mode: "0444" },
  ];
  const mcp = p.layers.e.mcp;
  files.push({ path: "claude/mcp.json", bytes: JSON.stringify({ mcpServers: Object.fromEntries(mcp.map((m) => [m.name, { type: "http", url: m.transport === "http" && m.url ? m.url : `http://egress-gate/mcp/${m.name}` }])) }, null, 2) + "\n", mode: "0444" });
  for (const r of p.layers.f.roles) {
    const tools = uniq(r.tools.flatMap(claudeToolName));
    files.push({ path: `claude/agents/${r.role}.md`, bytes: ["---", `name: ${r.role}`, `description: ${r.description.replace(/\n/g, " ")}`, `tools: ${tools.join(", ")}`, `model: ${r.model}`, `maxTurns: ${r.max_turns}`, "permissionMode: dontAsk", "---", r.description, ""].join("\n"), mode: "0444" });
  }
  const unsupported: Materialized["unsupported"] = [];
  for (const s of p.layers.e.skills) {
    const text = ctx.skills?.[s.name];
    if (text) files.push({ path: `claude/skills/${s.name}/SKILL.md`, bytes: text, mode: "0444" });
    else unsupported.push({ rule: `skill:${s.name}`, why: "no approved content for this skill in the catalog" });
  }
  for (const r of rules.filter((x) => RULES[ruleKind(x.tool)].claude === "unsupported")) unsupported.push({ rule: r.tool, why: "Claude Code has no permission rule for this kind" });
  const enforced = [...rules.filter((r) => RULES[ruleKind(r.tool)].claude === "harness").map((r) => ({ rule: r.tool, why: "the egress gate allows only the declared hosts and routes" })), ...HARNESS_ALWAYS];
  const g = p.layers.g;
  return {
    files: files.sort((a, b) => (a.path < b.path ? -1 : 1)),
    argv: ["--settings", `${HARNESS_DIR}/claude/settings.json`, "--mcp-config", `${HARNESS_DIR}/claude/mcp.json`, "--strict-mcp-config"],
    env: {
      CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS: String(g.max_subagents),
      CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: String(g.max_depth),
      ...(p.layers.d.some((h) => h.event === "stop") ? { CLAUDE_CODE_STOP_HOOK_BLOCK_CAP: "3" } : {}),
    },
    enforced_by_harness: enforced,
    unsupported,
  };
}
