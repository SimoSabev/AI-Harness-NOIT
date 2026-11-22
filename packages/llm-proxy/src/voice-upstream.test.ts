import { describe, expect, it } from "vitest";
import { VOICE_TOOLS } from "@mandat/contract";
import { ELEVEN_BASE, VoiceError, elevenAgentBody, elevenToolConfig, ensureVoiceAgent, voiceSignedUrl } from "./voice-upstream.js";

// D-556: Jarvis on ElevenLabs Agents. The key stays in the proxy (AGENTS.md rule 2): the proxy creates the person's
// agent and its tools, and hands out a short-lived signed URL only (docs: elevenlabs.io/docs/eleven-agents, 20.11.2026).
const KEY = "xi_" + "k".repeat(40);

interface Call { method: string; url: string; headers: Record<string, string>; body: unknown }
function fakeEleven(o: { agentMissing?: boolean; signed?: string } = {}) {
  const calls: Call[] = [];
  let n = 0;
  const f = async (url: string | URL, init?: RequestInit): Promise<Response> => {
    const u = String(url);
    const method = init?.method ?? "GET";
    calls.push({ method, url: u, headers: Object.fromEntries(new Headers(init?.headers).entries()), body: init?.body ? JSON.parse(String(init.body)) : null });
    if (method === "POST" && u === `${ELEVEN_BASE}/v1/convai/tools`) return Response.json({ id: `tool_${++n}` });
    if (method === "POST" && u === `${ELEVEN_BASE}/v1/convai/agents/create`) return Response.json({ agent_id: "agent_new" });
    if (method === "GET" && u.startsWith(`${ELEVEN_BASE}/v1/convai/agents/`)) return o.agentMissing ? new Response("{}", { status: 404 }) : Response.json({ agent_id: u.split("/").pop() });
    if (method === "PATCH") return Response.json({ agent_id: u.split("/").pop() });
    if (u.startsWith(`${ELEVEN_BASE}/v1/convai/conversation/get-signed-url`)) return Response.json({ signed_url: o.signed ?? "wss://api.elevenlabs.io/v1/convai/conversation?agent_id=agent_new&conversation_signature=abc" });
    return new Response("{}", { status: 500 });
  };
  return { f, calls };
}

describe("Jarvis on ElevenLabs: the agent and its tools (D-556)", () => {
  it("a client tool: the contract's name, description and parameters as JSON schema; the agent waits for the answer", () => {
    const t = VOICE_TOOLS.find((x) => x.name === "open_screen");
    if (!t) throw new Error("no open_screen");
    expect(elevenToolConfig(t)).toEqual({
      tool_config: {
        type: "client", name: "open_screen", description: t.description, expects_response: true, response_timeout_secs: 20,
        parameters: { type: "object", properties: { screen: { type: "string", description: "Кой екран", enum: [...(t.params[0]?.enum ?? [])] }, project_id: { type: "string", description: "Проект, ако екранът е за проект" } }, required: ["screen"] },
      },
    });
  });

  it("the agent speaks Bulgarian with Eleven v4, listens with Scribe, uses the given tools and needs a signed URL", () => {
    const b = elevenAgentBody({ voiceId: "voice_1", toolIds: ["tool_1"], llm: "claude-haiku-5-5" });
    expect(b.conversation_config.agent.language).toBe("bg");
    expect(b.conversation_config.agent.prompt.tool_ids).toEqual(["tool_1"]);
    expect(b.conversation_config.agent.prompt.llm).toBe("claude-haiku-5-5");
    expect(b.conversation_config.tts).toEqual({ voice_id: "voice_1", model_id: "eleven_v4_turbo", speed: 1.1 });
    expect(b.conversation_config.asr.provider).toBe("scribe_realtime");
    expect(b.platform_settings.auth.enable_auth).toBe(true);
    expect(b.conversation_config.agent.prompt.prompt).toMatch(/Jarvis/);
    expect(b.conversation_config.agent.prompt.prompt).toMatch(/TOTP/);
  });

  it("D-584: answers as soon as the person stops, starts thinking in the pause, can be cut off even in the greeting", () => {
    const c = elevenAgentBody({ voiceId: "voice_1", toolIds: [] }).conversation_config;
    expect(c.turn).toEqual({ turn_eagerness: "eager", speculative_turn: true });
    expect(c.agent.disable_first_message_interruptions).toBe(false);
    expect(c.agent.first_message.length).toBeLessThan(40);
  });

  it("first time: creates every tool, then the agent; the key goes only in xi-api-key", async () => {
    const { f, calls } = fakeEleven();
    const r = await ensureVoiceAgent({ fetch: f, key: KEY, voiceId: "voice_1", prev: null });
    expect(r.agent_id).toBe("agent_new");
    expect(r.tool_ids).toHaveLength(VOICE_TOOLS.length);
    expect(calls.filter((c) => c.url.endsWith("/v1/convai/tools"))).toHaveLength(VOICE_TOOLS.length);
    expect(calls.at(-1)?.url).toBe(`${ELEVEN_BASE}/v1/convai/agents/create`);
    for (const c of calls) {
      expect(c.headers["xi-api-key"]).toBe(KEY);
      expect(JSON.stringify(c.body)).not.toContain(KEY);
      expect(c.url).not.toContain(KEY);
    }
  });

  it("the same settings again: nothing is created; changed settings: new tools and the agent is updated in place", async () => {
    const first = fakeEleven();
    const prev = await ensureVoiceAgent({ fetch: first.f, key: KEY, voiceId: "voice_1", prev: null });
    const same = fakeEleven();
    expect(await ensureVoiceAgent({ fetch: same.f, key: KEY, voiceId: "voice_1", prev })).toEqual(prev);
    expect(same.calls.filter((c) => c.method !== "GET")).toEqual([]);
    const changed = fakeEleven();
    const r = await ensureVoiceAgent({ fetch: changed.f, key: KEY, voiceId: "voice_2", prev });
    expect(r.agent_id).toBe(prev.agent_id);
    expect(changed.calls.some((c) => c.method === "PATCH" && c.url === `${ELEVEN_BASE}/v1/convai/agents/${prev.agent_id}`)).toBe(true);
  });

  it("an agent deleted at ElevenLabs is created again", async () => {
    const prev = await ensureVoiceAgent({ fetch: fakeEleven().f, key: KEY, voiceId: "voice_1", prev: null });
    const gone = fakeEleven({ agentMissing: true });
    const r = await ensureVoiceAgent({ fetch: gone.f, key: KEY, voiceId: "voice_1", prev: { ...prev, agent_id: "agent_old" } });
    expect(r.agent_id).toBe("agent_new");
  });

  it("a signed URL only from ElevenLabs over wss; anything else is refused", async () => {
    expect(await voiceSignedUrl({ fetch: fakeEleven().f, key: KEY, agentId: "agent_new" })).toMatch(/^wss:\/\/api\.elevenlabs\.io\//);
    await expect(voiceSignedUrl({ fetch: fakeEleven({ signed: "wss://evil.example/x" }).f, key: KEY, agentId: "agent_new" })).rejects.toThrow(/voice_bad_signed_url/);
    await expect(voiceSignedUrl({ fetch: fakeEleven().f, key: KEY, agentId: "../x" })).rejects.toThrow(/voice_bad_agent/);
  });
});

describe("why ElevenLabs refused (D-579)", () => {
  const refusing = (status: number, body: unknown) => async (url: string | URL, init?: RequestInit): Promise<Response> => {
    const u = String(url);
    if ((init?.method ?? "GET") === "POST" && u === `${ELEVEN_BASE}/v1/convai/tools`) return Response.json({ id: "tool_1" });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
  const refusal = async (f: ReturnType<typeof refusing>): Promise<VoiceError> => {
    try {
      await ensureVoiceAgent({ fetch: f, key: KEY, voiceId: "voice_1", prev: null });
    } catch (e) {
      if (e instanceof VoiceError) return e;
    }
    throw new Error("no VoiceError");
  };

  it("the code stays; the detail says the status and ElevenLabs' own message (a validation list or a message), short, never the key", async () => {
    const e = await refusal(refusing(422, { detail: [{ loc: ["body", "conversation_config", "agent", "language"], msg: "Input should be 'en', 'de' or 'fr'", type: "literal_error" }] }));
    expect(e.code).toBe("voice_agent_create_failed");
    expect(e.detail).toBe("422 body.conversation_config.agent.language: Input should be 'en', 'de' or 'fr'");
    const m = await refusal(refusing(400, { detail: { status: "invalid_tts_model", message: "Model eleven_v4_turbo is not available" } }));
    expect(m.detail).toBe("400 invalid_tts_model: Model eleven_v4_turbo is not available");
    const long = await refusal(refusing(400, { detail: { message: `${KEY} ${"x".repeat(500)}` } }));
    expect(long.detail.length).toBeLessThanOrEqual(300);
    expect(long.detail).not.toContain(KEY);
  });

  it("a body that is not JSON: just the status", async () => {
    const f = async (url: string | URL, init?: RequestInit): Promise<Response> => ((init?.method ?? "GET") === "POST" && String(url).endsWith("/v1/convai/tools") ? Response.json({ id: "t" }) : new Response("<html>bad gateway</html>", { status: 502 }));
    expect((await refusal(f)).detail).toBe("502");
  });
});

