import type { GateRoute, GateTunnel } from "@mandat/contract";
import type { TaskUsage } from "@mandat/llm-proxy";
import type { Channel } from "./channel.js";

// D-295: a subscription profile. The unmodified CLI in the sandbox uses its own login (the profile volume); the harness
// mints nothing and holds nothing. The gate opens only these CONNECT tunnels (TLS end to end): the API and the token
// refresh hosts [НП: refresh host; both are listed until a live run shows which one Claude Code uses].
export const ANTHROPIC_TUNNELS: readonly GateTunnel[] = [
  { host: "api.anthropic.com", port: 443 },
  { host: "console.anthropic.com", port: 443 },
  { host: "platform.claude.com", port: 443 },
];

/** D-392: Codex with a ChatGPT login [НП: the exact hosts — the Responses backend, the token refresh and the API; listed
 * until a live run shows which ones Codex uses (docs/setup/local-live-checklist.md)]. */
export const OPENAI_TUNNELS: readonly GateTunnel[] = [
  { host: "chatgpt.com", port: 443 },
  { host: "auth.openai.com", port: 443 },
  { host: "api.openai.com", port: 443 },
];

const ZERO: TaskUsage = { usd: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, requests: 0, budgetStop: false, limit: null, authFailed: false };
const HELLO: GateRoute = { id: "hello", method: "HEAD", match: { kind: "exact", path: "/api/hello" }, upstream: "local_ok" };

export function profileChannel(o: { label: string; model: string; profileName: string; provider?: "anthropic" | "openai" }): Channel {
  const provider = o.provider ?? "anthropic";
  return {
    label: o.label,
    kind: "cli_profile",
    provider,
    model: o.model,
    profileName: o.profileName,
    issueTaskCredential() {
      return Promise.reject(new Error("a profile channel has no task credential (D-295)"));
    },
    revokeTaskCredential: () => Promise.resolve(),
    usage: () => Promise.resolve({ ...ZERO }),
    sandboxEnv() {
      throw new Error("a profile channel has no sandbox credential (D-295)");
    },
    gateRoutes: () => [{ ...HELLO, match: { ...HELLO.match } }],
    gateTunnels: () => (provider === "openai" ? OPENAI_TUNNELS : ANTHROPIC_TUNNELS).map((t) => ({ ...t })),
  };
}
