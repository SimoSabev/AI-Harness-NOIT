import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sha256Tag } from "@mandat/contract";
import { pgliteDb } from "./pglite-db.test-helper.js";
import { startHostedServer } from "./hosted-server.js";
import { runnerApi } from "./runner-api.js";
import { HttpOutbox, RunnerClient, RunnerHttpError } from "./runner-client.js";
import { PgOutbox } from "./pg-outbox.js";
import { drainOutbox } from "./outbox.js";
import { mintRunnerJwt } from "./runner-jwt.js";

// E10 hosted (D-701/D-702): the runner protocol end to end on PGlite (all migrations) and a real HTTP server.
const A = "a0000000-0000-4000-8000-00000000000a";
const B = "b0000000-0000-4000-8000-00000000000b";
const ANA = "a1000000-0000-4000-8000-000000000001";
const CVETA = "b1000000-0000-4000-8000-000000000001";
const KEY = Buffer.from("j".repeat(48));

let db: Awaited<ReturnType<typeof pgliteDb>>;
let server: Server;
let url: string;
let clock = 0; // seconds added to the real clock (expiry tests)

async function asUser<T>(uid: string, q: string, p: unknown[] = []): Promise<T[]> {
  await db.query("set role authenticated");
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: uid, role: "authenticated" })]);
  try {
    return (await db.query<T>(q, p)).rows;
  } finally {
    await db.query("reset role");
  }
}
const token = async (uid: string, org: string, name: string): Promise<string> => (await asUser<{ t: string }>(uid, "select public.runner_registration_create($1::uuid, $2) as t", [org, name]))[0]?.t ?? "";

beforeAll(async () => {
  db = await pgliteDb();
  await db.query(`insert into auth.users (id, email) values ('${ANA}', 'ana@a.invalid'), ('${CVETA}', 'cveta@b.invalid')`);
  await db.query(`insert into public.orgs (id, name) values ('${A}', 'team-a'), ('${B}', 'team-b')`);
  await db.query(`insert into public.members (org_id, user_id, role, role_id) values ('${A}', '${ANA}', 'viewer', 'builtin:owner'), ('${B}', '${CVETA}', 'viewer', 'builtin:owner')`);
  server = await startHostedServer({ runner: runnerApi({ db, jwtKey: KEY, now: () => Date.now() + clock * 1000 }) }, { host: "127.0.0.1", port: 0 });
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 60_000);
afterAll(async () => {
  await new Promise((r) => server.close(r));
  await db.end?.();
});

describe("hosted server", () => {
  it("/healthz is ok; anything else outside the routes is 404; webhooks off without secrets", async () => {
    expect((await fetch(`${url}/healthz`)).status).toBe(200);
    expect((await fetch(`${url}/api/other`)).status).toBe(404);
    expect((await fetch(`${url}/api/runner/heartbeat`)).status).toBe(404); // GET
    expect((await fetch(`${url}/api/webhooks/github/writer`, { method: "POST", body: "{}" })).status).toBe(503);
  });
});

describe("runner protocol (D-701)", () => {
  it("register once with the owner's token → secret → JWT → heartbeat", async () => {
    const t = await token(ANA, A, "vps-1");
    const c = new RunnerClient({ url });
    const reg = await c.register({ token: t, name: "ignored-name", kinds: ["baseline"] });
    expect(reg.org_id).toBe(A);
    expect(reg.secret).toMatch(/^mrs_[0-9a-f]{64}$/);
    // only hashes are stored
    const row = (await db.query<{ secret_hash: string; name: string }>("select secret_hash, name from public.runners where id = $1", [reg.runner_id])).rows[0];
    expect(row).toEqual({ secret_hash: sha256Tag(reg.secret), name: "vps-1" });
    await expect(new RunnerClient({ url }).register({ token: t, name: "again", kinds: [] })).rejects.toMatchObject({ status: 401 });
    c.login(reg.runner_id, reg.secret);
    expect(await c.heartbeat()).toEqual({ runner_id: reg.runner_id, org_id: A, kinds: ["baseline"] });
  });
  it("bad bodies, a wrong secret, no or a forged token → 400 / 401", async () => {
    const post = (p: string, body: unknown, auth?: string) => fetch(`${url}${p}`, { method: "POST", headers: { "content-type": "application/json", ...(auth ? { authorization: `Bearer ${auth}` } : {}) }, body: typeof body === "string" ? body : JSON.stringify(body) });
    expect((await post("/api/runner/register", "{not json")).status).toBe(400);
    expect((await post("/api/runner/register", { token: "mrr_x", name: "x", kinds: [] })).status).toBe(400);
    expect((await post("/api/runner/token", { runner_id: "3f2a6c1e-8b7d-4e5f-9a0b-1c2d3e4f5a6b", secret: "mrs_" + "0".repeat(64) })).status).toBe(401);
    expect((await post("/api/runner/heartbeat", {})).status).toBe(401);
    const forged = mintRunnerJwt(Buffer.from("z".repeat(48)), { runner: "3f2a6c1e-8b7d-4e5f-9a0b-1c2d3e4f5a6b", org: A, kinds: ["baseline"] }, Math.floor(Date.now() / 1000)).token;
    expect((await post("/api/runner/heartbeat", {}, forged)).status).toBe(401);
    // a well-signed token of a runner that does not exist
    const ghost = mintRunnerJwt(KEY, { runner: "3f2a6c1e-8b7d-4e5f-9a0b-1c2d3e4f5a6b", org: A, kinds: ["baseline"] }, Math.floor(Date.now() / 1000)).token;
    expect((await post("/api/runner/heartbeat", {}, ghost)).status).toBe(401);
    expect((await post("/api/runner/outbox/claim", { limit: 99 }, ghost)).status).toBe(401);
    expect((await fetch(`${url}/api/runner/register`, { method: "POST", body: "x".repeat(70_000) })).status).toBe(413);
  });
  it("the outbox through the runner: its team, its kinds; drainOutbox works unchanged; the hosted drain skips a live lease", async () => {
    const ta = await token(ANA, A, "vps-a2");
    const tb = await token(CVETA, B, "vps-b");
    const ra = new RunnerClient({ url });
    const rb = new RunnerClient({ url });
    const a = await ra.register({ token: ta, name: "x", kinds: ["baseline", "mcp_vet"] });
    const b = await rb.register({ token: tb, name: "x", kinds: ["baseline"] });
    ra.login(a.runner_id, a.secret);
    rb.login(b.runner_id, b.secret);
    await db.query(`insert into public.outbox (org_id, kind, idempotency_key) values ('${A}', 'baseline', 'a:b1'), ('${A}', 'mcp_vet', 'a:m1'), ('${A}', 'merge', 'a:merge'), ('${B}', 'baseline', 'b:b1')`);
    // the hosted worker's own drain while runner B holds b:b1
    const held = await rb.claim(5);
    expect(held.map((r) => r.idempotency_key)).toEqual(["b:b1"]);
    const hostSeen: string[] = [];
    await drainOutbox(new PgOutbox(db), { baseline: async (r) => void hostSeen.push(r.idempotency_key) }, { limit: 50 });
    expect(hostSeen).not.toContain("b:b1");
    // the hosted drain took a:b1 (it had a handler and no lease) — put it back for the runner part
    await db.query("update public.outbox set status = 'pending', done_at = null where idempotency_key = 'a:b1'");
    const seen: string[] = [];
    const r = await drainOutbox(new HttpOutbox(ra), { baseline: async (x) => void seen.push(x.idempotency_key), mcp_vet: () => Promise.reject(new Error("docker down")) });
    expect(seen).toEqual(["a:b1"]);
    expect(r).toEqual({ done: 1, failed: 1, skipped: 0 });
    const st = (await db.query<{ k: string; s: string; a: number; e: string | null }>("select idempotency_key as k, status as s, attempts as a, last_error as e from public.outbox order by id")).rows;
    expect(st.filter((x) => x.k.startsWith("a:"))).toEqual([
      { k: "a:b1", s: "done", a: 0, e: null },
      { k: "a:m1", s: "pending", a: 1, e: "docker down" },
      { k: "a:merge", s: "pending", a: 0, e: null },
    ]);
    // lease lost: B's lease expires, then B reports done → 409
    clock = 0;
    await db.query("update public.outbox set lease_until = now() - interval '1 second' where idempotency_key = 'b:b1'");
    await expect(rb.done(held[0]?.id ?? 0)).rejects.toMatchObject({ status: 409 });
    expect(await rb.claim(5)).toHaveLength(1); // reclaimable after the expiry
    expect((await rb.extend(held[0]?.id ?? 0)).lease_until).toMatch(/Z$/);
    await rb.failed(held[0]?.id ?? 0, "x");
  });
  it("the JWT expires after 15 min; the client gets a fresh one; a revoked runner is refused at once", async () => {
    const t = await token(ANA, A, "vps-rev");
    const c = new RunnerClient({ url, now: () => Date.now() + clock * 1000 });
    const reg = await c.register({ token: t, name: "x", kinds: [] });
    c.login(reg.runner_id, reg.secret);
    await c.heartbeat();
    clock = 16 * 60; // the server and the client both move on
    expect((await c.heartbeat()).runner_id).toBe(reg.runner_id);
    clock = 0;
    await asUser(ANA, "select public.runner_revoke($1::uuid)", [reg.runner_id]);
    await expect(c.heartbeat()).rejects.toBeInstanceOf(RunnerHttpError);
    await expect(c.heartbeat()).rejects.toMatchObject({ status: 401 });
  });
  it("register is rate limited per address", async () => {
    const api = runnerApi({ db, jwtKey: KEY, registerPerMinute: 2 });
    const s = await startHostedServer({ runner: api }, { host: "127.0.0.1", port: 0 });
    const u = `http://127.0.0.1:${(s.address() as AddressInfo).port}/api/runner/register`;
    const codes: number[] = [];
    for (let i = 0; i < 3; i++) codes.push((await fetch(u, { method: "POST", body: "{}" })).status);
    await new Promise((r) => s.close(r));
    expect(codes).toEqual([400, 400, 429]);
  });
});
