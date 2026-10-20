export interface AgentRunContext {
  runId: string;
  taskId: string;
  prompt: string;
  model: string;
  budgetUsd: number;
  contractFile: "/m/in/contract.txt";
  workdir: "/m/work";
  notesPath: "/m/out/notes.txt";
}
export interface SandboxChannelEnv {
  ANTHROPIC_BASE_URL: "http://egress-gate";
  ANTHROPIC_API_KEY: string; // mdt_…
}
/** env holds ONLY the secret values (they go to the docker CLI env, D-043); public env comes from envForPhase. */
export interface AgentLaunchSpec {
  argv: string[];
  env: Record<string, string>;
  stdin: "closed" | "pipe";
}
export type AgentEvent =
  | { type: "init"; sessionId: string; model: string; tools: string[]; mcpServers: { name: string; status: string }[]; capabilities: string[] }
  | { type: "assistant_text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; toolUseId: string; isError: boolean }
  | { type: "api_retry"; attempt: number; errorStatus: number | null; error: string }
  | { type: "permission_denied"; tool: string }
  | { type: "user_echo"; text: string }
  | { type: "result"; subtype: string; isError: boolean; totalCostUsd: number | null; numTurns: number | null }
  | { type: "unparsed"; raw: string };
export interface AgentAdapter {
  readonly id: string;
  readonly supportsSteering: boolean;
  launch(ctx: AgentRunContext, channel: SandboxChannelEnv, canary: { name: "AWS_SECRET_ACCESS_KEY"; value: string }): AgentLaunchSpec;
  parseLine(line: string): AgentEvent[];
}
export const FAKE_SCENARIOS = [
  "honest-fix", "skip-test", "delete-test", "delete-and-add-empty", "echo-pass", "out-of-contract", "partial-fix", "it-only",
  "r5-symlink", "r5-hardlink", "r5-gitdir", "r8-canary-leak", "r8-keyscan", "r14-netprobe", "touch-config",
] as const;
export type FakeScenario = (typeof FAKE_SCENARIOS)[number];
export const isFakeScenario = (s: string): s is FakeScenario => (FAKE_SCENARIOS as readonly string[]).includes(s);
