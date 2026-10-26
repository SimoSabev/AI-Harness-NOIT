import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import type { ResearchRole, RoleAssignment } from "@mandat/contract";
import { MandatError } from "@mandat/contract";
import { costUsd, costUsdOpenAi } from "@mandat/llm-proxy";
import type { OpenAiRate } from "@mandat/llm-proxy";
import type { RoleRoute, RouterChannel } from "./router.js";

// E9г (D-393): one interface over every model the person connected. API keys go through llm-proxy with an mdt_ token
// (AGENTS.md rule 2: the key never leaves the proxy); a subscription is the unchanged CLI (`claude -p`, D-295) run by
// the worker in the profile's sandbox; a local model is an OpenAI-compatible endpoint (Ollama, LM Studio, vLLM, llama.cpp).

export interface ModelRequest {
  system: string;
  user: string;
  maxTokens: number;
  /** the answer must be one JSON value */
  json: boolean;
  /** how hard the model thinks (Anthropic output_config.effort); per-page roles use low */
  effort?: "low" | "medium" | "high";
}
export interface ModelReply {
  text: string;
  inputTokens: number;
  outputTokens: number;
  usd: number;
}
export interface ModelClient {
  readonly channel: RouterChannel;
  complete(r: ModelRequest, signal?: AbortSignal): Promise<ModelReply>;
}

const TIMEOUT_MS = 120_000;
async function postJson(url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal): Promise<unknown> {
  const t = AbortSignal.timeout(TIMEOUT_MS);
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), signal: signal ? AbortSignal.any([signal, t]) : t });
  const text = await res.text();
  // never the body of an error into a message: it may echo the prompt (AGENTS.md rule 5)
  if (!res.ok) throw new MandatError("E_RESEARCH_MODEL", `model endpoint answered ${res.status}`);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new MandatError("E_RESEARCH_MODEL", "model endpoint answered with no JSON");
  }
}
const num = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) ? x : 0);
const obj = (x: unknown): Record<string, unknown> => (typeof x === "object" && x !== null ? (x as Record<string, unknown>) : {});

/** the official SDK against llm-proxy: the mdt_ token is the "key", the proxy holds the real one (AGENTS.md rule 2) */
export function anthropicViaProxy(baseUrl: string, token: string): Anthropic {
  return new Anthropic({ apiKey: token, baseURL: baseUrl, maxRetries: 2, timeout: TIMEOUT_MS });
}

/** Anthropic Messages or OpenAI Responses through llm-proxy; the system prompt is cached (it repeats per page). */
export function proxyModel(o: { channel: RouterChannel; baseUrl: string; token: string; provider: "anthropic" | "openai"; openaiPrices?: Record<string, OpenAiRate>; client?: Anthropic }): ModelClient {
  const anthropic = o.provider === "anthropic" ? (o.client ?? anthropicViaProxy(o.baseUrl, o.token)) : null;
  return {
    channel: o.channel,
    async complete(r, signal) {
      if (anthropic) {
        let msg: Anthropic.Message;
        try {
          msg = await anthropic.messages.create(
            {
              model: o.channel.model,
              max_tokens: r.maxTokens,
              system: [{ type: "text", text: r.system, cache_control: { type: "ephemeral" } }],
              messages: [{ role: "user", content: r.user }],
              output_config: { effort: r.effort ?? "medium" },
            },
            signal ? { signal } : undefined,
          );
        } catch (e) {
          // the SDK's message may quote the endpoint's body; keep only the status (AGENTS.md rule 5)
          throw new MandatError("E_RESEARCH_MODEL", e instanceof Anthropic.APIError ? `model endpoint answered ${String(e.status)}` : "model endpoint unreachable");
        }
        if (msg.stop_reason === "refusal") throw new MandatError("E_RESEARCH_MODEL", "the model declined");
        const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
        const u = msg.usage;
        const usage = { input_tokens: u.input_tokens, output_tokens: u.output_tokens, cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0, cache_read_input_tokens: u.cache_read_input_tokens ?? 0 };
        return { text, inputTokens: usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens, outputTokens: usage.output_tokens, usd: costUsd(o.channel.model, usage) ?? 0 };
      }
      const j = obj(await postJson(`${o.baseUrl}/v1/responses`, { authorization: `Bearer ${o.token}` }, { model: o.channel.model, instructions: r.system, input: r.user, max_output_tokens: r.maxTokens, ...(r.json ? { text: { format: { type: "json_object" } } } : {}) }, signal));
      const text = (Array.isArray(j.output) ? j.output : [])
        .flatMap((it) => (Array.isArray(obj(it).content) ? (obj(it).content as unknown[]) : []))
        .map((c) => (obj(c).type === "output_text" ? String(obj(c).text ?? "") : ""))
        .join("");
      const u = obj(j.usage);
      const usage = { input_tokens: num(u.input_tokens), cached_tokens: num(obj(u.input_tokens_details).cached_tokens), output_tokens: num(u.output_tokens), reasoning_tokens: num(obj(u.output_tokens_details).reasoning_tokens) };
      const rate = o.openaiPrices?.[o.channel.model];
      return { text, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, usd: rate ? costUsdOpenAi(rate, usage) : 0 };
    },
  };
}

/** an OpenAI-compatible chat endpoint on the person's machine or network; no key, no cost */
export function localModel(o: { channel: RouterChannel; baseUrl: string }): ModelClient {
  return {
    channel: o.channel,
    async complete(r, signal) {
      const j = obj(
        await postJson(
          `${o.baseUrl.replace(/\/+$/, "")}/chat/completions`,
          {},
          { model: o.channel.model, max_tokens: r.maxTokens, temperature: 0.2, messages: [{ role: "system", content: r.system }, { role: "user", content: r.user }], ...(r.json ? { response_format: { type: "json_object" } } : {}) },
          signal,
        ),
      );
      const first = obj(Array.isArray(j.choices) ? j.choices[0] : undefined);
      const u = obj(j.usage);
      return { text: String(obj(first.message).content ?? ""), inputTokens: num(u.prompt_tokens), outputTokens: num(u.completion_tokens), usd: 0 };
    },
  };
}

/** argv of one model call through the unchanged Claude Code CLI: no tools, no MCP, no session on disk; the prompt on stdin.
 * Flags: `claude --help` of 2.1.198 (26.10.2026, D-393). */
export function cliArgv(model: string, system: string): string[] {
  return ["claude", "-p", "--output-format", "json", "--tools", "", "--strict-mcp-config", "--no-session-persistence", "--model", model, "--system-prompt", system];
}
/** the worker runs argv in the profile's sandbox and returns stdout */
export type CliExec = (argv: string[], stdin: string, signal?: AbortSignal) => Promise<string>;
export function cliModel(o: { channel: RouterChannel; exec: CliExec }): ModelClient {
  return {
    channel: o.channel,
    async complete(r, signal) {
      const out = await o.exec(cliArgv(o.channel.model, r.system), r.user, signal);
      let j: Record<string, unknown>;
      try {
        j = obj(JSON.parse(out.trim().split("\n").at(-1) ?? ""));
      } catch {
        throw new MandatError("E_RESEARCH_MODEL", "the CLI answered with no JSON");
      }
      if (j.is_error === true) throw new MandatError("E_RESEARCH_MODEL", `the CLI reported an error (${String(j.subtype ?? "error")})`);
      const u = obj(j.usage);
      // a subscription is not billed per call; total_cost_usd is the API price equivalent, shown but not spent
      return { text: String(j.result ?? ""), inputTokens: num(u.input_tokens) + num(u.cache_read_input_tokens) + num(u.cache_creation_input_tokens), outputTokens: num(u.output_tokens), usd: 0 };
    },
  };
}

export interface CallRecord {
  role: ResearchRole;
  channel: RouterChannel;
  purpose: string;
  reply: ModelReply | null;
  ms: number;
}
/** the models of a run: a role's primary channel, then its fallbacks on an error; every attempt is reported */
export class RoleModels {
  private readonly byRole: Map<ResearchRole, ModelClient[]>;
  constructor(
    routes: readonly RoleRoute[],
    clientOf: (c: RouterChannel) => ModelClient,
    private readonly onCall: (c: CallRecord) => void,
    private readonly now: () => number = Date.now,
  ) {
    const cache = new Map<string, ModelClient>();
    const get = (c: RouterChannel) => cache.get(c.id) ?? (cache.set(c.id, clientOf(c)), cache.get(c.id) as ModelClient);
    this.byRole = new Map(routes.map((r) => [r.role, r.channels.map(get)]));
  }
  assignments(): RoleAssignment[] {
    return [...this.byRole.entries()].flatMap(([role, cs]) => (cs[0] ? [{ role, channel: cs[0].channel.label, channel_kind: cs[0].channel.kind, model: cs[0].channel.model }] : []));
  }
  async text(role: ResearchRole, purpose: string, r: ModelRequest, signal?: AbortSignal): Promise<ModelReply> {
    const clients = this.byRole.get(role) ?? [];
    for (const c of clients) {
      const t0 = this.now();
      try {
        const reply = await c.complete(r, signal);
        this.onCall({ role, channel: c.channel, purpose, reply, ms: this.now() - t0 });
        return reply;
      } catch (e) {
        this.onCall({ role, channel: c.channel, purpose, reply: null, ms: this.now() - t0 });
        if (signal?.aborted) throw e;
      }
    }
    throw new MandatError("E_RESEARCH_MODELS_DOWN", `no model answered for ${role}`);
  }
  /** a JSON answer checked by `schema`; one repair round on the same model with the parse error, then the next model */
  async json<T>(role: ResearchRole, purpose: string, schema: z.ZodType<T>, r: Omit<ModelRequest, "json">, signal?: AbortSignal): Promise<T> {
    let last = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const user = attempt === 0 ? r.user : `${r.user}\n\nYour previous answer was not valid (${last}). Answer again with JSON only.`;
      const reply = await this.text(role, purpose, { ...r, user, json: true }, signal);
      const parsed = parseJsonLoose(reply.text);
      const ok = parsed === undefined ? null : schema.safeParse(parsed);
      if (ok?.success) return ok.data;
      last = ok ? ok.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : "not JSON";
    }
    throw new MandatError("E_RESEARCH_MODEL_JSON", `${role} gave no valid JSON for ${purpose}`);
  }
}

/** the first JSON object or array in a reply, with or without a ``` fence */
export function parseJsonLoose(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(t) as unknown;
  } catch {
    const start = t.search(/[[{]/);
    if (start < 0) return undefined;
    const open = t[start];
    const close = open === "{" ? "}" : "]";
    const end = t.lastIndexOf(close);
    if (end <= start) return undefined;
    try {
      return JSON.parse(t.slice(start, end + 1)) as unknown;
    } catch {
      return undefined;
    }
  }
}

/** a scripted model for tests and the offline demo: `answer(role/purpose, request)` → text */
export function fakeModel(channel: RouterChannel, answer: (r: ModelRequest) => string | Promise<string>, usdPerCall = 0): ModelClient {
  return {
    channel,
    async complete(r) {
      const text = await answer(r);
      return { text, inputTokens: Math.ceil((r.system.length + r.user.length) / 4), outputTokens: Math.ceil(text.length / 4), usd: usdPerCall };
    },
  };
}
