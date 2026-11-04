import { z } from "zod";
import { KeyCheckState, KeyHint, PROVIDERS, ProviderId, Wire } from "./provider-catalog.js";
import type { Price } from "./provider-catalog.js";
export * from "./provider-catalog.js";

// D-392: a "connection" is one way of reaching a model: a subscription (the unmodified CLI with its own login, D-295),
// an API key, a server on this computer, or another endpoint that speaks the Anthropic Messages API (Claude Code) or the
// OpenAI Responses API (Codex). Keys and local servers go through the proxy (the agent gets an mdt_ token only, AGENTS.md
// rule 2); this file carries names, addresses and model ids — never a key value back out.

export const ConnectionId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/);
export type ConnectionId = z.infer<typeof ConnectionId>;

/** The forms providers use: claude-sonnet-5-5, qwen3-coder:30b, moonshotai/kimi-k3, glm-5.2[1m]. Never secret-looking. */
export const ModelId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/@[\]-]{0,127}$/).refine((m) => !/mdt_|sk-ant-/.test(m), "secret-looking model id");
export type ModelId = z.infer<typeof ModelId>;

const FREE: Price = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

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

/** A pasted API key: 20-512 visible ASCII characters, no spaces (trimmed). */
export const ApiKey = z.string().trim().regex(/^[\x21-\x7e]{20,512}$/);
const Key = ApiKey;
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
  /** D-471: the last four characters of the key — all the web ever sees of it */
  keyHint: KeyHint.optional(),
  /** D-472: the last "Check the key" */
  check: KeyCheckState.optional(),
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
  if (info.auth === "aws" || info.auth === "gcp") ctx.addIssue({ code: "custom", message: "cloud credentials, not a pasted key (Q-096)", path: ["provider"] });
  const ownAddress = b.provider === "custom" || b.provider === "openai-compat";
  if (info.auth === "none" ? b.key !== undefined : b.key === undefined && !ownAddress) ctx.addIssue({ code: "custom", message: info.auth === "none" ? "no key for this provider" : "a key is needed", path: ["key"] });
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
  auth: z.enum(["x-api-key", "bearer", "x-goog-api-key", "api-key", "none"]),
  key: z.string().max(512),
  models: Models,
  /** per model; a missing price is estimated at the Sonnet rate (budgets stay meaningful) */
  prices: z.record(z.string(), z.object({ input: z.number().min(0), output: z.number().min(0), cacheRead: z.number().min(0), cacheWrite: z.number().min(0) }).strict()),
  /** D-422: a model on this computer (Ollama, LM Studio) — the proxy stops it after NO_TOOLS_LIMIT replies without a tool */
  local: z.boolean().optional(),
}).strict();
export type ProxyUpstream = z.infer<typeof ProxyUpstream>;

// ---- agent refs: which CLI runs and how it reaches its model
// claude | codex (the provider's API key) · claude@<account> | codex@<account> (a subscription) · claude+<connection> |
// codex+<connection> (a saved connection through the proxy) · fake:<scenario> | fake-codex:<scenario> (demo agents) ·
// D-427: gemini (the saved Gemini connection "gemini") | gemini+<connection>; no gemini@<account> (Google login is off, Q-073)
export type AgentRef =
  | { cli: "claude" | "codex" | "gemini"; via: { kind: "key" } | { kind: "account"; name: string } | { kind: "connection"; id: string } }
  | { cli: "fake" | "fake-codex"; scenario: string };

const NAME = /^[a-z0-9][a-z0-9-]{0,31}$/;
export function parseAgentRef(s: string): AgentRef | null {
  const fake = /^(fake|fake-codex):([a-z0-9-]{1,40})$/.exec(s);
  if (fake) return { cli: fake[1] as "fake" | "fake-codex", scenario: fake[2] as string };
  const m = /^(claude|codex|gemini)(?:([@+])(.*))?$/.exec(s);
  if (!m) return null;
  const cli = m[1] as "claude" | "codex" | "gemini";
  if (cli === "gemini" && m[2] === "@") return null;
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
export function agentOf(s: string): "claude" | "codex" | "gemini" | null {
  const r = parseAgentRef(s);
  return r === null ? null : r.cli === "codex" || r.cli === "fake-codex" ? "codex" : r.cli === "gemini" ? "gemini" : "claude";
}
/** The channel label of a saved connection (packages/channels channelFor resolves it to the proxy upstream of that id). */
export const connectionLabel = (id: string): string => `conn-${id}`;

/** GET /connections of `mandat local`: the saved connections (no keys) and the task box defaults. */
export const ConnectionsReply = z.object({ connections: z.array(Connection).max(50), preferences: Preferences }).strict();
export type ConnectionsReply = z.infer<typeof ConnectionsReply>;
