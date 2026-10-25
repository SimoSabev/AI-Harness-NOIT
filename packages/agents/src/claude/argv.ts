export interface ClaudeArgvOptions {
  prompt: string;
  model: string;
  budgetUsd: number;
  appendSystemPromptFile: string;
  memory: { enabled: false } | { enabled: true; mcpConfigPath: string; toolNames: string[] };
  steering: { enabled: false } | { enabled: true; sessionId: string };
  /** v5 SH2 (D-312): the harness control layer; absent → the E0 argv unchanged. */
  control?: ClaudeControl | undefined;
}
/**
 * A: today's `--bare` argv + `--settings` (bare skips the auto-discovery of hooks, skills, agents, MCP and CLAUDE.md; whether
 * hooks from an explicit --settings still run is [НП] → SH2 live). B: no `--bare`; user settings only, the harness settings
 * file, strict MCP from the harness. B is the only option for a subscription: bare mode never reads OAuth (D-342).
 */
export interface ClaudeControl {
  variant: "A" | "B";
  settingsFile: string | null;
  mcpConfigFile: string | null;
}
export const CLAUDE_HARNESS_DIR = "/m/in/harness/claude";
export const CLAUDE_HARNESS_SETTINGS = `${CLAUDE_HARNESS_DIR}/settings.json`;

const ALLOWED = ["Read", "Edit", "Write", "Bash(npx vitest *)"];

/** 6.7 (D-021, D-023, D-024): one argv element per comma list; the task text right after -p. */
export function buildClaudeArgv(o: ClaudeArgvOptions): string[] {
  const allowed = [...ALLOWED, ...(o.memory.enabled ? o.memory.toolNames : [])].join(",");
  const bare = o.control?.variant !== "B";
  const argv = bare ? ["claude", "--bare", "-p"] : ["claude", "-p"];
  if (!o.steering.enabled) argv.push(o.prompt);
  argv.push(
    "--output-format", "stream-json", "--verbose",
    "--model", o.model,
    "--permission-mode", "dontAsk",
    "--permission-prompts", "none",
    "--tools", "Bash,Read,Edit,Write",
    "--allowedTools", allowed,
  );
  const mcp = o.memory.enabled ? o.memory.mcpConfigPath : (o.control?.mcpConfigFile ?? null);
  if (mcp) argv.push("--mcp-config", mcp, "--strict-mcp-config");
  else {
    if (!bare) argv.push("--strict-mcp-config"); // no repo .mcp.json without --bare
    argv.push("--disallowedTools", "mcp__*");
  }
  argv.push(
    "--setting-sources", "user",
    ...(o.control?.settingsFile ? ["--settings", o.control.settingsFile] : []),
    "--append-system-prompt-file", o.appendSystemPromptFile,
    "--max-budget-usd", o.budgetUsd.toFixed(2),
    "--no-session-persistence",
  );
  if (o.steering.enabled) argv.push("--input-format", "stream-json", "--replay-user-messages", "--session-id", o.steering.sessionId);
  return argv;
}

/** First stdin line in steering mode. */
export function steeringFirstLine(prompt: string): string {
  return JSON.stringify({ type: "user", message: { role: "user", content: prompt }, parent_tool_use_id: null });
}
