import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteKeys, getKeys, postKeys, postRetry } from "./api";
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
};
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
      expect(await c?.accounts()).toEqual([{ name: "work", agent: "claude@work", loggedIn: true, email: "s@example.com", plan: "Max" }]);
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
