import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AddConnectionBody } from "@mandat/contract";
import { deleteConnection, getConnections, getDetect, patchConnection, postConnection, postConnectionCheck, postLogin, putPreferences } from "./api";
import type { ApiDeps } from "./api";
import { RateLimiter } from "./guard";
import type { KeysClient } from "./keys";
import { U, webDb } from "./web-db.test-helper";

// D-393: the first-run page and Settings → Models — only accounts.manage, CSRF on writes, the key never comes back.
let db: Awaited<ReturnType<typeof webDb>>;
let who: string | null = U.owner;
const calls: unknown[] = [];
const KEY = ["sk", "ds", "k".repeat(40)].join("-");
const REJECTED = ["sk", "rejected", "0123456789abc"].join("-"); // D-095: key-looking values are built at runtime
const conn = { id: "deepseek", provider: "deepseek" as const, label: "DeepSeek", baseUrl: "https://api.deepseek.com/anthropic", models: ["deepseek-v4-pro"], defaultModel: "deepseek-v4-pro", hasKey: true };
const fake = {
  status: async () => ({ proxy: "running" as const, providers: [] }), set: async () => null, clear: async () => ({ proxy: "stopped" as const, providers: [] }), setResearch: async () => null, clearResearch: async () => null, accounts: async () => [],
  login: async (op: unknown) => (calls.push(op), { ok: true as const, state: { state: "starting" as const, name: "rabota" } }),
  logout: async () => true, jobs: async () => [], runJob: async () => null, addProject: async () => null, folders: async () => null, foundProjects: async () => null,
  connections: async () => ({ connections: [conn], preferences: { defaultAgent: null, defaultModel: null, onboarded: false } }),
  addConnection: async (b: AddConnectionBody) => (calls.push({ add: b.provider, keyed: b.key !== undefined }), b.key === REJECTED ? { ok: false as const, error: "bad_key" as const } : { ok: true as const, connection: conn }),
  setModels: async (id: string) => (calls.push({ models: id }), id === "deepseek"),
  removeConnection: async (id: string) => (calls.push({ remove: id }), true),
  checkConnection: async (id: string) => (calls.push({ check: id }), id === "deepseek" ? { status: "no_credit" as const, at: "2026-11-04T10:00:00.000Z" } : null),
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
    const bad = await postConnection(req("POST", { provider: "deepseek", key: REJECTED, models: ["deepseek-v4-pro"] }), deps(fake));
    expect([bad.status, await bad.json()]).toEqual([400, { error: "bad_key" }]);
    expect((await postConnection(req("POST", { provider: "ollama", key: KEY, models: ["m"] }), deps(fake))).status).toBe(400);
    expect((await patchConnection(req("PATCH", { models: ["deepseek-flash"], defaultModel: "deepseek-flash" }), deps(fake), "deepseek")).status).toBe(200);
    expect((await patchConnection(req("PATCH", { models: ["m"], defaultModel: "m" }), deps(fake), "nobody")).status).toBe(404);
    expect((await patchConnection(req("PATCH", { models: ["m"], defaultModel: "x" }), deps(fake), "deepseek")).status).toBe(400);
    expect(await (await deleteConnection(req("DELETE"), deps(fake), "deepseek")).json()).toEqual({ removed: true });
    expect((await (await getDetect(req("GET"), deps(fake))).json()).local[0].provider).toBe("ollama");
    expect((await putPreferences(req("PUT", { defaultAgent: "claude+deepseek", defaultModel: "deepseek-v4-pro", onboarded: true }), deps(fake))).status).toBe(200);
    expect((await putPreferences(req("PUT", { defaultAgent: "gemini@lichno" }), deps(fake))).status).toBe(400); // D-427: gemini is an agent now; a Google login is not (Q-073)
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
  it("D-472: Check the key — the result only; an unknown id → 404; a bad id → 400; viewers → 403", async () => {
    who = U.owner;
    const r = await postConnectionCheck(req("POST", {}), deps(fake), "deepseek");
    expect([r.status, await r.json()]).toEqual([200, { status: "no_credit", at: "2026-11-04T10:00:00.000Z" }]);
    expect((await postConnectionCheck(req("POST", {}), deps(fake), "nobody")).status).toBe(404);
    expect((await postConnectionCheck(req("POST", {}), deps(fake), "Bad Id")).status).toBe(400);
    expect((await postConnectionCheck(req("POST", {}, { csrf: false }), deps(fake), "deepseek")).status).toBe(403);
    who = U.viewer;
    expect((await postConnectionCheck(req("POST", {}), deps(fake), "deepseek")).status).toBe(403);
    who = U.owner;
  });
  it("D-474: a key that goes through the web server never lands in the database or in a log line", async () => {
    who = U.owner;
    const printed: string[] = [];
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void printed.push(a.map(String).join(" "))));
    try {
      for (const provider of ["deepseek", "anthropic", "xai"] as const) {
        await postConnection(req("POST", { provider, key: KEY, models: ["m1"] }), deps(fake));
        await postConnection(req("POST", { provider, key: REJECTED, models: ["m1"] }), deps(fake));
      }
      await postConnection(req("POST", { provider: "deepseek", key: KEY, models: ["bad model"] }), deps(fake)); // refused by zod
    } finally {
      for (const s of spies) s.mockRestore();
    }
    expect(printed.join(" | ")).not.toContain(KEY);
    expect(printed.join(" | ")).not.toContain(REJECTED);
    const tables = await db.query<{ t: string }>("select quote_ident(table_schema) || '.' || quote_ident(table_name) as t from information_schema.tables where table_type = 'BASE TABLE' and table_schema not in ('pg_catalog', 'information_schema')");
    expect(tables.rows.length).toBeGreaterThan(0);
    for (const { t } of tables.rows) {
      const rows = await db.query<{ j: string }>(`select row_to_json(x)::text as j from ${t} x`);
      for (const r of rows.rows) expect([t, r.j.includes(KEY) || r.j.includes(REJECTED)]).toEqual([t, false]);
    }
  });
});
