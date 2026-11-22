import { mkdtempSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
import type net from "node:net";
import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { adminBearer, bootTokenHash, createProxyServer, mintBootToken } from "./index.js";
import { ELEVEN_BASE } from "./voice-upstream.js";

// D-556: the proxy holds the ElevenLabs key (boot payload "voice"), makes the person's Jarvis agent and hands out a
// signed URL — over the loopback admin port only, never the key itself.
const secret = randomBytes(32);
const XI = ["xi", randomBytes(30).toString("base64url")].join("_");
const NOW = 1_792_454_400;
const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (closers.length) await closers.pop()?.();
});
async function listen(s: http.Server): Promise<string> {
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r()));
  closers.push(() => new Promise((r) => { s.closeAllConnections(); s.close(() => r()); }));
  return `http://127.0.0.1:${(s.address() as net.AddressInfo).port}`;
}
function call(base: string, p: string, o: { method?: string; headers?: Record<string, string>; body?: string } = {}) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const r = http.request(base + p, { method: o.method ?? "POST", headers: o.headers ?? {} }, (res) => {
      let b = "";
      res.on("data", (c: Buffer) => (b += c.toString()));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: b }));
    });
    r.on("error", reject);
    r.end(o.body);
  });
}
function fakeEleven(o: { refuseCreate?: boolean } = {}) {
  const keys: string[] = [];
  let n = 0;
  const f = async (url: string, init?: RequestInit): Promise<Response> => {
    keys.push(new Headers(init?.headers).get("xi-api-key") ?? "");
    const m = init?.method ?? "GET";
    if (m === "POST" && url === `${ELEVEN_BASE}/v1/convai/tools`) return Response.json({ id: `tool_${++n}` });
    if (m === "POST" && url === `${ELEVEN_BASE}/v1/convai/agents/create`) {
      if (o.refuseCreate) return Response.json({ detail: [{ loc: ["body", "conversation_config", "agent", "language"], msg: "bad language" }] }, { status: 422 });
      return Response.json({ agent_id: "agent_j" });
    }
    if (m === "GET" && url.startsWith(`${ELEVEN_BASE}/v1/convai/agents/`)) return Response.json({ conversation_config: { tts: { voice_id: "voice_1" } } });
    if (url.startsWith(`${ELEVEN_BASE}/v1/convai/conversation/get-signed-url`)) return Response.json({ signed_url: "wss://api.elevenlabs.io/v1/convai/conversation?agent_id=agent_j&conversation_signature=s" });
    if (m === "PATCH" && url.startsWith(`${ELEVEN_BASE}/v1/convai/agents/`)) return Response.json({ agent_id: "agent_j" });
    return new Response("{}", { status: 500 });
  };
  return { f, keys };
}
async function proxy(bootBody: unknown, o: { refuseCreate?: boolean; voiceLog?: (l: { voice_error: string; detail: string }) => void } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "voice-"));
  const t = mintBootToken();
  const el = fakeEleven(o);
  const p = createProxyServer({
    secret, apiKey: "", upstream: "http://127.0.0.1:9", usageLogPath: path.join(dir, "usage.jsonl"), now: () => NOW * 1000, log: () => undefined,
    boot: { tokenHash: bootTokenHash(t), expiresAtMs: (NOW + 60) * 1000, spentFile: path.join(dir, "boot-spent") }, voiceFetch: el.f,
    ...(o.voiceLog ? { voiceLog: o.voiceLog } : {}),
  });
  const adm = await listen(p.admin);
  await listen(p.inference);
  const b = await call(adm, "/admin/boot", { headers: { authorization: `Bearer ${t}`, "content-type": "application/json" }, body: JSON.stringify(bootBody) });
  return { adm, dir, el, boot: b.status };
}
const auth = { authorization: `Bearer ${adminBearer(secret)}`, "content-type": "application/json" };

describe("Jarvis through the proxy (D-556)", () => {
  it("boot takes {voice: {elevenlabs}}; healthz names the provider, never the key", async () => {
    const p = await proxy({ voice: { elevenlabs: XI } });
    expect(p.boot).toBe(204);
    const h = await call(p.adm, "/healthz", { method: "GET" });
    expect(JSON.parse(h.body).providers).toContain("elevenlabs");
    expect(h.body).not.toContain(XI);
  });

  it("boot refuses an unknown voice provider or a value that is not a key", async () => {
    expect((await proxy({ voice: { elevenlabs: "short" } })).boot).toBe(400);
    expect((await proxy({ voice: { acme: XI } })).boot).toBe(400);
  });

  it("admin: the agent is made once and kept on disk (not secret); a session gets only a signed URL", async () => {
    const p = await proxy({ voice: { elevenlabs: XI } });
    const a = await call(p.adm, "/admin/voice/agent", { headers: auth, body: JSON.stringify({ voice_id: "voice_1" }) });
    expect([a.status, JSON.parse(a.body)]).toEqual([200, { agent_id: "agent_j" }]);
    const saved = readFileSync(path.join(p.dir, "voice-agent.json"), "utf8");
    expect(saved).toContain("agent_j");
    expect(saved).not.toContain(XI);
    const s = await call(p.adm, "/admin/voice/session", { headers: auth, body: "{}" });
    expect(s.status).toBe(200);
    expect(JSON.parse(s.body)).toEqual({ signed_url: expect.stringMatching(/^wss:\/\/api\.elevenlabs\.io\//) });
    expect(s.body + a.body).not.toContain(XI);
    expect(p.el.keys.every((k) => k === XI)).toBe(true);
  });

  it("no admin bearer → 401; no key → 409 voice_not_configured; a session before the agent → 409 voice_no_agent", async () => {
    const p = await proxy({ voice: { elevenlabs: XI } });
    expect((await call(p.adm, "/admin/voice/session", { body: "{}" })).status).toBe(401);
    expect(JSON.parse((await call(p.adm, "/admin/voice/session", { headers: auth, body: "{}" })).body)).toEqual({ error: "voice_no_agent" });
    const none = await proxy({ anthropic: ["sk", "ant", "api03", "a".repeat(40)].join("-") });
    const r = await call(none.adm, "/admin/voice/agent", { headers: auth, body: JSON.stringify({ voice_id: "voice_1" }) });
    expect([r.status, JSON.parse(r.body)]).toEqual([409, { error: "voice_not_configured" }]);
    expect(existsSync(path.join(none.dir, "voice-agent.json"))).toBe(false);
  });

  it("a bad voice id is refused before anything is sent", async () => {
    const p = await proxy({ voice: { elevenlabs: XI } });
    const r = await call(p.adm, "/admin/voice/agent", { headers: auth, body: JSON.stringify({ voice_id: "../../x" }) });
    expect(r.status).toBe(400);
    expect(p.el.keys).toEqual([]);
  });

  it("D-579: ElevenLabs refuses → the answer is still only the code; the proxy's log says why, never the key", async () => {
    const lines: { voice_error: string; detail: string }[] = [];
    const p = await proxy({ voice: { elevenlabs: XI } }, { refuseCreate: true, voiceLog: (l) => lines.push(l) });
    const r = await call(p.adm, "/admin/voice/agent", { headers: auth, body: JSON.stringify({ voice_id: "voice_1" }) });
    expect([r.status, JSON.parse(r.body)]).toEqual([502, { error: "voice_agent_create_failed" }]);
    expect(lines).toEqual([{ voice_error: "voice_agent_create_failed", detail: "422 body.conversation_config.agent.language: bad language" }]);
    expect(JSON.stringify(lines)).not.toContain(XI);
  });

  it("D-588: a session with an agent from an older tool list updates it first, then hands out the signed URL", async () => {
    const p = await proxy({ voice: { elevenlabs: XI } });
    writeFileSync(path.join(p.dir, "voice-agent.json"), JSON.stringify({ agent_id: "agent_j", tool_ids: ["tool_old"], hash: "old" }));
    const s = await call(p.adm, "/admin/voice/session", { headers: auth, body: "{}" });
    expect(s.status).toBe(200);
    const saved = JSON.parse(readFileSync(path.join(p.dir, "voice-agent.json"), "utf8")) as { tool_ids: string[]; hash: string };
    expect(saved.hash).not.toBe("old");
    expect(saved.tool_ids.length).toBeGreaterThan(1);
  });
});

