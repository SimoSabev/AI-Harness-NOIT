import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddConnectionBody } from "@mandat/contract";
import { deleteConnection, getConnections, getDetect, patchConnection, postConnection, postLogin, putPreferences } from "./api";
import type { ApiDeps } from "./api";
import { RateLimiter } from "./guard";
import type { KeysClient } from "./keys";
import { U, webDb } from "./web-db.test-helper";

// D-393: the first-run page and Settings → Models — only accounts.manage, CSRF on writes, the key never comes back.
let db: Awaited<ReturnType<typeof webDb>>;
let who: string | null = U.owner;
const calls: unknown[] = [];
const KEY = ["sk", "ds", "k".repeat(40)].join("-");
const conn = { id: "deepseek", provider: "deepseek" as const, label: "DeepSeek", baseUrl: "https://api.deepseek.com/anthropic", models: ["deepseek-v4-pro"], defaultModel: "deepseek-v4-pro", hasKey: true };
const fake = {
  status: async () => ({ proxy: "running" as const, providers: [] }), set: async () => null, clear: async () => ({ proxy: "stopped" as const, providers: [] }), accounts: async () => [],
  login: async (op: unknown) => (calls.push(op), { ok: true as const, state: { state: "starting" as const, name: "rabota" } }),
  logout: async () => true, jobs: async () => [], runJob: async () => null, addProject: async () => null,
  connections: async () => ({ connections: [conn], preferences: { defaultAgent: null, defaultModel: null, onboarded: false } }),
  addConnection: async (b: AddConnectionBody) => (calls.push({ add: b.provider, keyed: b.key !== undefined }), b.key === "sk-rejected-0123456789abc" ? { ok: false as const, error: "bad_key" as const } : { ok: true as const, connection: conn }),
  setModels: async (id: string) => (calls.push({ models: id }), id === "deepseek"),
  removeConnection: async (id: string) => (calls.push({ remove: id }), true),
  detect: async () => ({ local: [{ provider: "ollama" as const, models: ["qwen3-coder"] }], envKeys: [] }),
  setPrefs: async (p: unknown) => (calls.push({ prefs: p }), true),
} satisfies KeysClient;
const deps = (keys: KeysClient | null): ApiDeps => ({ db, user: () => Promise.resolve(who), secondFactor: () => Promise.resolve(null), createLimiter: new RateLimiter(10, 60_000), ...(keys ? { keys } : {}) });
const csrf = "c".repeat(43);
const req = (method: string, body?: unknown, o: { csrf?: boolean } = {}) =>
  new Request("http://localhost:3000/api/connections", { method, headers: { host: "localhost:3000", origin: "http://localhost:3000", cookie: `mandat_csrf=${csrf}`, ...(o.csrf === false ? {} : { "x-mandat-csrf": csrf }), "content-type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });

beforeAll(async () => {
  db = await webDb();
});
afterAll(async () => db.end());

describe("API /api/connections (D-393)", () => {
  it("owner: list, add (the key never in the answer), models, remove, detect, preferences", async () => {
    who = U.owner;
    expect((await (await getConnections(req("GET"), deps(fake))).json()).connections).toHaveLength(1);
    const r = await postConnection(req("POST", { provider: "deepseek", key: KEY, models: ["deepseek-v4-pro"] }), deps(fake));
    const text = await r.text();
    expect([r.status, text.includes(KEY)]).toEqual([200, false]);
    const bad = await postConnection(req("POST", { provider: "deepseek", key: "sk-rejected-0123456789abc", models: ["deepseek-v4-pro"] }), deps(fake));
    expect([bad.status, await bad.json()]).toEqual([400, { error: "bad_key" }]);
    expect((await postConnection(req("POST", { provider: "ollama", key: KEY, models: ["m"] }), deps(fake))).status).toBe(400);
    expect((await patchConnection(req("PATCH", { models: ["deepseek-flash"], defaultModel: "deepseek-flash" }), deps(fake), "deepseek")).status).toBe(200);
    expect((await patchConnection(req("PATCH", { models: ["m"], defaultModel: "m" }), deps(fake), "nobody")).status).toBe(404);
    expect((await patchConnection(req("PATCH", { models: ["m"], defaultModel: "x" }), deps(fake), "deepseek")).status).toBe(400);
    expect(await (await deleteConnection(req("DELETE"), deps(fake), "deepseek")).json()).toEqual({ removed: true });
    expect((await (await getDetect(req("GET"), deps(fake))).json()).local[0].provider).toBe("ollama");
    expect((await putPreferences(req("PUT", { defaultAgent: "claude+deepseek", defaultModel: "deepseek-v4-pro", onboarded: true }), deps(fake))).status).toBe(200);
    expect((await putPreferences(req("PUT", { defaultAgent: "gemini" }), deps(fake))).status).toBe(400);
    expect((await postLogin(req("POST", { name: "rabota", cli: "codex" }), deps(fake))).status).toBe(200);
    expect(calls).toContainEqual({ kind: "start", name: "rabota", cli: "codex" });
  });
  it("approver/viewer → 403; no CSRF → 403; no `mandat local` → 503", async () => {
    for (const u of [U.approver, U.viewer]) {
      who = u;
      expect((await getConnections(req("GET"), deps(fake))).status).toBe(403);
      expect((await postConnection(req("POST", { provider: "ollama", models: ["m"] }), deps(fake))).status).toBe(403);
    }
    who = U.owner;
    expect((await postConnection(req("POST", { provider: "ollama", models: ["m"] }, { csrf: false }), deps(fake))).status).toBe(403);
    expect((await getConnections(req("GET"), deps(null))).status).toBe(503);
  });
});
