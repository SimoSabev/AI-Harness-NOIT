import { describe, expect, it } from "vitest";
import { startControl } from "./commands/local-control.js";
import type { ControlDeps, Keys } from "./commands/local-control.js";
import { LoginSessions } from "./commands/login-session.js";
import { SystemJobs } from "./commands/system-jobs.js";
import type { LoginProc } from "./commands/login-session.js";

const noLogin = () => new LoginSessions({ prepare: async () => "images_missing", discard: async () => undefined, spawn: () => { throw new Error("no"); }, status: async () => ({ loggedIn: false, email: null, plan: null }), timeoutMs: 1000 });
const base = (): Omit<ControlDeps, "start" | "stop" | "providers" | "accounts"> => ({ login: noLogin(), logout: async () => false, system: new SystemJobs({ run: () => undefined, org: "o" }), addProject: async () => ({ ok: false, error: "failed" }) });

// D-293: the keys reach the proxy through `mandat local` only: 127.0.0.1, a bearer token, never echoed, never stored.
describe("mandat local control (D-293)", () => {
  it("token, validation, start/stop/status; the key is never in a response", async () => {
    const anthropic = ["sk", "ant", "api03", "q".repeat(40)].join("-");
    const got: Keys[] = [];
    let providers: string[] | null = null;
    const c = await startControl({
      start: async (k) => {
        got.push(k);
        providers = k.openai ? ["anthropic", "openai"] : ["anthropic"];
        return true;
      },
      stop: async () => {
        providers = null;
      },
      providers: async () => providers,
      accounts: async () => [{ name: "work", agent: "claude@work", loggedIn: true, email: "s@example.com", plan: "Max" }],
      ...base(),
    });
    try {
      expect(await (await fetch(`${c.url}/accounts`, { headers: { authorization: `Bearer ${c.token}` } })).json()).toEqual({ accounts: [{ name: "work", agent: "claude@work", loggedIn: true, email: "s@example.com", plan: "Max" }] });
      expect(c.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      const call = (method: string, body?: unknown, token = c.token) =>
        fetch(`${c.url}/keys`, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      expect((await call("GET", undefined, "x".repeat(64))).status).toBe(401);
      expect(await (await call("GET")).json()).toEqual({ proxy: "stopped", providers: [] });
      expect((await call("POST", { anthropic: "short" })).status).toBe(400);
      expect((await call("POST", { anthropic, extra: 1 })).status).toBe(400);
      const r = await call("POST", { anthropic });
      const text = await r.text();
      expect(r.status).toBe(200);
      expect(text).not.toContain(anthropic);
      expect(JSON.parse(text)).toEqual({ proxy: "running", providers: ["anthropic"] });
      expect(got).toEqual([{ anthropic }]);
      expect(await (await call("DELETE")).json()).toEqual({ proxy: "stopped", providers: [] });
      expect((await fetch(`${c.url}/other`, { headers: { authorization: `Bearer ${c.token}` } })).status).toBe(404);
    } finally {
      await c.close();
    }
  });
  it("a failed proxy start → 502 proxy_start_failed", async () => {
    const c = await startControl({ start: async () => false, stop: async () => undefined, providers: async () => null, accounts: async () => [], ...base() });
    try {
      const r = await fetch(`${c.url}/keys`, { method: "POST", headers: { authorization: `Bearer ${c.token}` }, body: JSON.stringify({ anthropic: "a".repeat(40) }) });
      expect([r.status, await r.json()]).toEqual([502, { error: "proxy_start_failed" }]);
    } finally {
      await c.close();
    }
  });
  it("D-369: the subscription login — start, Anthropic's address, the code to stdin only, done; logout; bad input → 400", async () => {
    const URL = "https://claude.com/cai/oauth/authorize?code=true&code_challenge=x&code_challenge_method=S256&state=y";
    const written: string[] = [];
    let out: (s: string) => void = () => undefined;
    let exit: (c: number | null) => void = () => undefined;
    const proc: LoginProc = { onOutput: (f) => void (out = f), onExit: (f) => void (exit = f), write: (x) => void written.push(x), kill: () => exit(null) };
    const login = new LoginSessions({ prepare: async () => "ok", discard: async () => undefined, spawn: () => proc, status: async () => ({ loggedIn: true, email: "s@example.com", plan: "Max" }), timeoutMs: 60_000 });
    const removed: string[] = [];
    const c = await startControl({ start: async () => true, stop: async () => undefined, providers: async () => null, accounts: async () => [], login, logout: async (n) => (removed.push(n), true), system: new SystemJobs({ run: () => undefined, org: "o" }), addProject: async () => ({ ok: false, error: "failed" }) });
    const call = async (method: string, path: string, body?: unknown) => {
      const r = await fetch(`${c.url}${path}`, { method, headers: { authorization: `Bearer ${c.token}` }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      return [r.status, await r.json()] as const;
    };
    try {
      expect(await call("GET", "/accounts/login")).toEqual([200, { state: "idle" }]);
      expect(await call("POST", "/accounts/login", { name: "Bad Name" })).toEqual([400, { error: "bad_name" }]);
      expect(await call("POST", "/accounts/login", { name: "lichno" })).toEqual([200, { state: "starting", name: "lichno" }]);
      await new Promise((r) => setTimeout(r, 10));
      out(`visit: ${URL}\nPaste code here if prompted > `);
      expect(await call("GET", "/accounts/login")).toEqual([200, { state: "waiting_code", name: "lichno", url: URL }]);
      expect(await call("POST", "/accounts/login/code", { code: "no" })).toEqual([400, { error: "bad_code" }]);
      const code = "AbC-12_3#xYz";
      const [st, body] = await call("POST", "/accounts/login/code", { code });
      expect([st, body]).toEqual([200, { state: "checking", name: "lichno" }]);
      expect(JSON.stringify(body)).not.toContain(code);
      expect(written).toEqual([`${code}\n`]);
      exit(0);
      await new Promise((r) => setTimeout(r, 10));
      expect(await call("GET", "/accounts/login")).toEqual([200, { state: "done", name: "lichno", email: "s@example.com", plan: "Max" }]);
      expect(await call("DELETE", "/accounts/login")).toEqual([200, { state: "done", name: "lichno", email: "s@example.com", plan: "Max" }]);
      expect(await call("POST", "/accounts/logout", { name: "lichno" })).toEqual([200, { removed: true }]);
      expect(removed).toEqual(["lichno"]);
      expect(await call("POST", "/accounts/logout", { name: "../x" })).toEqual([400, { error: "bad_name" }]);
    } finally {
      await c.close();
    }
  });
  it("D-370: /system lists the jobs; POST /system/<job> starts one from the closed list; anything else → 404/405", async () => {
    const argv: (readonly string[])[] = [];
    const c = await startControl({ start: async () => true, stop: async () => undefined, providers: async () => null, accounts: async () => [], login: noLogin(), logout: async () => false, system: new SystemJobs({ run: (a) => void argv.push(a), org: "o" }), addProject: async () => ({ ok: false, error: "failed" }) });
    const call = async (method: string, path: string) => {
      const r = await fetch(`${c.url}${path}`, { method, headers: { authorization: `Bearer ${c.token}` } });
      return [r.status, await r.json()] as const;
    };
    try {
      const [st, body] = await call("GET", "/system");
      expect(st).toBe(200);
      expect((body as { jobs: { job: string }[] }).jobs.map((j) => j.job)).toEqual(["doctor", "images", "images-ui", "fixtures", "fixtures-force", "stats", "verify-log"]);
      expect(await call("POST", "/system/doctor")).toEqual([200, expect.objectContaining({ job: "doctor", state: "running" })]);
      expect(argv).toEqual([["doctor", "--json"]]);
      expect((await call("POST", "/system/run"))[0]).toBe(404);
      expect((await call("POST", "/system/..%2Fdoctor"))[0]).toBe(404);
      expect((await call("DELETE", "/system/doctor"))[0]).toBe(405);
      expect((await call("POST", "/system"))[0]).toBe(405);
    } finally {
      await c.close();
    }
  });
});

// D-388: "Add project" from the web — the path is validated here before anything touches the disk.
describe("POST /projects (D-388)", () => {
  it("an absolute path → the project; a relative path or extra fields → 400; GET → 405; no token → 401", async () => {
    const seen: string[] = [];
    const c = await startControl({
      start: async () => true, stop: async () => undefined, providers: async () => null, accounts: async () => [], ...base(),
      addProject: async (p) => (seen.push(p), { ok: true, repo_id: "d0000000-0000-4000-8000-0000000000c1", full_name: "local/shop", created: true }),
    });
    try {
      const post = (body: unknown, token = c.token) => fetch(`${c.url}/projects`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
      const r = await post({ path: "/Users/simo/shop" });
      expect([r.status, await r.json()]).toEqual([200, { ok: true, repo_id: "d0000000-0000-4000-8000-0000000000c1", full_name: "local/shop", created: true }]);
      expect((await post({ path: "shop" })).status).toBe(400);
      expect((await post({ path: "/x", more: 1 })).status).toBe(400);
      expect((await post({ path: "/x" }, "y".repeat(64))).status).toBe(401);
      expect((await fetch(`${c.url}/projects`, { headers: { authorization: `Bearer ${c.token}` } })).status).toBe(405);
      expect(seen).toEqual(["/Users/simo/shop"]);
    } finally {
      await c.close();
    }
  });
});

// D-393: the connections of `mandat local` behind the same token; bad ids and bodies are refused before the service.
describe("mandat local control: connections (D-393)", () => {
  it("list, add, models, remove, detect, preferences; a ChatGPT sign-in starts with cli codex", async () => {
    const seen: string[] = [];
    const starts: string[] = [];
    const login = new LoginSessions({ prepare: async () => "images_missing", discard: async () => undefined, spawn: () => { throw new Error("no"); }, status: async () => ({ loggedIn: false, email: null, plan: null }), timeoutMs: 1000 });
    const c = await startControl({
      start: async () => true, stop: async () => undefined, providers: async () => null, accounts: async () => [], ...base(),
      login: { state: () => login.state(), start: async (n, cli) => (starts.push(`${n}:${cli}`), { state: "starting", name: n }), submit: () => null, cancel: () => login.state() },
      connections: {
        list: async () => (seen.push("list"), { connections: [], preferences: { defaultAgent: null, defaultModel: null, onboarded: false } }),
        add: async (b) => (seen.push(`add:${JSON.stringify(b).length > 0}`), { ok: false, error: "bad_key" }),
        setModels: async (id) => (seen.push(`models:${id}`), true),
        remove: async (id) => (seen.push(`remove:${id}`), true),
        detect: async () => (seen.push("detect"), { local: [], envKeys: [] }),
        setPrefs: () => (seen.push("prefs"), true),
      },
    });
    const call = (method: string, p: string, body?: unknown) => fetch(`${c.url}${p}`, { method, headers: { authorization: `Bearer ${c.token}`, "content-type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    try {
      expect((await call("GET", "/connections")).status).toBe(200);
      expect(await (await call("POST", "/connections", { provider: "deepseek", key: "k".repeat(30), models: ["deepseek-v4-pro"] })).json()).toEqual({ ok: false, error: "bad_key" });
      expect((await call("PATCH", "/connections/deepseek", { models: ["m"], defaultModel: "m" })).status).toBe(200);
      expect((await call("PATCH", "/connections/Bad%20Id", { models: ["m"], defaultModel: "m" })).status).toBe(404);
      expect(await (await call("DELETE", "/connections/deepseek")).json()).toEqual({ removed: true });
      expect((await call("GET", "/connections/detect")).status).toBe(200);
      expect((await call("PUT", "/preferences", { onboarded: true })).status).toBe(200);
      expect((await fetch(`${c.url}/connections`, { headers: { authorization: "Bearer nope" } })).status).toBe(401);
      expect((await call("POST", "/accounts/login", { name: "rabota", cli: "codex" })).status).toBe(200);
      expect((await call("POST", "/accounts/login", { name: "rabota", cli: "gemini" })).status).toBe(400);
      expect(starts).toEqual(["rabota:codex"]);
      expect(seen).toEqual(["list", "add:true", "models:deepseek", "remove:deepseek", "detect", "prefs"]);
    } finally {
      await c.close();
    }
  });
});
