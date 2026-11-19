import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sha256Tag } from "@mandat/contract";
import type { BringBody, BringReply } from "@mandat/contract";
import { DEMO_ORG_ID } from "../../../../worker/src/online/seed";
import { postConversationJobBring } from "./api";
import type { ApiDeps } from "./api";
import { RateLimiter } from "./guard";
import { bringJob } from "./job";
import type { KeysClient } from "./keys";
import { asService } from "./sql";
import { U, webDb } from "./web-db.test-helper";

// D-540: "Bring into my folder" on a delivered job — only a person who may approve, from a session with CSRF and origin;
// the worker's control endpoint does the fast-forward; the ledger keeps hashes only (no path).
let db: Awaited<ReturnType<typeof webDb>>;
let who: string | null = U.approver;
const H = `sha256:${"a".repeat(64)}`;
const SHA = "c".repeat(40);
const MIRROR = "/home/s/.mandat/projects/shop.git";
const FOLDER = "/home/s/code/shop";
const calls: BringBody[] = [];
let reply: BringReply | null = { ok: true, folder: FOLDER, from: "b".repeat(40), to: SHA, files: 3 };
const keys = { bring: (b: BringBody) => (calls.push(b), Promise.resolve(reply)) } as unknown as KeysClient;
let deps: ApiDeps;
let repo = "";

beforeAll(async () => {
  db = await webDb();
  deps = { db, user: () => Promise.resolve(who), secondFactor: () => Promise.resolve(null), createLimiter: new RateLimiter(50, 60_000), keys };
  repo = (await asService(db, (sql) => sql.query<{ id: string }>("insert into public.repos (org_id, provider, full_name, remote_url, default_branch) values ($1::uuid, 'local', 'local/shop', $2, 'main') returning id::text as id", [DEMO_ORG_ID, `file://${MIRROR}`]))).rows[0]!.id;
  await asService(db, async (sql) => {
    for (const [c, status] of [["c_bring", "delivered"], ["c_sealed", "sealed"]] as const) {
      await sql.query("insert into public.conversations (id, org_id, repo_id, agent, budget_usd, expires_at, status) values ($1, $2, $3, 'claude', 0.5, now() + interval '1 hour', 'idle')", [c, DEMO_ORG_ID, repo]);
      const seal = JSON.stringify({ spec_hash: H, oracle_hash: H, profile: "feature", verdict: "VERIFIED", result_ref: SHA, unchecked: [] });
      await sql.query(
        "insert into public.jobs (id, org_id, repo_id, conversation_id, spec_hash, oracle_hash, type, agent, status, seal, seal_hash, approved_at, merged_sha) values ($1, $2, $3, $4, $5, $5, 'feature', 'claude', $6, $7::jsonb, $5, now(), $8)",
        [`j_${c.slice(2)}`, DEMO_ORG_ID, repo, c, H, status, seal, status === "delivered" ? SHA : null],
      );
    }
  });
});
afterAll(async () => db.end());
const ledger = async () => (await asService(db, (sql) => sql.query<{ payload_jcs: string }>("select payload_jcs from public.ledger where kind = 'folder_updated' order by seq"))).rows.map((r) => JSON.parse(r.payload_jcs) as Record<string, unknown>);

describe("bring into my folder (D-540)", () => {
  it("a delivered local job: the mirror and the merged commit go to the control endpoint; the ledger keeps hashes", async () => {
    const r = await bringJob(db, keys, { uid: U.approver, org: DEMO_ORG_ID, id: "c_bring", body: {} });
    expect(r).toEqual({ status: 200, body: { result: reply } });
    expect(calls.at(-1)).toEqual({ mirror: MIRROR, sha: SHA });
    const rows = await ledger();
    expect(rows).toEqual([{ conversation: "c_bring", job: "j_bring", from: "b".repeat(40), to: SHA, folder: sha256Tag(FOLDER), by: U.approver }]);
    expect(JSON.stringify(rows)).not.toContain(FOLDER);
  });
  it("a refusal is passed on with its reason and command; nothing goes into the ledger", async () => {
    reply = { ok: false, reason: "dirty", folder: FOLDER, detail: "2", command: `git -C "${FOLDER}" pull --ff-only "${MIRROR}" main` };
    const before = (await ledger()).length;
    expect(await bringJob(db, keys, { uid: U.approver, org: DEMO_ORG_ID, id: "c_bring", body: { branch: "master" } })).toEqual({ status: 200, body: { result: reply } });
    expect(calls.at(-1)).toEqual({ mirror: MIRROR, sha: SHA, branch: "master" });
    expect((await ledger()).length).toBe(before);
  });
  it("only a person who may approve; only a delivered job; a bad body; no control endpoint → refused before anything runs", async () => {
    const n = calls.length;
    expect((await bringJob(db, keys, { uid: U.viewer, org: DEMO_ORG_ID, id: "c_bring", body: {} })).status).toBe(403);
    expect((await bringJob(db, keys, { uid: U.approver, org: DEMO_ORG_ID, id: "c_sealed", body: {} })).body).toEqual({ error: "job_not_delivered" });
    expect((await bringJob(db, keys, { uid: U.approver, org: DEMO_ORG_ID, id: "c_bring", body: { force: true } })).status).toBe(400);
    expect((await bringJob(db, keys, { uid: U.approver, org: DEMO_ORG_ID, id: "c_none", body: {} })).status).toBe(404);
    expect((await bringJob(db, undefined, { uid: U.approver, org: DEMO_ORG_ID, id: "c_bring", body: {} })).body).toEqual({ error: "control_unavailable" });
    expect(calls.length).toBe(n);
  });
  it("the route: a person's session with CSRF and origin", async () => {
    const csrf = "c".repeat(43);
    const req = (h: Record<string, string>) => new Request("http://localhost:3000/api/conversations/c_bring/job/bring", { method: "POST", headers: { host: "localhost:3000", "content-type": "application/json", ...h }, body: "{}" });
    const good = { origin: "http://localhost:3000", cookie: `mandat_csrf=${csrf}`, "x-mandat-csrf": csrf };
    expect((await postConversationJobBring(req(good), deps, "../x")).status).toBe(404);
    expect((await postConversationJobBring(req({ ...good, origin: "http://evil.test" }), deps, "c_bring")).status).toBe(403);
    expect((await postConversationJobBring(req({ origin: "http://localhost:3000" }), deps, "c_bring")).status).toBe(403);
    who = null;
    expect((await postConversationJobBring(req(good), deps, "c_bring")).status).toBe(401);
    who = U.approver;
    expect((await postConversationJobBring(req(good), deps, "c_bring")).status).toBe(200);
  });
});
