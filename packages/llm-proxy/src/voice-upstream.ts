import { createHash } from "node:crypto";
import { JARVIS_FIRST_MESSAGE_BG, JARVIS_PROMPT_BG, VOICE_TOOLS } from "@mandat/contract";
import type { VoiceTool } from "@mandat/contract";

// D-556: Jarvis on ElevenLabs Agents. The ElevenLabs key lives only here (AGENTS.md rule 2): the proxy creates the
// person's agent and its client tools, and hands the browser a signed URL valid for 15 minutes — nothing else.
// API (elevenlabs.io/docs/eleven-agents/api-reference, read 20.11.2026): POST /v1/convai/tools, POST
// /v1/convai/agents/create, GET|PATCH /v1/convai/agents/{id}, GET /v1/convai/conversation/get-signed-url; header xi-api-key.
// [НП] until the live run: that agent.language accepts "bg" (the Agents page names 31 languages, not which).

export const ELEVEN_BASE = "https://api.elevenlabs.io";
const AGENT_ID = /^[A-Za-z0-9_-]{1,80}$/;
const TOOL_ANSWER_SECS = 20;
const DEFAULT_LLM = "claude-haiku-5-5";

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
export interface VoiceAgentState { agent_id: string; tool_ids: string[]; hash: string }

export class VoiceError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export function elevenToolConfig(t: VoiceTool) {
  const properties = Object.fromEntries(t.params.map((p) => [p.name, { type: p.type, description: p.description, ...(p.enum ? { enum: [...p.enum] } : {}) }]));
  return {
    tool_config: {
      type: "client", name: t.name, description: t.description, expects_response: true, response_timeout_secs: TOOL_ANSWER_SECS,
      parameters: { type: "object", properties, required: t.params.filter((p) => p.required).map((p) => p.name) },
    },
  };
}

export function elevenAgentBody(o: { voiceId: string; toolIds: string[]; llm?: string }) {
  return {
    name: "Mandat · Jarvis",
    conversation_config: {
      agent: { language: "bg", first_message: JARVIS_FIRST_MESSAGE_BG, prompt: { prompt: JARVIS_PROMPT_BG, llm: o.llm ?? DEFAULT_LLM, tool_ids: o.toolIds } },
      tts: { voice_id: o.voiceId, model_id: "eleven_v4_turbo" },
      asr: { provider: "scribe_realtime" },
    },
    // a private agent: a session starts only with a signed URL from this proxy
    platform_settings: { auth: { enable_auth: true } },
  };
}

/** what the agent is made of; the same hash → nothing to change at ElevenLabs */
function specHash(voiceId: string, llm: string): string {
  const spec = { tools: VOICE_TOOLS.map(elevenToolConfig), agent: elevenAgentBody({ voiceId, toolIds: [], llm }) };
  return createHash("sha256").update(JSON.stringify(spec)).digest("hex");
}

async function call(f: Fetch, key: string, method: string, path: string, body?: unknown): Promise<Response> {
  return f(`${ELEVEN_BASE}${path}`, { method, headers: { "xi-api-key": key, "content-type": "application/json", accept: "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

async function json(r: Response, code: string): Promise<Record<string, unknown>> {
  if (!r.ok) throw new VoiceError(r.status === 401 ? "voice_key_rejected" : code);
  const v = (await r.json()) as unknown;
  if (typeof v !== "object" || v === null) throw new VoiceError(code);
  return v as Record<string, unknown>;
}

/** creates the agent the first time, updates it in place when the settings change, recreates it when it was deleted */
export async function ensureVoiceAgent(o: { fetch: Fetch; key: string; voiceId: string; llm?: string; prev: VoiceAgentState | null }): Promise<VoiceAgentState> {
  const llm = o.llm ?? DEFAULT_LLM;
  const hash = specHash(o.voiceId, llm);
  const prev = o.prev && AGENT_ID.test(o.prev.agent_id) ? o.prev : null;
  const exists = prev !== null && (await call(o.fetch, o.key, "GET", `/v1/convai/agents/${prev.agent_id}`)).ok;
  if (exists && prev.hash === hash) return prev;
  const toolIds: string[] = [];
  for (const t of VOICE_TOOLS) {
    const id = (await json(await call(o.fetch, o.key, "POST", "/v1/convai/tools", elevenToolConfig(t)), "voice_tool_create_failed")).id;
    if (typeof id !== "string") throw new VoiceError("voice_tool_create_failed");
    toolIds.push(id);
  }
  const body = elevenAgentBody({ voiceId: o.voiceId, toolIds, llm });
  if (exists) {
    await json(await call(o.fetch, o.key, "PATCH", `/v1/convai/agents/${prev.agent_id}`, { conversation_config: body.conversation_config, platform_settings: body.platform_settings }), "voice_agent_update_failed");
    return { agent_id: prev.agent_id, tool_ids: toolIds, hash };
  }
  const id = (await json(await call(o.fetch, o.key, "POST", "/v1/convai/agents/create", body), "voice_agent_create_failed")).agent_id;
  if (typeof id !== "string" || !AGENT_ID.test(id)) throw new VoiceError("voice_agent_create_failed");
  return { agent_id: id, tool_ids: toolIds, hash };
}

/** a signed URL for one session (valid 15 minutes); only wss on an ElevenLabs host is handed out */
export async function voiceSignedUrl(o: { fetch: Fetch; key: string; agentId: string }): Promise<string> {
  if (!AGENT_ID.test(o.agentId)) throw new VoiceError("voice_bad_agent");
  const v = (await json(await call(o.fetch, o.key, "GET", `/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(o.agentId)}`), "voice_signed_url_failed")).signed_url;
  if (typeof v !== "string") throw new VoiceError("voice_bad_signed_url");
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    throw new VoiceError("voice_bad_signed_url");
  }
  if (u.protocol !== "wss:" || !(u.hostname === "elevenlabs.io" || u.hostname.endsWith(".elevenlabs.io"))) throw new VoiceError("voice_bad_signed_url");
  return v;
}
