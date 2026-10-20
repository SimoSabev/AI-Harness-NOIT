import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { MandatError, sha256Tag } from "@mandat/contract";
import type { ChannelRef, GateRoute } from "@mandat/contract";
import { adminBearer, mintTaskToken } from "@mandat/llm-proxy";
import type { TaskUsage } from "@mandat/llm-proxy";
import type { Channel } from "./channel.js";

export const API_KEY_ROUTES: readonly GateRoute[] = [
  { id: "llm-messages", method: "POST", match: { kind: "exact", path: "/v1/messages" }, upstream: "llm_proxy" },
  { id: "llm-count", method: "POST", match: { kind: "exact", path: "/v1/messages/count_tokens" }, upstream: "llm_proxy" },
  { id: "hello", method: "HEAD", match: { kind: "exact", path: "/api/hello" }, upstream: "local_ok" },
];

export function apiKeyChannel(o: {
  label: "anthropic-key-main";
  model: "claude-sonnet-5-5";
  proxyAdminUrl: string;
  secretPath: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}): Channel {
  const f = o.fetchImpl ?? fetch;
  const secret = (): Buffer => readFileSync(o.secretPath);
  const auth = (): Record<string, string> => ({ authorization: `Bearer ${adminBearer(secret())}` });
  return {
    label: o.label,
    kind: "api_key",
    provider: "anthropic",
    model: o.model,
    issueTaskCredential(r) {
      const now = (o.now ?? (() => new Date()))();
      const e = Math.floor(now.getTime() / 1000) + r.ttlMin * 60;
      const token = mintTaskToken(secret(), { t: r.taskId, r: r.runId, a: 1, e, b: r.budgetUsd, n: randomBytes(8).toString("hex") });
      return Promise.resolve({ token, tokenHash: sha256Tag(token), expiresAt: new Date(e * 1000).toISOString() });
    },
    async revokeTaskCredential(runId) {
      const res = await f(new URL("/admin/revoke", o.proxyAdminUrl), {
        method: "POST",
        headers: { ...auth(), "content-type": "application/json" },
        body: JSON.stringify({ run_id: runId }),
      });
      if (res.status !== 204) throw new MandatError("E_PROXY_DOWN", `revoke failed: HTTP ${res.status}`);
    },
    async usage(runId) {
      const res = await f(new URL(`/admin/usage?run_id=${encodeURIComponent(runId)}`, o.proxyAdminUrl), { headers: auth() });
      if (res.status !== 200) throw new MandatError("E_PROXY_DOWN", `usage failed: HTTP ${res.status}`);
      return (await res.json()) as TaskUsage;
    },
    sandboxEnv(c) {
      return { ANTHROPIC_BASE_URL: "http://egress-gate", ANTHROPIC_API_KEY: c.token };
    },
    gateRoutes() {
      return API_KEY_ROUTES.map((r) => ({ ...r, match: { ...r.match } }));
    },
  };
}

/** E0: only api_key; cli_profile and local → E_CHANNEL_UNSUPPORTED. */
export function channelFor(ref: ChannelRef, o: { proxyAdminUrl: string; secretPath: string }): Channel {
  if (ref.kind !== "api_key") throw new MandatError("E_CHANNEL_UNSUPPORTED", `channel kind ${ref.kind} is not supported in E0`);
  if (ref.label !== "anthropic-key-main" || ref.model !== "claude-sonnet-5-5") {
    throw new MandatError("E_CHANNEL_UNSUPPORTED", `unsupported channel ${ref.label}/${ref.model}`);
  }
  return apiKeyChannel({ label: ref.label, model: ref.model, ...o });
}
