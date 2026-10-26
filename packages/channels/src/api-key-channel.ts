import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { MandatError, sha256Tag } from "@mandat/contract";
import type { ChannelRef, GateRoute } from "@mandat/contract";
import { ALLOWED_MODELS, adminBearer, mintTaskToken } from "@mandat/llm-proxy";
import type { TaskUsage } from "@mandat/llm-proxy";
import type { Channel } from "./channel.js";
import { profileChannel } from "./profile-channel.js";

export const API_KEY_ROUTES: readonly GateRoute[] = [
  { id: "llm-messages", method: "POST", match: { kind: "exact", path: "/v1/messages" }, upstream: "llm_proxy" },
  { id: "llm-count", method: "POST", match: { kind: "exact", path: "/v1/messages/count_tokens" }, upstream: "llm_proxy" },
  { id: "hello", method: "HEAD", match: { kind: "exact", path: "/api/hello" }, upstream: "local_ok" },
];

/** E3в: the Responses API route of an openai channel (Codex); websocket upgrades are refused by the gate and the proxy. */
export const OPENAI_KEY_ROUTES: readonly GateRoute[] = [
  { id: "llm-responses", method: "POST", match: { kind: "exact", path: "/v1/responses" }, upstream: "llm_proxy" },
  { id: "hello", method: "HEAD", match: { kind: "exact", path: "/api/hello" }, upstream: "local_ok" },
];

export function apiKeyChannel(o: {
  label: string;
  model: string;
  provider?: "anthropic" | "openai";
  /** D-392: the saved connection (proxy upstream) the tokens of this channel are for */
  upstream?: string;
  kind?: "api_key" | "local";
  proxyAdminUrl: string;
  secretPath: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}): Channel {
  const f = o.fetchImpl ?? fetch;
  const secret = (): Buffer => readFileSync(o.secretPath);
  const auth = (): Record<string, string> => ({ authorization: `Bearer ${adminBearer(secret())}` });
  const provider = o.provider ?? "anthropic";
  return {
    label: o.label,
    kind: o.kind ?? "api_key",
    provider,
    model: o.model,
    issueTaskCredential(r) {
      const now = (o.now ?? (() => new Date()))();
      const e = Math.floor(now.getTime() / 1000) + r.ttlMin * 60;
      const token = mintTaskToken(secret(), { t: r.taskId, r: r.runId, a: 1, e, b: r.budgetUsd, n: randomBytes(8).toString("hex"), ...(provider === "openai" ? { p: "openai" as const } : {}), ...(o.upstream !== undefined ? { u: o.upstream } : {}) });
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
      return provider === "openai" ? { OPENAI_API_KEY: c.token } : { ANTHROPIC_BASE_URL: "http://egress-gate", ANTHROPIC_API_KEY: c.token };
    },
    gateRoutes() {
      return (provider === "openai" ? OPENAI_KEY_ROUTES : API_KEY_ROUTES).map((r) => ({ ...r, match: { ...r.match } }));
    },
  };
}

/** E0: only api_key; cli_profile and local → E_CHANNEL_UNSUPPORTED. */
export function channelFor(ref: ChannelRef, opts: { proxyAdminUrl: string; secretPath: string; provider?: "anthropic" | "openai" }): Channel {
  const { provider, ...o } = opts;
  // D-295: claude-profile-<name> → the subscription login in the profile volume of that name; D-392: codex-profile-<name>
  const prof = ref.kind === "cli_profile" ? /^(claude|codex)-profile-([a-z0-9][a-z0-9-]{0,31})$/.exec(ref.label) : null;
  if (prof?.[2]) return profileChannel({ label: ref.label, model: ref.model, profileName: prof[2], provider: prof[1] === "codex" ? "openai" : "anthropic" });
  // D-392: a saved connection — its tokens name the proxy upstream; the wire is the agent's (Claude Code / Codex)
  const conn = ref.kind !== "cli_profile" ? /^conn-([a-z0-9][a-z0-9-]{0,31})$/.exec(ref.label) : null;
  if (conn?.[1]) return apiKeyChannel({ label: ref.label, model: ref.model, kind: ref.kind === "local" ? "local" : "api_key", provider: provider ?? "anthropic", upstream: conn[1], ...o });
  if (ref.kind !== "api_key") throw new MandatError("E_CHANNEL_UNSUPPORTED", `channel kind ${ref.kind} is not supported in E0`);
  // E3в: anthropic-key-* with the E0 model; openai-key-* (Codex, Responses API; model and price from Simo [НП])
  if (/^anthropic-key-(main|demo)$/.test(ref.label) && ALLOWED_MODELS.includes(ref.model)) return apiKeyChannel({ label: ref.label, model: ref.model, ...o });
  if (/^openai-key-(main|demo)$/.test(ref.label)) return apiKeyChannel({ label: ref.label, model: ref.model, provider: "openai", ...o });
  throw new MandatError("E_CHANNEL_UNSUPPORTED", `unsupported channel ${ref.label}/${ref.model}`);
}
