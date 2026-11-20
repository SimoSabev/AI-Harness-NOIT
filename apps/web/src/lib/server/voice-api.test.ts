import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteVoiceKey, postVoiceAgent, postVoiceKey, postVoiceSession } from "./api";
import type { ApiDeps } from "./api";
import { RateLimiter } from "./guard";
import type { KeysClient } from "./keys";
import { U, webDb } from "./web-db.test-helper";

// D-556: Jarvis — the ElevenLabs key only from the owner and only to the proxy; the agent is made by the owner; any
// member may start a voice session and gets a signed URL, never the key.
let db: Awaited<ReturnType<typeof webDb>>;
let who: string | null = U.owner;
const seen: unknown[] = [];
const xi = ["xi", "k".repeat(40)].join("_");
const none = async () => null;
const fake: KeysClient = {
  status: async () => ({ proxy: "running", providers: ["anthropic"] }), set: none, clear: async () => ({ proxy: "stopped", providers: [] }),
  setResearch: none, clearResearch: none, accounts: async () => [], login: async () => ({ ok: false, error: "control_unavailable" }), logout: none,
  jobs: none, runJob: none, addProject: none, folders: none, foundProjects: none,
  connections: none, addConnection: none, setModels: none, removeConnection: none, checkConnection: none, detect: none, setPrefs: async () => false,
  setVoice: async (k) => (seen.push(k), { proxy: "running", providers: ["anthropic", "elevenlabs"] }),
  clearVoice: async () => (seen.push("cleared"), { proxy: "running", providers: ["anthropic"] }),
  voiceAgent: async (v) => (seen.push({ agent: v }), { agent_id: "agent_j" }),
  voiceSession: async () => ({ signed_url: "wss://api.elevenlabs.io/v1/convai/conversation?agent_id=agent_j&conversation_signature=s" }),
};
const deps = (keys: KeysClient | null): ApiDeps => ({ db, user: () => Promise.resolve(who), secondFactor: () => Promise.resolve(null), createLimiter: new RateLimiter(10, 60_000), ...(keys ? { keys } : {}) });
const csrf = "c".repeat(43);
const req = (method: string, body?: unknown) =>
  new Request("http://localhost:3000/api/voice", { method, headers: { host: "localhost:3000", origin: "http://localhost:3000", cookie: `mandat_csrf=${csrf}`, "x-mandat-csrf": csrf, "content-type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });

beforeAll(async () => {
  db = await webDb();
});
afterAll(async () => db.end());

describe("API of the voice (D-556)", () => {
  it("the key: owner only, never echoed; bad body → 400; clear", async () => {
    who = U.owner;
    const r = await postVoiceKey(req("POST", { elevenlabs: xi }), deps(fake));
    const text = await r.text();
    expect([r.status, text.includes(xi)]).toEqual([200, false]);
    expect(JSON.parse(text)).toEqual({ proxy: "running", providers: ["anthropic", "elevenlabs"] });
    expect((await postVoiceKey(req("POST", { elevenlabs: "x" }), deps(fake))).status).toBe(400);
    expect((await deleteVoiceKey(req("DELETE"), deps(fake))).status).toBe(200);
    who = U.approver;
    expect((await postVoiceKey(req("POST", { elevenlabs: xi }), deps(fake))).status).toBe(403);
    who = U.owner;
    expect((await postVoiceKey(req("POST", { elevenlabs: xi }), deps(null))).status).toBe(503);
  });

  it("the agent: owner makes it with a voice id; a bad id → 400; others → 403", async () => {
    who = U.owner;
    expect(await (await postVoiceAgent(req("POST", { voice_id: "voice_1" }), deps(fake))).json()).toEqual({ agent_id: "agent_j" });
    expect((await postVoiceAgent(req("POST", { voice_id: "../x" }), deps(fake))).status).toBe(400);
    who = U.viewer;
    expect((await postVoiceAgent(req("POST", { voice_id: "voice_1" }), deps(fake))).status).toBe(403);
  });

  it("a session: any member gets a signed URL; not signed in → 401; an error from the proxy is passed on by name", async () => {
    for (const u of [U.owner, U.approver, U.viewer]) {
      who = u;
      const r = await postVoiceSession(req("POST", {}), deps(fake));
      expect(await r.json()).toEqual({ signed_url: expect.stringMatching(/^wss:\/\//) });
    }
    who = null;
    expect((await postVoiceSession(req("POST", {}), deps(fake))).status).toBe(401);
    who = U.owner;
    const noAgent: KeysClient = { ...fake, voiceSession: async () => ({ error: "voice_no_agent" }) };
    const r = await postVoiceSession(req("POST", {}), deps(noAgent));
    expect([r.status, await r.json()]).toEqual([409, { error: "voice_no_agent" }]);
  });
});
