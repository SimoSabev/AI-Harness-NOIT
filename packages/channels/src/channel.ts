import type { ChannelRef, GateRoute } from "@mandat/contract";
import type { TaskUsage } from "@mandat/llm-proxy";

export type { TaskUsage };
export interface TaskCredential {
  token: string; // mdt_…
  tokenHash: string; // sha256Tag(token)
  expiresAt: string;
}
export interface SandboxChannelEnv {
  ANTHROPIC_BASE_URL: "http://egress-gate";
  ANTHROPIC_API_KEY: string; // mdt_…
}
export interface Channel {
  readonly label: string;
  readonly kind: ChannelRef["kind"];
  readonly provider: "anthropic";
  readonly model: string;
  issueTaskCredential(r: { taskId: string; runId: string; attempt: 1; budgetUsd: number; ttlMin: number }): Promise<TaskCredential>;
  revokeTaskCredential(runId: string): Promise<void>;
  usage(runId: string): Promise<TaskUsage>;
  sandboxEnv(c: TaskCredential): SandboxChannelEnv;
  /** Routes for gate phase "agent". */
  gateRoutes(): GateRoute[];
}
