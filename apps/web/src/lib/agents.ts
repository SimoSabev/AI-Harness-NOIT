import { PROVIDERS, SUBSCRIPTIONS, agentFor, canSignIn, parseAgentRef } from "@mandat/contract";
import type { Connection, KeyCli, ProviderId } from "@mandat/contract";
import { translate } from "../i18n/t";
import type { Lang } from "../i18n/t";

// D-292: who can do a task. Real agents need their key in the proxy (`pnpm mandat proxy start`); the demo agents run
// a fixed change in the same sandbox and get a real verdict, so the whole loop works without any key.
export interface AgentOption { id: string; needsKey: boolean }

/** The label and hint of each agent are in the catalog (`agent.<id>.label`, `agent.<id>.hint`, E7f). */
export const AGENTS = [
  { id: "claude", needsKey: true },
  { id: "codex", needsKey: true },
  { id: "fake:honest-fix", needsKey: false },
  { id: "fake:delete-test", needsKey: false },
  { id: "fake:skip-test", needsKey: false },
  { id: "fake:untested-extra", needsKey: false },
] as const satisfies readonly AgentOption[];

export type AgentId = (typeof AGENTS)[number]["id"];
export const AGENT_IDS = AGENTS.map((a) => a.id) as [AgentId, ...AgentId[]];

/** D-295: Claude Code with a subscription account (`pnpm mandat login --name <account>`); D-393: Codex with ChatGPT. */
export const ACCOUNT_AGENT = /^(claude|codex)@[a-z0-9][a-z0-9-]{0,31}$/;
/** D-393: a CLI through a saved connection of `mandat local` (DeepSeek, Kimi, Z.ai, Ollama, a custom endpoint…). */
export const CONNECTION_AGENT = /^(claude|codex|gemini)\+[a-z0-9][a-z0-9-]{0,31}$/;

const isAgentId = (id: string): id is AgentId => AGENTS.some((a) => a.id === id);

export function agentLabel(id: string, lang: Lang = "en", connLabel?: string): string {
  const r = parseAgentRef(id);
  if (r && "via" in r && r.via.kind === "account") return translate(lang, r.cli === "codex" ? "agent.codexAccount" : "agent.account", { name: r.via.name });
  if (r && "via" in r && r.via.kind === "connection") return translate(lang, r.cli === "codex" ? "agent.codexVia" : r.cli === "gemini" ? "agent.geminiVia" : "agent.via", { name: connLabel ?? r.via.id });
  return isAgentId(id) ? translate(lang, `agent.${id}.label`) : id;
}

export function agentHint(id: string, lang: Lang = "en"): string {
  return isAgentId(id) ? translate(lang, `agent.${id}.hint`) : "";
}

const KEY_OF: Partial<Record<AgentId, string>> = { claude: "anthropic", codex: "openai" };

/** D-384: who the new-task box offers — the signed-in accounts, then each agent whose key is set; the demo agents only
 * with the demo switch (`MANDAT_DEMO_AGENTS=1`), so a newcomer never runs a scripted change by accident. */
export function agentChoices(o: { accounts: string[]; keys: string[]; demo: boolean }): string[] {
  return [
    ...o.accounts,
    ...AGENTS.filter((a) => (a.needsKey ? o.keys.includes(KEY_OF[a.id] ?? "") : o.demo)).map((a) => a.id),
  ];
}

/** D-393: one way to run a task, with the models it can use (the task box, the default on the first-run page). */
export interface TaskAgent { id: string; label: string; models: string[]; defaultModel: string | null; local: boolean; /** D-610: an account out of its subscription limit, until when (ISO) */ limitedUntil?: string | null }
const catalog = (p: keyof typeof PROVIDERS): string[] => PROVIDERS[p].models.map((m) => m.id);
const rec = (p: keyof typeof PROVIDERS): string | null => PROVIDERS[p].models.find((m) => m.recommended)?.id ?? PROVIDERS[p].models[0]?.id ?? null;

/** Signed-in accounts, the provider keys, every usable saved connection, then (with the switch) the demo agents; the remembered default first. */
export function taskAgents(o: { accounts: { agent: string; loggedIn: boolean; email?: string | null }[]; keys: string[]; connections: Connection[]; demo: boolean; preferred: string | null; limits?: Record<string, string> }, lang: Lang): TaskAgent[] {
  const saved = (id: string) => o.connections.find((c) => c.id === id);
  const out: TaskAgent[] = [];
  for (const a of o.accounts.filter((x) => x.loggedIn)) {
    const r = parseAgentRef(a.agent);
    if (!r || !("via" in r) || r.via.kind !== "account") continue;
    // D-460: a signed-in subscription of any provider that can run; its models come from the registry's catalog entry
    const p = canSignIn(r.cli) ? SUBSCRIPTIONS[r.cli].connectionProvider : null;
    if (p === null) continue;
    const c = saved(r.via.name);
    // D-610: whose subscription it is — the account's email when known — and until when it is out of its limit
    const label = a.email ? translate(lang, r.cli === "codex" ? "agent.codexEmail" : "agent.email", { email: a.email }) : agentLabel(a.agent, lang);
    out.push({ id: a.agent, label, models: c ? c.models : catalog(p), defaultModel: c ? c.defaultModel : rec(p), local: false, limitedUntil: o.limits?.[a.agent] ?? null });
  }
  for (const [cli, p] of [["claude", "anthropic"], ["codex", "openai"]] as const) {
    const c = saved(p);
    if (o.keys.includes(p) || c?.hasKey) out.push({ id: cli, label: agentLabel(cli, lang), models: c ? c.models : catalog(p), defaultModel: c ? c.defaultModel : rec(p), local: false });
  }
  for (const c of o.connections) {
    const info = PROVIDERS[c.provider];
    // D-471: the first Anthropic / OpenAI key is the plain `claude` / `codex` above; D-470: no agent → not a choice
    const plain = (c.provider === "anthropic" || c.provider === "openai") && c.id === c.provider;
    if (info.kind === "subscription" || plain || info.agent === null || (info.auth !== "none" && !c.hasKey)) continue;
    const id = `${info.agent}+${c.id}`;
    out.push({ id, label: agentLabel(id, lang, c.label), models: c.models, defaultModel: c.defaultModel, local: info.kind === "local" });
  }
  if (o.demo) for (const a of AGENTS.filter((x) => !x.needsKey)) out.push({ id: a.id, label: agentLabel(a.id, lang), models: [], defaultModel: null, local: false });
  const i = out.findIndex((a) => a.id === o.preferred);
  return i > 0 ? [out[i] as TaskAgent, ...out.slice(0, i), ...out.slice(i + 1)] : out;
}

/** the task type of the task box: a real agent works without limits ("free", D-360), the demo agents' scenarios are bug fixes */
export const taskTypeFor = (agent: string): "free" | "bugfix" => (agent.startsWith("fake") ? "bugfix" : "free");

/** D-473: which agent can use a provider's key (Claude Code, Codex, Gemini CLI) — null: none here yet (shown honestly). */
export const apiKeyUse = (p: ProviderId): KeyCli | null => agentFor(p);
