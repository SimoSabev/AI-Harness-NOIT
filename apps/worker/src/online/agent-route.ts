import { ModelId, PROVIDERS, connectionLabel, parseAgentRef } from "@mandat/contract";
import type { ChannelRef, Connection } from "@mandat/contract";
import { ALLOWED_MODELS } from "@mandat/llm-proxy";

// D-392: what runs for the agent of a task and its picked model. A fixed `ref` (subscription, saved connection) skips the
// org's channel selection; `ref: null` = the provider key, chosen by selectChannel, with the picked `model` if it is valid.
export type Route =
  | { ok: true; run: "claude" | "codex" | `fake:${string}` | `fake-codex:${string}`; ref: ChannelRef; account: string | null; local: boolean }
  | { ok: true; run: "claude" | "codex" | `fake:${string}` | `fake-codex:${string}`; ref: null; model: string | null; account: null; local: false }
  | { ok: false; reason: "unknown_agent" | "no_connection" };

const SUB_DEFAULT = { claude: "claude-sonnet-5-5", codex: "gpt-5-codex" } as const;
const pick = (picked: string | null, models: readonly string[], fallback: string): string => (picked !== null && models.includes(picked) ? picked : fallback);

export function routeOf(agent: string, model: string | null, conns: readonly Connection[]): Route {
  const r = parseAgentRef(agent);
  if (r === null) return { ok: false, reason: "unknown_agent" };
  const picked = model !== null && ModelId.safeParse(model).success ? model : null;
  if (!("via" in r)) return { ok: true, run: `${r.cli}:${r.scenario}`, ref: null, model: null, account: null, local: false };
  if (r.via.kind === "key") {
    const valid = picked !== null && (r.cli === "codex" || ALLOWED_MODELS.includes(picked)) ? picked : null;
    return { ok: true, run: r.cli, ref: null, model: valid, account: null, local: false };
  }
  if (r.via.kind === "account") {
    const name = r.via.name;
    const saved = conns.find((c) => c.id === name && PROVIDERS[c.provider].kind === "subscription");
    const m = saved ? pick(picked, saved.models, saved.defaultModel) : (picked ?? SUB_DEFAULT[r.cli]);
    return { ok: true, run: r.cli, ref: { label: `${r.cli}-profile-${name}`, kind: "cli_profile", model: m }, account: name, local: false };
  }
  const id = r.via.id;
  const c = conns.find((x) => x.id === id);
  const info = c ? PROVIDERS[c.provider] : null;
  if (!c || !info || info.kind === "subscription" || (info.auth !== "none" && !c.hasKey)) return { ok: false, reason: "no_connection" };
  const local = info.kind === "local";
  return { ok: true, run: r.cli, ref: { label: connectionLabel(id), kind: local ? "local" : "api_key", model: pick(picked, c.models, c.defaultModel) }, account: null, local };
}
