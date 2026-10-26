import { z } from "zod";

// D-392: a "connection" is one way of reaching a model: a subscription (the unmodified CLI with its own login, D-295),
// an API key, a server on this computer, or another endpoint that speaks the Anthropic Messages API (Claude Code) or the
// OpenAI Responses API (Codex). Keys and local servers go through the proxy (the agent gets an mdt_ token only, AGENTS.md
// rule 2); this file carries names, addresses and model ids — never a key value back out.

export const ConnectionId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/);
export type ConnectionId = z.infer<typeof ConnectionId>;

/** The forms providers use: claude-sonnet-5-5, qwen3-coder:30b, moonshotai/kimi-k3, glm-5.2[1m]. Never secret-looking. */
export const ModelId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/@[\]-]{0,127}$/).refine((m) => !/mdt_|sk-ant-/.test(m), "secret-looking model id");
export type ModelId = z.infer<typeof ModelId>;

export const Wire = z.enum(["anthropic", "openai"]);
export type Wire = z.infer<typeof Wire>;
export const ProviderId = z.enum(["claude-sub", "chatgpt-sub", "anthropic", "openai", "deepseek", "kimi", "zai", "ollama", "lmstudio", "custom"]);
export type ProviderId = z.infer<typeof ProviderId>;

/** USD per million tokens (cacheWrite = the 5-minute write). */
export interface Price { input: number; output: number; cacheRead: number; cacheWrite: number }
export interface SuggestedModel { id: string; tier: "best" | "balanced" | "fast"; recommended?: true; price?: Price }
export interface ProviderInfo {
  id: ProviderId;
  kind: "subscription" | "api_key" | "local";
  /** the CLI that runs in the sandbox */
  agent: "claude" | "codex";
  wire: Wire;
  /** null: the person gives the address (custom) or there is none (a subscription goes through its own CONNECT tunnel) */
  baseUrl: string | null;
  auth: "x-api-key" | "bearer" | "none";
  /** where the person gets a key (null: no key) */
  keyPage: string | null;
  docs: string;
  /** the date the docs were read (AGENTS.md rule 9) */
  checked: string;
  /** false = [НП]: the address or the model names come from the provider's docs but no live run has used them yet */
  live: boolean;
  models: SuggestedModel[];
}

const p = (input: number, output: number, cacheRead: number, cacheWrite: number): Price => ({ input, output, cacheRead, cacheWrite });
// platform.claude.com/docs/en/about-claude/pricing (claude-api skill cache of 06.10.2026); the 5-minute write is 1.25 × input
const CLAUDE: SuggestedModel[] = [
  { id: "claude-sonnet-5-5", tier: "balanced", recommended: true, price: p(2, 10, 0.2, 2.5) },
  { id: "claude-opus-5-5", tier: "best", price: p(4, 20, 0.2, 5) },
  { id: "claude-haiku-5-5", tier: "fast", price: p(0.1, 0.5, 0.01, 0.125) },
  { id: "claude-fable-5-1", tier: "best", price: p(10, 50, 0.25, 12.5) },
];

export const PROVIDERS: Readonly<Record<ProviderId, ProviderInfo>> = {
  "claude-sub": { id: "claude-sub", kind: "subscription", agent: "claude", wire: "anthropic", baseUrl: null, auth: "none", keyPage: null, docs: "https://code.claude.com/docs/en/authentication", checked: "2026-10-26", live: true, models: CLAUDE.slice(0, 3).map(({ price: _, ...m }) => m) },
  "chatgpt-sub": { id: "chatgpt-sub", kind: "subscription", agent: "codex", wire: "openai", baseUrl: null, auth: "none", keyPage: null, docs: "https://developers.openai.com/codex/auth", checked: "2026-10-26", live: false, models: [{ id: "gpt-5-codex", tier: "balanced", recommended: true }] },
  anthropic: { id: "anthropic", kind: "api_key", agent: "claude", wire: "anthropic", baseUrl: "https://api.anthropic.com", auth: "x-api-key", keyPage: "https://platform.claude.com/settings/keys", docs: "https://platform.claude.com/docs/en/about-claude/models", checked: "2026-10-26", live: true, models: CLAUDE },
  openai: { id: "openai", kind: "api_key", agent: "codex", wire: "openai", baseUrl: "https://api.openai.com", auth: "bearer", keyPage: "https://platform.openai.com/api-keys", docs: "https://developers.openai.com/codex/auth", checked: "2026-10-26", live: false, models: [{ id: "gpt-5-codex", tier: "balanced", recommended: true }] },
  // api-docs.deepseek.com/guides/anthropic_api: x-api-key; names outside the list → 400
  deepseek: { id: "deepseek", kind: "api_key", agent: "claude", wire: "anthropic", baseUrl: "https://api.deepseek.com/anthropic", auth: "x-api-key", keyPage: "https://platform.deepseek.com/api_keys", docs: "https://api-docs.deepseek.com/guides/anthropic_api", checked: "2026-10-26", live: false, models: [{ id: "deepseek-v4-pro", tier: "best", recommended: true }, { id: "deepseek-flash", tier: "fast" }] },
  // kimi.com/code/docs/en/third-party-tools/claude-code.html: ANTHROPIC_API_KEY (x-api-key), the Kimi Code plan
  kimi: { id: "kimi", kind: "api_key", agent: "claude", wire: "anthropic", baseUrl: "https://api.kimi.ai/coding", auth: "x-api-key", keyPage: "https://www.kimi.com/code", docs: "https://www.kimi.com/code/docs/en/third-party-tools/claude-code.html", checked: "2026-10-26", live: false, models: [{ id: "k3.1-pro", tier: "best", recommended: true }, { id: "k3.1-pro-highspeed", tier: "fast" }] },
  // docs.z.ai/scenario-example/develop-tools/claude: ANTHROPIC_AUTH_TOKEN (bearer), the GLM Coding Plan [НП: model names]
  zai: { id: "zai", kind: "api_key", agent: "claude", wire: "anthropic", baseUrl: "https://api.z.ai/api/anthropic", auth: "bearer", keyPage: "https://z.ai/manage-apikey/apikey-list", docs: "https://docs.z.ai/scenario-example/develop-tools/claude", checked: "2026-10-26", live: false, models: [{ id: "glm-5.2", tier: "best", recommended: true }] },
  // docs.ollama.com/api/anthropic-compatibility: /v1/messages since 01.2026; any token, ignored; no count_tokens
  ollama: { id: "ollama", kind: "local", agent: "claude", wire: "anthropic", baseUrl: "http://127.0.0.1:11434", auth: "none", keyPage: null, docs: "https://docs.ollama.com/api/anthropic-compatibility", checked: "2026-10-26", live: false, models: [{ id: "qwen3-coder", tier: "balanced", recommended: true }] },
  // [НП] LM Studio's Anthropic-compatible endpoint: listed models come from GET /v1/models of the running server
  lmstudio: { id: "lmstudio", kind: "local", agent: "claude", wire: "anthropic", baseUrl: "http://127.0.0.1:1234", auth: "none", keyPage: null, docs: "https://lmstudio.ai/docs/developer", checked: "2026-10-26", live: false, models: [] },
  custom: { id: "custom", kind: "api_key", agent: "claude", wire: "anthropic", baseUrl: null, auth: "x-api-key", keyPage: null, docs: "https://code.claude.com/docs/en/llm-gateway", checked: "2026-10-26", live: false, models: [] },
};

export const providerInfo = (id: ProviderId): ProviderInfo => PROVIDERS[id];
const FREE: Price = p(0, 0, 0, 0);

/** The price of a model on a provider: local → 0; known → the catalog; null = unknown (the proxy estimates, D-392). */
export function priceOf(provider: ProviderId, model: string): Price | null {
  if (PROVIDERS[provider].kind === "local") return { ...FREE };
  const m = PROVIDERS[provider].models.find((x) => x.id === model);
  return m?.price ? { ...m.price } : null;
}

/** The host address the proxy container uses for this computer (Docker Desktop; Colima and Linux via host-gateway, [НП] Colima). */
export const HOST_FROM_CONTAINER = "host.docker.internal";
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * The base address of an endpoint: https for a remote host (a name, never an IP literal — no metadata or LAN addresses);
 * http or https only for this computer, rewritten to the host as the proxy container sees it. No user, query or fragment.
 */
export function upstreamUrl(raw: string): { ok: true; url: string; local: boolean } | { ok: false } {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { ok: false };
  }
  if (u.username !== "" || u.password !== "" || u.search !== "" || u.hash !== "" || raw.includes("#") || raw.includes("?")) return { ok: false };
  const local = LOOPBACK.has(u.hostname);
  if (u.protocol !== "https:" && !(local && u.protocol === "http:")) return { ok: false };
  if (!local && (/^[\d.]+$/.test(u.hostname) || u.hostname.startsWith("[") || !u.hostname.includes("."))) return { ok: false };
  const host = local ? `${HOST_FROM_CONTAINER}${u.port ? `:${u.port}` : ""}` : u.host;
  return { ok: true, url: `${u.protocol}//${host}${u.pathname.replace(/\/+$/, "")}`, local };
}

const Key = z.string().trim().regex(/^[\x21-\x7e]{20,512}$/);
const Models = z.array(ModelId).min(1).max(20);

/** A saved connection as the web sees it: no key, only whether one is stored. */
export const Connection = z.object({
  id: ConnectionId,
  provider: ProviderId,
  label: z.string().min(1).max(60),
  /** the address the person gave (or the provider's); null for a subscription */
  baseUrl: z.string().max(300).nullable(),
  models: Models,
  defaultModel: ModelId,
  hasKey: z.boolean(),
}).strict().refine((c) => c.models.includes(c.defaultModel), { message: "the default model is one of the models", path: ["defaultModel"] });
export type Connection = z.infer<typeof Connection>;

/** Add (or replace) a key/local/custom connection. A subscription is added by its sign-in, not here. */
export const AddConnectionBody = z.object({
  provider: ProviderId.exclude(["claude-sub", "chatgpt-sub"]),
  id: ConnectionId.optional(),
  label: z.string().trim().min(1).max(60).optional(),
  baseUrl: z.string().max(300).optional(),
  key: Key.optional(),
  models: Models,
  defaultModel: ModelId.optional(),
}).strict().superRefine((b, ctx) => {
  const info = PROVIDERS[b.provider];
  if (info.auth === "none" ? b.key !== undefined : b.key === undefined && b.provider !== "custom") ctx.addIssue({ code: "custom", message: info.auth === "none" ? "no key for this provider" : "a key is needed", path: ["key"] });
  if (info.baseUrl === null && b.baseUrl === undefined) ctx.addIssue({ code: "custom", message: "an address is needed", path: ["baseUrl"] });
  if (b.baseUrl !== undefined && !upstreamUrl(b.baseUrl).ok) ctx.addIssue({ code: "custom", message: "https, or http on this computer", path: ["baseUrl"] });
  if (b.defaultModel !== undefined && !b.models.includes(b.defaultModel)) ctx.addIssue({ code: "custom", message: "the default model is one of the models", path: ["defaultModel"] });
});
export type AddConnectionBody = z.infer<typeof AddConnectionBody>;

/** Change the models (and the default) of a saved connection — Settings → Models. */
export const ModelsBody = z.object({ models: Models, defaultModel: ModelId }).strict().refine((b) => b.models.includes(b.defaultModel), { message: "the default model is one of the models", path: ["defaultModel"] });
export type ModelsBody = z.infer<typeof ModelsBody>;

export const AddConnectionReply = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), connection: Connection }).strict(),
  z.object({ ok: z.literal(false), error: z.enum(["bad_key", "unreachable", "bad_address", "proxy_start_failed", "failed"]) }).strict(),
]);
export type AddConnectionReply = z.infer<typeof AddConnectionReply>;

/** What `mandat local` finds on this computer for the first-run page: the servers that answer and their models. */
export const DetectReply = z.object({
  local: z.array(z.object({ provider: z.enum(["ollama", "lmstudio"]), models: z.array(ModelId).max(100) }).strict()).max(2),
  /** names of the environment variables that are set (never values) — "use the key you already have" */
  envKeys: z.array(z.enum(["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "DEEPSEEK_API_KEY"])).max(3),
}).strict();
export type DetectReply = z.infer<typeof DetectReply>;

/** The default agent and model of the task box (remembered by `mandat local`). */
export const Preferences = z.object({
  defaultAgent: z.string().max(64).nullable().default(null),
  defaultModel: ModelId.nullable().default(null),
  /** the first-run page was finished or skipped */
  onboarded: z.boolean().default(false),
}).strict();
export type Preferences = z.infer<typeof Preferences>;

/** One connection in the proxy's boot payload (loopback admin port, once; memory only, D-345). */
export const ProxyUpstream = z.object({
  wire: Wire,
  url: z.string().max(300).refine((u) => /^https:\/\/[^/]+|^http:\/\/host\.docker\.internal(:\d+)?(\/|$)/.test(u), "https, or http to this computer"),
  auth: z.enum(["x-api-key", "bearer", "none"]),
  key: z.string().max(512),
  models: Models,
  /** per model; a missing price is estimated at the Sonnet rate (budgets stay meaningful) */
  prices: z.record(z.string(), z.object({ input: z.number().min(0), output: z.number().min(0), cacheRead: z.number().min(0), cacheWrite: z.number().min(0) }).strict()),
}).strict();
export type ProxyUpstream = z.infer<typeof ProxyUpstream>;

// ---- agent refs: which CLI runs and how it reaches its model
// claude | codex (the provider's API key) · claude@<account> | codex@<account> (a subscription) · claude+<connection> |
// codex+<connection> (a saved connection through the proxy) · fake:<scenario> | fake-codex:<scenario> (demo agents)
export type AgentRef =
  | { cli: "claude" | "codex"; via: { kind: "key" } | { kind: "account"; name: string } | { kind: "connection"; id: string } }
  | { cli: "fake" | "fake-codex"; scenario: string };

const NAME = /^[a-z0-9][a-z0-9-]{0,31}$/;
export function parseAgentRef(s: string): AgentRef | null {
  const fake = /^(fake|fake-codex):([a-z0-9-]{1,40})$/.exec(s);
  if (fake) return { cli: fake[1] as "fake" | "fake-codex", scenario: fake[2] as string };
  const m = /^(claude|codex)(?:([@+])(.*))?$/.exec(s);
  if (!m) return null;
  const cli = m[1] as "claude" | "codex";
  if (m[2] === undefined) return { cli, via: { kind: "key" } };
  const name = m[3] ?? "";
  if (!NAME.test(name)) return null;
  return { cli, via: m[2] === "@" ? { kind: "account", name } : { kind: "connection", id: name } };
}
export function formatAgentRef(r: AgentRef): string {
  if (!("via" in r)) return `${r.cli}:${r.scenario}`;
  const v = r.via;
  return v.kind === "key" ? r.cli : v.kind === "account" ? `${r.cli}@${v.name}` : `${r.cli}+${v.id}`;
}
export const AgentRefString = z.string().max(64).refine((s) => parseAgentRef(s) !== null, "unknown agent");
/** The CLI of an agent ref ("claude" for the Claude fakes too). */
export function agentOf(s: string): "claude" | "codex" | null {
  const r = parseAgentRef(s);
  return r === null ? null : r.cli === "codex" || r.cli === "fake-codex" ? "codex" : "claude";
}
/** The channel label of a saved connection (packages/channels channelFor resolves it to the proxy upstream of that id). */
export const connectionLabel = (id: string): string => `conn-${id}`;

/** GET /connections of `mandat local`: the saved connections (no keys) and the task box defaults. */
export const ConnectionsReply = z.object({ connections: z.array(Connection).max(50), preferences: Preferences }).strict();
export type ConnectionsReply = z.infer<typeof ConnectionsReply>;
