import type { CompileTarget } from "@mandat/contract";

// v5 т. 4.1: how each kind of rule reaches each agent — natively in the agent's own config, enforced by the harness
// (gate, D3/D4, export) or not at all (yet). The compiler and the UI ("Preview for Claude Code / Codex") read this table.
export type Support = "native" | "harness" | "unsupported";
export type RuleKind = "bash" | "path:write" | "path:read" | "mcp" | "net" | "skill" | "builtin" | "mandat" | "hooks" | "subagents" | "mcp_servers" | "skills" | "instructions";
export const RULES: Record<RuleKind, Record<CompileTarget, Support>> = {
  bash: { claude: "native", codex: "native", gemini: "harness", local: "harness" },
  "path:write": { claude: "native", codex: "harness", gemini: "harness", local: "harness" },
  "path:read": { claude: "native", codex: "unsupported", gemini: "unsupported", local: "unsupported" },
  mcp: { claude: "native", codex: "native", gemini: "unsupported", local: "unsupported" },
  net: { claude: "harness", codex: "harness", gemini: "harness", local: "harness" },
  skill: { claude: "unsupported", codex: "unsupported", gemini: "unsupported", local: "unsupported" },
  builtin: { claude: "native", codex: "unsupported", gemini: "unsupported", local: "unsupported" },
  mandat: { claude: "native", codex: "native", gemini: "unsupported", local: "unsupported" },
  hooks: { claude: "native", codex: "native", gemini: "unsupported", local: "unsupported" },
  subagents: { claude: "native", codex: "native", gemini: "unsupported", local: "unsupported" },
  mcp_servers: { claude: "native", codex: "native", gemini: "unsupported", local: "unsupported" },
  skills: { claude: "native", codex: "native", gemini: "unsupported", local: "unsupported" },
  instructions: { claude: "native", codex: "native", gemini: "native", local: "native" },
};

export function ruleKind(pattern: string): RuleKind {
  if (pattern.startsWith("path:write:")) return "path:write";
  if (pattern.startsWith("path:read:")) return "path:read";
  return pattern.slice(0, pattern.indexOf(":")) as RuleKind;
}
const body = (pattern: string) => pattern.slice(pattern.indexOf(":") + 1);

/** A tool pattern as Claude Code permission rules ([Ф] code.claude.com/docs/en/settings, 22.10.2026). */
export function claudeRule(pattern: string): string[] {
  const k = ruleKind(pattern);
  const b = body(pattern);
  switch (k) {
    case "bash":
      return [`Bash(${b})`];
    case "path:write":
      return [`Edit(${b.slice("write:".length)})`, `Write(${b.slice("write:".length)})`];
    case "path:read":
      return [`Read(${b.slice("read:".length)})`];
    case "mcp": {
      const [server = "", tool = "*"] = b.split(/\.(.*)/s);
      return [tool === "*" || tool === "" ? `mcp__${server}` : `mcp__${server}__${tool}`];
    }
    case "mandat":
      return [b === "*" ? "mcp__mandat" : `mcp__mandat__${b}`];
    case "net":
      return [`WebFetch(domain:${b})`];
    case "builtin":
      return [b];
    default:
      return [];
  }
}

/** A tool pattern as the Claude tool name a subagent may use (agents/<role>.md `tools`). */
export function claudeToolName(pattern: string): string[] {
  const k = ruleKind(pattern);
  if (k === "path:read") return ["Read", "Grep", "Glob"];
  if (k === "path:write") return ["Edit", "Write"];
  if (k === "bash") return ["Bash"];
  return claudeRule(pattern);
}
