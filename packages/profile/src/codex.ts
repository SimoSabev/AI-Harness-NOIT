import type { HarnessProfile, HookSpec, Materialized } from "@mandat/contract";
import { HARNESS_ALWAYS, HOOKS, harnessHooks, instructions, policyJson, rulesFor } from "./common.js";
import type { CompileCtx, Files } from "./common.js";
import { RULES, ruleKind } from "./rules.js";

// v5 т. 4.1 [Ф openai-codex.md §2, §4–§6 @ c260087]: CODEX_HOME (tmpfs) is seeded from /m/in/harness/codex; the worker
// hashes the seed after the run (SH2-CX). [НП] the exact hooks.json shape and the skills path → the live SH2-CX.
export const CODEX_HOME_DIR = "/m/codex-home";
const EVENT: Record<HookSpec["event"], string> = { pre_tool: "pre_tool_use", post_tool: "post_tool_use", stop: "stop", subagent_stop: "subagent_stop", session_start: "session_start" };
const str = (s: string) => JSON.stringify(s);
const multi = (s: string) => `"""\n${s.replace(/\\/g, "\\\\").replace(/"""/g, '\\"\\"\\"')}\n"""`;

export function compileCodex(p: HarnessProfile, ctx: CompileCtx): Materialized {
  const rules = rulesFor(p, ctx.subjects);
  const toml: string[] = [
    'approval_policy = "never"',
    'sandbox_mode = "workspace-write"',
    "project_doc_max_bytes = 0",
    `developer_instructions = ${multi(instructions(p))}`,
    "",
    "[sandbox_workspace_write]",
    'writable_roots = ["/m/work"]',
    "network_access = false",
    "",
  ];
  for (const m of p.layers.e.mcp) {
    toml.push(`[mcp_servers.${m.name}]`, `url = ${str(m.transport === "http" && m.url ? m.url : `http://egress-gate/mcp/${m.name}`)}`);
    if (m.enabled_tools) toml.push(`enabled_tools = [${m.enabled_tools.map(str).join(", ")}]`);
    toml.push("");
  }
  toml.push("[agents]", `max_concurrent_threads_per_session = ${p.layers.g.max_subagents}`, "");
  for (const r of p.layers.f.roles) toml.push(`[agents.${r.role}]`, `config_file = ${str(`agents/${r.role}.toml`)}`, "");
  const hooks: Record<string, { command: string[]; matcher?: string }[]> = {};
  for (const h of harnessHooks(p)) (hooks[EVENT[h.event]] ??= []).push({ command: ["node", `${HOOKS}/${h.script}.mjs`, ...Object.entries(h.args).map(([k, v]) => `--${k}=${v}`)], ...(h.matcher ? { matcher: h.matcher } : {}) });
  const files: Files = [
    { path: "codex/config.toml", bytes: toml.join("\n"), mode: "0444" },
    { path: "codex/hooks.json", bytes: JSON.stringify({ hooks }, null, 2) + "\n", mode: "0444" },
    { path: "policy.json", bytes: policyJson(p, ctx), mode: "0444" },
    { path: "instructions.md", bytes: instructions(p), mode: "0444" },
  ];
  for (const r of p.layers.f.roles) files.push({ path: `codex/agents/${r.role}.toml`, bytes: [`model = ${str(r.model)}`, `developer_instructions = ${str(r.description)}`, ""].join("\n"), mode: "0444" });
  const unsupported: Materialized["unsupported"] = [];
  for (const s of p.layers.e.skills) {
    const text = ctx.skills?.[s.name];
    if (text) files.push({ path: `codex/skills/${s.name}/SKILL.md`, bytes: text, mode: "0444" });
    else unsupported.push({ rule: `skill:${s.name}`, why: "no approved content for this skill in the catalog" });
  }
  for (const r of rules.filter((x) => RULES[ruleKind(x.tool)].codex === "unsupported")) unsupported.push({ rule: r.tool, why: "Codex has no rule of this kind; the harness cannot see it either" });
  const enforced = [
    ...rules.filter((r) => RULES[ruleKind(r.tool)].codex === "harness").map((r) => ({ rule: r.tool, why: ruleKind(r.tool) === "net" ? "the egress gate allows only the declared hosts and routes" : "the workspace-write sandbox + D4 after the export" })),
    ...HARNESS_ALWAYS,
    { rule: "codex config changed by the agent", why: "the worker hashes the seeded CODEX_HOME after the run; a difference = security_event config_change + UNKNOWN" },
  ];
  return {
    files: files.sort((a, b) => (a.path < b.path ? -1 : 1)),
    argv: ["-c", 'sandbox_mode="workspace-write"', "-c", 'approval_policy="never"', "-c", "project_doc_max_bytes=0"],
    env: { CODEX_HOME: CODEX_HOME_DIR },
    enforced_by_harness: enforced,
    unsupported,
  };
}
