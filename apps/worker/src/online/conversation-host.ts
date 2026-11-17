import { readFileSync } from "node:fs";
import { parseAgentRef } from "@mandat/contract";
import { cliModel, fakeModel, proxyModel } from "@mandat/research";
import type { CliExec, ModelClient, RouterChannel } from "@mandat/research";
import { runToken } from "./research-host.js";

// D-531 (E10а ф. 1): the model of a conversation on this computer, picked by the agent of the task box. A key or a saved
// connection goes through llm-proxy with the conversation's mdt_ token (budget and expiry; the key never leaves the
// proxy, AGENTS.md rule 2) — no container. A subscription is the unchanged Claude Code CLI in its small profile
// container (D-295), the only legal way to use it. The demo agents answer from a script (offline, no key).

export interface HostChatOptions {
  /** the proxy's inference port on loopback and its secret (null = no proxy: keys and connections cannot answer) */
  proxy: { url: string; secretPath: string } | null;
  /** a subscription profile's CLI call in its container (null = not available on this host) */
  profileExec: ((profile: string, argv: string[], stdin: string, signal?: AbortSignal) => Promise<string>) | null;
}
export interface ChatRoute {
  id: string;
  agent: string;
  model: string | null;
  budgetUsd: number;
  /** unix seconds */
  expiresAt: number;
}
export type ChatModelChoice = { ok: true; client: ModelClient } | { ok: false; why: string };

const channel = (r: ChatRoute, kind: RouterChannel["kind"], model: string): RouterChannel => ({ id: `chat:${r.agent}`, label: r.agent, kind, model, enabled: true, health: "ok", quality: 0.8, cost: 0.5 });

/** the scripted model of the demo agents: it proposes a brief from the first message, so the whole flow runs offline */
export function demoChatModel(r: ChatRoute): ModelClient {
  return fakeModel(channel(r, "local", "demo"), (q) => {
    const first = /\[human\] (.{1,300})/.exec(q.user)?.[1]?.trim() ?? "the change";
    return JSON.stringify({ say: "Here is how I understood it. Press Start work when it looks right.", call: { tool: "propose_brief", brief: { goal: first, touches: [], avoid: ["the tests"], done_when: ["the project's tests pass"] } } });
  });
}

export function chatModelFor(o: HostChatOptions, r: ChatRoute): ChatModelChoice {
  const ref = parseAgentRef(r.agent);
  if (!ref) return { ok: false, why: "unknown agent" };
  if (!("via" in ref)) return { ok: true, client: demoChatModel(r) };
  if (r.model === null) return { ok: false, why: "no model chosen" };
  if (ref.via.kind === "account") {
    if (ref.cli !== "claude") return { ok: false, why: `a conversation with a ${ref.cli} subscription is not supported yet` };
    if (!o.profileExec) return { ok: false, why: "subscriptions are not available on this computer" };
    const run = o.profileExec;
    const profile = ref.via.name;
    const exec: CliExec = (argv, stdin, signal) => run(profile, argv, stdin, signal);
    return { ok: true, client: cliModel({ channel: channel(r, "cli_profile", r.model), exec }) };
  }
  if (ref.cli !== "claude" && ref.cli !== "codex") return { ok: false, why: `a conversation through ${ref.cli} is not supported yet` };
  if (!o.proxy) return { ok: false, why: "the proxy is not running" };
  const provider = ref.cli === "codex" ? "openai" : "anthropic";
  // one run id for the whole conversation: the proxy counts its spend against one budget (n = 0)
  const token = runToken(readFileSync(o.proxy.secretPath), { id: r.id, n: 0, expiresAt: r.expiresAt, usd: r.budgetUsd, provider, ...(ref.via.kind === "connection" ? { upstream: ref.via.id } : {}) });
  return { ok: true, client: proxyModel({ channel: channel(r, "api_key", r.model), baseUrl: o.proxy.url, token, provider }) };
}
