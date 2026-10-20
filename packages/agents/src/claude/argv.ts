export interface ClaudeArgvOptions {
  prompt: string;
  model: string;
  budgetUsd: number;
  appendSystemPromptFile: string;
  memory: { enabled: false } | { enabled: true; mcpConfigPath: string; toolNames: string[] };
  steering: { enabled: false } | { enabled: true; sessionId: string };
}

const ALLOWED = ["Read", "Edit", "Write", "Bash(npx vitest *)"];

/** 6.7 (D-021, D-023, D-024): one argv element per comma list; the task text right after -p. */
export function buildClaudeArgv(o: ClaudeArgvOptions): string[] {
  const allowed = [...ALLOWED, ...(o.memory.enabled ? o.memory.toolNames : [])].join(",");
  const argv = ["claude", "--bare", "-p"];
  if (!o.steering.enabled) argv.push(o.prompt);
  argv.push(
    "--output-format", "stream-json", "--verbose",
    "--model", o.model,
    "--permission-mode", "dontAsk",
    "--permission-prompts", "none",
    "--tools", "Bash,Read,Edit,Write",
    "--allowedTools", allowed,
  );
  if (o.memory.enabled) argv.push("--mcp-config", o.memory.mcpConfigPath, "--strict-mcp-config");
  else argv.push("--disallowedTools", "mcp__*");
  argv.push(
    "--setting-sources", "user",
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
