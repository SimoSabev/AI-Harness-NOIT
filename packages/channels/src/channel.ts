import type { AgentCli, ChannelRef, GateRoute, GateTunnel } from "@mandat/contract";
import type { TaskUsage } from "@mandat/llm-proxy";

export type { TaskUsage };
export interface TaskCredential {
  token: string; // mdt_…
  tokenHash: string; // sha256Tag(token)
  expiresAt: string;
}
// mdt_… only; D-424: Gemini CLI reads its base URL from GOOGLE_GEMINI_BASE_URL
export type SandboxChannelEnv = { ANTHROPIC_BASE_URL: "http://egress-gate"; ANTHROPIC_API_KEY: string } | { OPENAI_API_KEY: string } | { GEMINI_API_KEY: string; GOOGLE_GEMINI_BASE_URL: "http://egress-gate" };
export interface Channel {
  readonly label: string;
  readonly kind: ChannelRef["kind"];
  readonly provider: "anthropic" | "openai" | "gemini";
  readonly model: string;
  issueTaskCredential(r: { taskId: string; runId: string; attempt: 1; budgetUsd: number; ttlMin: number }): Promise<TaskCredential>;
  revokeTaskCredential(runId: string): Promise<void>;
  usage(runId: string): Promise<TaskUsage>;
  sandboxEnv(c: TaskCredential): SandboxChannelEnv;
  /** Routes for gate phase "agent". */
  gateRoutes(): GateRoute[];
  /** D-295: a subscription profile channel — the profile's name (volume mandat-profile-claude-<name>) and its tunnels */
  readonly profileName?: string;
  /** D-464: the subscription CLI of a profile channel (its volume is mandat-profile-<cli>-<profileName>) */
  readonly cli?: AgentCli;
  gateTunnels?(): GateTunnel[];
}
