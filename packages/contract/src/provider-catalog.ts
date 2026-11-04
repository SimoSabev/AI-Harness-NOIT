import { z } from "zod";

// D-470: the providers as data. One record per provider: the format its API speaks, the base address, how the key goes,
// where the person gets a key and a few suggested models. The proxy picks its wire from `wire`; the web shows which agent
// can use it (`agent`, derived from the format — Claude Code speaks Anthropic Messages, Codex the OpenAI Responses API,
// Gemini CLI the Gemini API). A format no agent here speaks (`openai-chat`, `native`) can be saved and checked, and the
// page says honestly that no agent can use it yet (Q-095). Sources: docs/integrations/api-providers.md (read 04.11.2026).

/** The wires the proxy forwards (an agent CLI speaks each one). */
export const Wire = z.enum(["anthropic", "openai", "gemini"]);
export type Wire = z.infer<typeof Wire>;
/** Every API format a provider may offer: the three wires, OpenAI Chat Completions only, or its own API only. */
export const ApiFormat = z.enum(["anthropic", "openai", "gemini", "openai-chat", "native"]);
export type ApiFormat = z.infer<typeof ApiFormat>;
export const AgentCli = z.enum(["claude", "codex", "gemini"]);
export type AgentCli = z.infer<typeof AgentCli>;
/** api-key = Azure's header; aws / gcp = cloud credentials (not a pasted key, [НП] Q-096) */
export const AuthStyle = z.enum(["x-api-key", "bearer", "x-goog-api-key", "api-key", "none", "aws", "gcp"]);
export type AuthStyle = z.infer<typeof AuthStyle>;

export const ProviderId = z.enum([
  "claude-sub", "chatgpt-sub",
  "anthropic", "openai", "gemini", "xai", "mistral", "cohere", "perplexity",
  "deepseek", "qwen", "kimi", "zai", "minimax", "ernie", "doubao", "hunyuan",
  "openrouter", "groq", "together", "fireworks", "cerebras",
  "azure", "bedrock", "vertex",
  "ollama", "lmstudio", "vllm",
  "openai-compat", "custom",
]);
export type ProviderId = z.infer<typeof ProviderId>;

/** Where a provider sits on the page (the person looks for a name, not a format). */
export const ProviderGroup = z.enum(["subscription", "main", "china", "router", "cloud", "local", "own"]);
export type ProviderGroup = z.infer<typeof ProviderGroup>;

const Usd = z.number().min(0).max(1000);
/** USD per million tokens (cacheWrite = the 5-minute write). */
export const Price = z.object({ input: Usd, output: Usd, cacheRead: Usd, cacheWrite: Usd }).strict();
export type Price = z.infer<typeof Price>;
export const SuggestedModel = z.object({ id: z.string().min(1).max(128), tier: z.enum(["best", "balanced", "fast"]), recommended: z.literal(true).optional(), price: Price.optional() }).strict();
export type SuggestedModel = z.infer<typeof SuggestedModel>;

const agentOfWire = (w: ApiFormat): AgentCli | null => (w === "anthropic" ? "claude" : w === "openai" ? "codex" : w === "gemini" ? "gemini" : null);

export const ProviderEntry = z.object({
  id: ProviderId,
  /** the product name (never translated) */
  label: z.string().min(1).max(40),
  kind: z.enum(["subscription", "api_key", "local"]),
  group: ProviderGroup,
  /** the CLI that runs in the sandbox; null = no agent here speaks this format yet */
  agent: AgentCli.nullable(),
  wire: ApiFormat,
  /** null: the person gives the address (Azure, any OpenAI-compatible server) or there is none (a subscription) */
  baseUrl: z.string().regex(/^https:\/\/[a-z0-9.-]+(\/[A-Za-z0-9._~/-]*)?$|^http:\/\/127\.0\.0\.1:\d+$/).nullable(),
  auth: AuthStyle,
  /** where the person gets a key (null: no key, or the person's own server) */
  keyPage: z.string().url().nullable(),
  docs: z.string().url(),
  /** the date the docs were read (AGENTS.md rule 9) */
  checked: z.string().regex(/^\d{4}-\d\d-\d\d$/),
  /** false = [НП]: from the provider's docs, but no live run has used it yet */
  live: z.boolean(),
  models: z.array(SuggestedModel).max(8),
}).strict().refine((p) => p.agent === agentOfWire(p.wire), { message: "the agent follows the format", path: ["agent"] });
export type ProviderEntry = z.infer<typeof ProviderEntry>;
export type ProviderInfo = ProviderEntry;

const p = (input: number, output: number, cacheRead: number, cacheWrite: number): Price => ({ input, output, cacheRead, cacheWrite });
// platform.claude.com/docs/en/about-claude/pricing (claude-api skill cache of 06.10.2026); the 5-minute write is 1.25 × input
const CLAUDE: SuggestedModel[] = [
  { id: "claude-sonnet-5-5", tier: "balanced", recommended: true, price: p(2, 10, 0.2, 2.5) },
  { id: "claude-opus-5-5", tier: "best", price: p(4, 20, 0.2, 5) },
  { id: "claude-haiku-5-5", tier: "fast", price: p(0.1, 0.5, 0.01, 0.125) },
  { id: "claude-fable-5-1", tier: "best", price: p(10, 50, 0.25, 12.5) },
];
const m = (best: string | null, balanced: string | null, fast: string | null, rec: "best" | "balanced" | "fast" = "balanced"): SuggestedModel[] =>
  (([["best", best], ["balanced", balanced], ["fast", fast]] as const).flatMap(([tier, id]) => (id === null ? [] : [{ id, tier, ...(tier === rec ? { recommended: true as const } : {}) }])));

type Row = Omit<ProviderEntry, "agent" | "checked" | "live" | "models"> & { checked?: string; live?: boolean; models?: SuggestedModel[] };
const NOV = "2026-11-04";
const row = (r: Row): ProviderEntry => ({ checked: NOV, live: false, models: [], ...r, agent: agentOfWire(r.wire) });

// The data. A new provider is one row here (and, if it needs one, its address rule in the proxy: none so far).
const ROWS: ProviderEntry[] = [
  row({ id: "claude-sub", label: "Claude", kind: "subscription", group: "subscription", wire: "anthropic", baseUrl: null, auth: "none", keyPage: null, docs: "https://code.claude.com/docs/en/authentication", checked: "2026-10-26", live: true, models: CLAUDE.slice(0, 3).map(({ price: _, ...x }) => x) }),
  row({ id: "chatgpt-sub", label: "ChatGPT", kind: "subscription", group: "subscription", wire: "openai", baseUrl: null, auth: "none", keyPage: null, docs: "https://developers.openai.com/codex/auth", checked: "2026-10-26", models: [{ id: "gpt-5-codex", tier: "balanced", recommended: true }] }),
  row({ id: "anthropic", label: "Anthropic API", kind: "api_key", group: "main", wire: "anthropic", baseUrl: "https://api.anthropic.com", auth: "x-api-key", keyPage: "https://platform.claude.com/settings/keys", docs: "https://platform.claude.com/docs/en/about-claude/models", checked: "2026-10-26", live: true, models: CLAUDE }),
  // developers.openai.com/api/docs/models (04.11.2026); gpt-5-codex stays for the choices saved before
  row({ id: "openai", label: "OpenAI API", kind: "api_key", group: "main", wire: "openai", baseUrl: "https://api.openai.com", auth: "bearer", keyPage: "https://platform.openai.com/api-keys", docs: "https://developers.openai.com/api/docs/models", models: [...m("gpt-6-astra", "gpt-6.1-sol", "gpt-6-luna"), { id: "gpt-5-codex", tier: "balanced" }] }),
  // D-427: ai.google.dev/gemini-api/docs/models (22.10.2026) and /pricing (28.10.2026); no cache-write fee → cacheWrite = input
  row({ id: "gemini", label: "Google Gemini", kind: "api_key", group: "main", wire: "gemini", baseUrl: "https://generativelanguage.googleapis.com", auth: "x-goog-api-key", keyPage: "https://aistudio.google.com/apikey", docs: "https://ai.google.dev/gemini-api/docs/api-key", checked: "2026-10-28", models: [
    { id: "gemini-3.8-flash", tier: "balanced", recommended: true, price: p(1.5, 7.5, 0.15, 1.5) },
    { id: "gemini-4-argon", tier: "best", price: p(4, 20, 0.2, 4) },
    { id: "gemini-3.5-flash-lite", tier: "fast", price: p(0.3, 2.5, 0.03, 0.3) },
  ] }),
  // api-docs.deepseek.com/guides/anthropic_api: x-api-key; names outside the list → 400
  row({ id: "deepseek", label: "DeepSeek", kind: "api_key", group: "china", wire: "anthropic", baseUrl: "https://api.deepseek.com/anthropic", auth: "x-api-key", keyPage: "https://platform.deepseek.com/api_keys", docs: "https://api-docs.deepseek.com/guides/anthropic_api", checked: "2026-10-26", models: [{ id: "deepseek-v4-pro", tier: "best", recommended: true }, { id: "deepseek-flash", tier: "fast" }] }),
  // kimi.com/code/docs/en/third-party-tools/claude-code.html: ANTHROPIC_API_KEY (x-api-key), the Kimi Code plan
  row({ id: "kimi", label: "Kimi", kind: "api_key", group: "china", wire: "anthropic", baseUrl: "https://api.kimi.ai/coding", auth: "x-api-key", keyPage: "https://www.kimi.com/code", docs: "https://www.kimi.com/code/docs/en/third-party-tools/claude-code.html", checked: "2026-10-26", models: [{ id: "k3.1-pro", tier: "best", recommended: true }, { id: "k3.1-pro-highspeed", tier: "fast" }] }),
  // docs.z.ai/scenario-example/develop-tools/claude: ANTHROPIC_AUTH_TOKEN (bearer), the GLM Coding Plan
  row({ id: "zai", label: "Z.ai GLM", kind: "api_key", group: "china", wire: "anthropic", baseUrl: "https://api.z.ai/api/anthropic", auth: "bearer", keyPage: "https://z.ai/manage-apikey/apikey-list", docs: "https://docs.z.ai/scenario-example/develop-tools/claude", models: [{ id: "glm-5.2", tier: "best", recommended: true }, { id: "glm-5.3", tier: "best" }, { id: "glm-5.3-flash", tier: "fast" }] }),
  // docs.ollama.com/api/anthropic-compatibility: /v1/messages since 01.2026; any token, ignored
  row({ id: "ollama", label: "Ollama", kind: "local", group: "local", wire: "anthropic", baseUrl: "http://127.0.0.1:11434", auth: "none", keyPage: null, docs: "https://docs.ollama.com/api/anthropic-compatibility", checked: "2026-10-26", models: [{ id: "qwen3-coder", tier: "balanced", recommended: true }] }),
  // LM Studio's Anthropic-compatible endpoint: the models come from GET /v1/models of the running server
  row({ id: "lmstudio", label: "LM Studio", kind: "local", group: "local", wire: "anthropic", baseUrl: "http://127.0.0.1:1234", auth: "none", keyPage: null, docs: "https://lmstudio.ai/docs/developer/anthropic-compat" }),
  row({ id: "custom", label: "Anthropic-compatible address", kind: "api_key", group: "own", wire: "anthropic", baseUrl: null, auth: "x-api-key", keyPage: null, docs: "https://code.claude.com/docs/en/llm-gateway", checked: "2026-10-26" }),
  ...NEW_ROWS(),
];

// D-470 (04.11.2026): the providers added from docs/integrations/api-providers.md — every one [НП] until a live run.
function NEW_ROWS(): ProviderEntry[] {
  return [
    // docs.x.ai/docs/models: Responses at api.x.ai/v1 (its /v1/messages is deprecated) → Codex
    row({ id: "xai", label: "xAI Grok", kind: "api_key", group: "main", wire: "openai", baseUrl: "https://api.x.ai", auth: "bearer", keyPage: "https://console.x.ai", docs: "https://docs.x.ai/docs/models", models: m("grok-4.7", "grok-4.6", "grok-build-0.1") }),
    // docs.mistral.ai: Responses in public preview (stateless) [НП: Codex on it]; Chat Completions at /v1
    row({ id: "mistral", label: "Mistral", kind: "api_key", group: "main", wire: "openai", baseUrl: "https://api.mistral.ai", auth: "bearer", keyPage: "https://console.mistral.ai/api-keys", docs: "https://docs.mistral.ai/getting-started/models/", models: m("mistral-large-latest", "mistral-medium-latest", "mistral-small-latest") }),
    // docs.cohere.com: only the Chat Completions compatibility layer → no agent here yet (Q-095)
    row({ id: "cohere", label: "Cohere", kind: "api_key", group: "main", wire: "openai-chat", baseUrl: "https://api.cohere.ai/compatibility", auth: "bearer", keyPage: "https://dashboard.cohere.com/api-keys", docs: "https://docs.cohere.com/docs/compatibility-api", models: m("command-a-plus-05-2026", null, "command-r7b-12-2024", "best") }),
    // docs.perplexity.ai: the Agent API (/v1/responses) [НП: Codex on it]
    row({ id: "perplexity", label: "Perplexity", kind: "api_key", group: "main", wire: "openai", baseUrl: "https://api.perplexity.ai", auth: "bearer", keyPage: "https://www.perplexity.ai/account/api", docs: "https://docs.perplexity.ai/getting-started/models", models: m(null, "perplexity/sonar", null) }),
    // alibabacloud.com/help/en/model-studio/anthropic-api-messages: https://<workspace>.<region>.maas.aliyuncs.com/apps/anthropic;
    // a key works in its own region only, so the person pastes the address shown in the console
    row({ id: "qwen", label: "Qwen (Alibaba)", kind: "api_key", group: "china", wire: "anthropic", baseUrl: null, auth: "x-api-key", keyPage: "https://modelstudio.console.alibabacloud.com/", docs: "https://www.alibabacloud.com/help/en/model-studio/anthropic-api-messages", models: m("qwen3.8-max", "qwen3.7-plus", "qwen3.8-flash") }),
    // platform.minimax.io: Anthropic at api.minimax.io/anthropic, the key as ANTHROPIC_AUTH_TOKEN; 1008 = insufficient balance
    row({ id: "minimax", label: "MiniMax", kind: "api_key", group: "china", wire: "anthropic", baseUrl: "https://api.minimax.io/anthropic", auth: "bearer", keyPage: "https://platform.minimax.io/user-center/basic-information/interface-key", docs: "https://platform.minimax.io/docs/api-reference/errorcode.md", models: m("MiniMax-M3", null, "MiniMax-M3.1-Flash", "best") }),
    // cloud.baidu.com/doc/qianfan-docs: Anthropic at qianfan.baidubce.com/anthropic [НП: read from search snippets]
    row({ id: "ernie", label: "Baidu ERNIE", kind: "api_key", group: "china", wire: "anthropic", baseUrl: "https://qianfan.baidubce.com/anthropic", auth: "bearer", keyPage: "https://console.bce.baidu.com/qianfan/ais/console/apiKey", docs: "https://cloud.baidu.com/doc/qianfan-docs/s/6mh3e6gjp", models: m("ernie-5.1", "qianfan-code-latest", null) }),
    // volcengine.com/article/38135: the Ark Coding Plan, Anthropic at ark.cn-beijing.volces.com/api/coding [НП]
    row({ id: "doubao", label: "Doubao (Volcengine)", kind: "api_key", group: "china", wire: "anthropic", baseUrl: "https://ark.cn-beijing.volces.com/api/coding", auth: "bearer", keyPage: "https://console.volcengine.com/ark", docs: "https://www.volcengine.com/article/38135", models: m("Doubao-Seed-2.0-Code", "ark-code-latest", null) }),
    // cloud.tencent.com/document/product/1729/111007: Anthropic at api.hunyuan.cloud.tencent.com/anthropic [НП]
    row({ id: "hunyuan", label: "Tencent Hunyuan", kind: "api_key", group: "china", wire: "anthropic", baseUrl: "https://api.hunyuan.cloud.tencent.com/anthropic", auth: "bearer", keyPage: "https://console.cloud.tencent.com/hunyuan/api-key", docs: "https://cloud.tencent.com/document/product/1729/111007", models: m("hunyuan-2.0-thinking-20251109", "hunyuan-2.0-instruct-20251111", "hunyuan-turbos-latest") }),
    // openrouter.ai/docs: Claude Code with ANTHROPIC_BASE_URL=https://openrouter.ai/api and the key as a bearer; 402 = no credit
    row({ id: "openrouter", label: "OpenRouter", kind: "api_key", group: "router", wire: "anthropic", baseUrl: "https://openrouter.ai/api", auth: "bearer", keyPage: "https://openrouter.ai/settings/keys", docs: "https://openrouter.ai/docs/api/reference/errors-and-debugging", models: m("anthropic/claude-opus-5-5", "anthropic/claude-sonnet-5-5", "google/gemini-3.8-flash") }),
    // console.groq.com/docs/responses-api: Responses at api.groq.com/openai/v1
    row({ id: "groq", label: "Groq", kind: "api_key", group: "router", wire: "openai", baseUrl: "https://api.groq.com/openai", auth: "bearer", keyPage: "https://console.groq.com/keys", docs: "https://console.groq.com/docs/responses-api", models: m("openai/gpt-oss-120b", "llama-3.3-70b-versatile", "openai/gpt-oss-20b", "best") }),
    // docs.together.ai/docs/openai-api-compatibility: Responses at api.together.ai/v1 [НП: Codex on it]
    row({ id: "together", label: "Together AI", kind: "api_key", group: "router", wire: "openai", baseUrl: "https://api.together.ai", auth: "bearer", keyPage: "https://api.together.ai/settings/api-keys", docs: "https://docs.together.ai/docs/openai-api-compatibility", models: m("openai/gpt-oss-120b", null, null, "best") }),
    // docs.fireworks.ai/tools-sdks/anthropic-compatibility: Anthropic at api.fireworks.ai/inference, bearer
    row({ id: "fireworks", label: "Fireworks AI", kind: "api_key", group: "router", wire: "anthropic", baseUrl: "https://api.fireworks.ai/inference", auth: "bearer", keyPage: "https://fireworks.ai/account/api-keys", docs: "https://docs.fireworks.ai/tools-sdks/anthropic-compatibility", models: m("accounts/fireworks/models/kimi-k2p5", null, null, "best") }),
    // inference-docs.cerebras.ai: Chat Completions only → no agent here yet (Q-095)
    row({ id: "cerebras", label: "Cerebras", kind: "api_key", group: "router", wire: "openai-chat", baseUrl: "https://api.cerebras.ai", auth: "bearer", keyPage: "https://cloud.cerebras.ai/platform", docs: "https://inference-docs.cerebras.ai/resources/openai", models: m("gpt-oss-120b", "qwen-3.8-27b", null, "best") }),
    // the v1 API: https://<resource>.openai.azure.com/openai/v1 with the api-key header; the model is the deployment name [НП: Responses]
    row({ id: "azure", label: "Azure OpenAI", kind: "api_key", group: "cloud", wire: "openai", baseUrl: null, auth: "api-key", keyPage: "https://ai.azure.com/", docs: "https://code.claude.com/docs/en/microsoft-foundry" }),
    // docs.aws.amazon.com/bedrock/latest/userguide/bedrock-mantle.html: a Bedrock API key (bearer) on
    // https://bedrock-runtime.<region>.amazonaws.com/openai — the region is in the address
    row({ id: "bedrock", label: "AWS Bedrock", kind: "api_key", group: "cloud", wire: "openai", baseUrl: null, auth: "bearer", keyPage: "https://console.aws.amazon.com/bedrock/home", docs: "https://docs.aws.amazon.com/bedrock/latest/userguide/bedrock-mantle.html", models: m(null, "global.openai.gpt-5.6-sol", null) }),
    // docs.cloud.google.com/vertex-ai: a 1-hour OAuth token, not a pasted key → listed, not connectable here (Q-096)
    row({ id: "vertex", label: "Google Vertex AI", kind: "api_key", group: "cloud", wire: "native", baseUrl: null, auth: "gcp", keyPage: null, docs: "https://docs.cloud.google.com/vertex-ai/generative-ai/docs/start/openai" }),
    // docs.vllm.ai: an Anthropic-compatible /v1/messages next to the OpenAI one [НП: the port is the person's]
    row({ id: "vllm", label: "vLLM", kind: "local", group: "local", wire: "anthropic", baseUrl: "http://127.0.0.1:8000", auth: "none", keyPage: null, docs: "https://docs.vllm.ai/en/latest/serving/online_serving/" }),
    // any server with /v1/responses (SSE, tools) runs Codex; Chat Completions only is not enough (Codex: wire_api = "responses" only)
    row({ id: "openai-compat", label: "OpenAI-compatible address", kind: "api_key", group: "own", wire: "openai", baseUrl: null, auth: "bearer", keyPage: null, docs: "https://learn.chatgpt.com/docs/config-file/config-reference" }),
  ];
}

/** Validated at load: a broken record fails the first import (and the test), not a person's click. */
export const CATALOG: readonly ProviderEntry[] = Object.freeze(z.array(ProviderEntry).parse(ROWS));
export const PROVIDERS: Readonly<Record<ProviderId, ProviderEntry>> = Object.freeze(Object.fromEntries(CATALOG.map((x) => [x.id, x])) as Record<ProviderId, ProviderEntry>);
export const providerInfo = (id: ProviderId): ProviderEntry => PROVIDERS[id];
/** Which agent can use a provider's key; null = none yet (shown as such). */
export const agentFor = (id: ProviderId): AgentCli | null => PROVIDERS[id].agent;

const GROUP_ORDER: readonly ProviderGroup[] = ["subscription", "main", "china", "router", "cloud", "local", "own"];
export function providerGroups(): { group: ProviderGroup; ids: ProviderId[] }[] {
  return GROUP_ORDER.map((group) => ({ group, ids: CATALOG.filter((x) => x.group === group).map((x) => x.id) })).filter((g) => g.ids.length > 0);
}

// ---- D-471: several keys per provider
/** The id of a new connection of this provider: the provider id first, then provider-2, provider-3 … */
export function nextConnectionId(provider: ProviderId, taken: readonly string[]): string {
  if (!taken.includes(provider)) return provider;
  for (let i = 2; i < 100; i += 1) {
    const id = `${provider}-${i}`.slice(0, 32);
    if (!taken.includes(id)) return id;
  }
  return `${provider.slice(0, 22)}-${Date.now().toString(36).slice(-8)}`;
}
/** The last four characters — all the web ever sees of a key. */
export const keyHint = (key: string): string => key.trim().slice(-4);
export const KeyHint = z.string().regex(/^[\x21-\x7e]{4}$/);

/** D-472: "Check the key" — works / refused / no credit left / did not answer. */
export const KeyCheck = z.enum(["ok", "bad_key", "no_credit", "unreachable"]);
export type KeyCheck = z.infer<typeof KeyCheck>;
export const KeyCheckState = z.object({ status: KeyCheck, at: z.string().datetime() }).strict();
export type KeyCheckState = z.infer<typeof KeyCheckState>;
/** POST /connections/<id>/check of `mandat local`: the result, never anything of the key. */
export const CheckKeyReply = KeyCheckState;
export type CheckKeyReply = KeyCheckState;
