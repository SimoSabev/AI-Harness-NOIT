import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteKeys, deleteLogin, getKeys, getLogin, getSystem, postKeys, postLogin, postLoginCode, postLogout, postProject, postRetry, postSystemJob } from "./api";
import type { ApiDeps } from "./api";
import { RateLimiter } from "./guard";
import { controlKeys } from "./keys";
import type { KeysClient } from "./keys";
import { U, webDb } from "./web-db.test-helper";

// D-293: keys from the UI — only the owner sets them; the response never carries a key; no control → 503.
let db: Awaited<ReturnType<typeof webDb>>;
let who: string | null = U.owner;
const set: unknown[] = [];
const fake: KeysClient = {
  status: async () => ({ proxy: "stopped", providers: [] }),
  set: async (k) => (set.push(k), { proxy: "running", providers: k.openai ? ["anthropic", "openai"] : ["anthropic"] }),
  clear: async () => ({ proxy: "stopped", providers: [] }),
  accounts: async () => [],
  login: async (op) => {
    calls.push(op);
    if (op.kind === "code" && op.code.length < 8) return { ok: false, error: "bad_code" };
    if (op.kind === "start") return { ok: true, state: { state: "starting", name: op.name } };
    if (op.kind === "code") return { ok: true, state: { state: "checking", name: "lichno" } };
    return { ok: true, state: { state: "idle" } };
  },
  logout: async (name) => (calls.push({ kind: "logout", name }), true),
  jobs: async () => [job("doctor")],
  runJob: async (j) => (calls.push({ kind: "job", j }), { ...job(j), state: "running" }),
  addProject: async (path) => (calls.push({ kind: "project", path }), { ok: true, repo_id: "d0000000-0000-4000-8000-0000000000c1", full_name: "local/shop", created: true }),
  connections: async () => null, addConnection: async () => null, setModels: async () => null, removeConnection: async () => null, detect: async () => null, setPrefs: async () => false,
};
const job = (j: "doctor" | "images" | "images-ui" | "fixtures" | "fixtures-force" | "stats" | "verify-log") => ({ job: j, state: "idle" as const, started_at: null, finished_at: null, exit: null, lines: [], result: null });
const calls: unknown[] = [];
const deps = (keys: KeysClient | null): ApiDeps => ({ db, user: () => Promise.resolve(who), secondFactor: () => Promise.resolve(null), createLimiter: new RateLimiter(10, 60_000), ...(keys ? { keys } : {}) });
const csrf = "c".repeat(43);
const req = (method: string, body?: unknown) =>
  new Request("http://localhost:3000/api/keys", { method, headers: { host: "localhost:3000", origin: "http://localhost:3000", cookie: `mandat_csrf=${csrf}`, "x-mandat-csrf": csrf, "content-type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
const anthropic = ["sk", "ant", "api03", "k".repeat(40)].join("-");

beforeAll(async () => {
  db = await webDb();
});
afterAll(async () => db.end());

describe("API /api/keys (D-293)", () => {
  it("owner: set → status without the key; approver/viewer → 403; bad body → 400; clear", async () => {
    who = U.owner;
    expect(await (await getKeys(req("GET"), deps(fake))).json()).toEqual({ proxy: "stopped", providers: [] });
    const r = await postKeys(req("POST", { anthropic }), deps(fake));
    const text = await r.text();
    expect([r.status, text.includes(anthropic)]).toEqual([200, false]);
    expect(JSON.parse(text)).toEqual({ proxy: "running", providers: ["anthropic"] });
    expect(set).toEqual([{ anthropic }]);
    expect((await postKeys(req("POST", { anthropic: "x" }), deps(fake))).status).toBe(400);
    expect((await postKeys(req("POST", { anthropic, openai: "" }), deps(fake))).status).toBe(200);
    expect(set[1]).toEqual({ anthropic });
    expect((await deleteKeys(req("DELETE"), deps(fake))).status).toBe(200);
    for (const u of [U.approver, U.viewer]) {
      who = u;
      expect((await postKeys(req("POST", { anthropic }), deps(fake))).status).toBe(403);
    }
    who = U.owner;
    expect((await postKeys(req("POST", { anthropic }), deps(null))).status).toBe(503);
    expect(await (await getKeys(req("GET"), deps(null))).json()).toEqual({ proxy: "unavailable", providers: [] });
  });
});

describe("API /api/accounts (D-369: subscription login from the web)", () => {
  it("owner: start, state, code (never echoed), cancel, logout; approver/viewer → 403; bad input → 400; no control → 503", async () => {
    who = U.owner;
    calls.length = 0;
    expect(await (await postLogin(req("POST", { name: "lichno" }), deps(fake))).json()).toEqual({ state: "starting", name: "lichno" });
    expect((await postLogin(req("POST", { name: "Bad Name" }), deps(fake))).status).toBe(400);
    expect(await (await getLogin(req("GET"), deps(fake))).json()).toEqual({ state: "idle" });
    const code = "AbC-12_3#xYz";
    const r = await postLoginCode(req("POST", { code }), deps(fake));
    const text = await r.text();
    expect([r.status, text.includes(code)]).toEqual([200, false]);
    expect((await postLoginCode(req("POST", { code: "x y" }), deps(fake))).status).toBe(400);
    expect((await deleteLogin(req("DELETE"), deps(fake))).status).toBe(200);
    expect(await (await postLogout(req("POST", { name: "lichno" }), deps(fake))).json()).toEqual({ removed: true });
    expect(calls).toEqual([{ kind: "start", name: "lichno" }, { kind: "state" }, { kind: "code", code }, { kind: "cancel" }, { kind: "logout", name: "lichno" }]);
    for (const u of [U.approver, U.viewer]) {
      who = u;
      expect((await postLogin(req("POST", { name: "lichno" }), deps(fake))).status).toBe(403);
      expect((await getLogin(req("GET"), deps(fake))).status).toBe(403);
      expect((await postLogout(req("POST", { name: "lichno" }), deps(fake))).status).toBe(403);
    }
    who = U.owner;
    expect((await postLogin(req("POST", { name: "lichno" }), deps(null))).status).toBe(503);
  });
});

describe("API /api/system (D-370: the CLI commands from the web)", () => {
  it("owner: list and start a job from the closed list; unknown job → 404; approver/viewer → 403; no control → 503", async () => {
    who = U.owner;
    calls.length = 0;
    expect(await (await getSystem(req("GET"), deps(fake))).json()).toEqual({ jobs: [job("doctor")] });
    expect(await (await postSystemJob(req("POST"), deps(fake), "images")).json()).toMatchObject({ job: "images", state: "running" });
    expect((await postSystemJob(req("POST"), deps(fake), "rm -rf")).status).toBe(404);
    expect(calls).toEqual([{ kind: "job", j: "images" }]);
    for (const u of [U.approver, U.viewer]) {
      who = u;
      expect((await getSystem(req("GET"), deps(fake))).status).toBe(403);
      expect((await postSystemJob(req("POST"), deps(fake), "doctor")).status).toBe(403);
    }
    who = U.owner;
    expect((await postSystemJob(req("POST"), deps(null), "doctor")).status).toBe(503);
  });
});

describe("controlKeys (D-293)", () => {
  it("bearer token to the control endpoint; null without env", async () => {
    let auth = "";
    const srv = createServer((q, s) => {
      auth = String(q.headers.authorization);
      s.writeHead(200, { "content-type": "application/json" });
      s.end(JSON.stringify(q.url === "/accounts" ? { accounts: [{ name: "work", agent: "claude@work", loggedIn: true, email: "s@example.com", plan: "Max" }] } : { proxy: "running", providers: ["anthropic"] }));
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const port = (srv.address() as { port: number }).port;
    try {
      expect(controlKeys({})).toBe(null);
      const c = controlKeys({ MANDAT_LOCAL_CONTROL_URL: `http://127.0.0.1:${port}`, MANDAT_LOCAL_CONTROL_TOKEN: "t".repeat(64) });
      expect(await c?.status()).toEqual({ proxy: "running", providers: ["anthropic"] });
      expect(auth).toBe(`Bearer ${"t".repeat(64)}`);
      expect(await c?.accounts()).toEqual([{ name: "work", agent: "claude@work", loggedIn: true, email: "s@example.com", plan: "Max", cli: "claude" }]); // D-393: an older `mandat local` without cli → Claude
    } finally {
      srv.close();
    }
  });
  it("D-369: login calls go to /accounts/login…; an answer that is not a LoginState (e.g. a foreign address) is refused", async () => {
    const seen: string[] = [];
    let reply: unknown = { state: "waiting_code", name: "lichno", url: "https://claude.com/cai/oauth/authorize?code=true" };
    const srv = createServer((q, s) => {
      let b = "";
      q.on("data", (c: Buffer) => (b += c.toString()));
      q.on("end", () => {
        seen.push(`${q.method} ${q.url} ${b}`);
        const bad = q.url === "/accounts/login/code" && b.includes("short");
        s.writeHead(bad ? 400 : 200, { "content-type": "application/json" });
        s.end(JSON.stringify(bad ? { error: "bad_code" } : q.url === "/accounts/logout" ? { removed: true } : reply));
      });
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const port = (srv.address() as { port: number }).port;
    try {
      const c = controlKeys({ MANDAT_LOCAL_CONTROL_URL: `http://127.0.0.1:${port}`, MANDAT_LOCAL_CONTROL_TOKEN: "t".repeat(64) });
      expect(await c?.login({ kind: "state" })).toEqual({ ok: true, state: reply });
      expect(await c?.login({ kind: "code", code: "short" })).toEqual({ ok: false, error: "bad_code" });
      expect(await c?.logout("lichno")).toBe(true);
      reply = { state: "waiting_code", name: "lichno", url: "https://evil.example/oauth/authorize?x" };
      expect(await c?.login({ kind: "start", name: "lichno" })).toEqual({ ok: false, error: "control_unavailable" });
      expect(seen).toEqual(["GET /accounts/login ", 'POST /accounts/login/code {"code":"short"}', 'POST /accounts/logout {"name":"lichno"}', 'POST /accounts/login {"name":"lichno"}']);
    } finally {
      srv.close();
    }
  });
});

describe("retry after a rejected key (D-293)", () => {
  it("HELD key_rejected / empty_change → CREATED; HELD approval → 409", async () => {
    who = U.owner;
    const mk = async (id: string, wait: string) =>
      db.query(`insert into public.tasks (id, org_id, repo_id, type, agent, text, state, wait_reason) select $1, org_id, repo_id, type, 'claude', 'x', 'HELD', $2 from public.tasks where id = 't_seed_bugfix'`, [id, wait]);
    await mk("t_key_rej", "key_rejected");
    await mk("t_empty_ch", "empty_change");
    await mk("t_appr_wait", "approval");
    const r = (id: string) => postRetry(req("POST", {}), deps(fake), id);
    expect((await r("t_key_rej")).status).toBe(200);
    expect((await r("t_empty_ch")).status).toBe(200);
    expect((await r("t_appr_wait")).status).toBe(409);
  });
});

// D-388: "Add project" from the web — the owner (projects.manage) only; the path is checked here and again in `mandat local`.
describe("API POST /api/repos (D-388)", () => {
  it("owner → the project; approver → 403; a relative path → 400; no `mandat local` → 503", async () => {
    who = U.owner;
    const r = await postProject(req("POST", { path: "/Users/simo/shop" }), deps(fake));
    expect([r.status, await r.json()]).toEqual([200, { ok: true, repo_id: "d0000000-0000-4000-8000-0000000000c1", full_name: "local/shop", created: true }]);
    expect(calls).toContainEqual({ kind: "project", path: "/Users/simo/shop" });
    expect((await postProject(req("POST", { path: "shop" }), deps(fake))).status).toBe(400);
    expect((await postProject(req("POST", { path: "/x" }), deps(null))).status).toBe(503);
    who = U.approver;
    expect((await postProject(req("POST", { path: "/x" }), deps(fake))).status).toBe(403);
    who = U.owner;
  });
});
