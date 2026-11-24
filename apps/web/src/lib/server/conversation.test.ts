import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fakeModel } from "@mandat/research";
import type { ModelClient, RouterChannel } from "@mandat/research";
import { DEMO_ORG_ID, DEMO_REPO_ID } from "../../../../worker/src/online/seed";
import { runConversationOnce } from "../../../../worker/src/online/conversation";
import { readFileSync } from "node:fs";
import path from "node:path";
import { HIDDEN_SEGMENT, MandatError, OracleManifest, hashJcs, oracleHash, oracleTaskText, parseMandatYml, sha256Tag, specHash, specText, subscriptionLimitError } from "@mandat/contract";
import { contractForTask } from "../../../../worker/src/online/daemon";
import { postConversation, postConversationApprove, postConversationJobApprove, postConversationOracle, postConversationOracleApprove, postConversationRetry, postConversationStart, streamConversation } from "./api";
import type { ApiDeps } from "./api";
import { approveOracle, approveSpec, buildOracle, conversationFeed, openConversations, retryConversation, sendMessage, startWork, workText } from "./conversation";
import { RateLimiter } from "./guard";
import { approveJob } from "./job";
import { asService } from "./sql";
import { U, webDb } from "./web-db.test-helper";

// D-531 (E10а ф. 1): the conversation from the web — a message queues it, the worker answers, the page follows the
// turns (SSE), "Start work" makes today's task through createTask, and nothing else starts work.
let db: Awaited<ReturnType<typeof webDb>>;
let deps: ApiDeps;
let who: string | null = U.approver;
beforeAll(async () => {
  db = await webDb();
  deps = { db, user: () => Promise.resolve(who), secondFactor: () => Promise.resolve(null), createLimiter: new RateLimiter(50, 60_000) };
});
afterAll(async () => db.end());

const ch: RouterChannel = { id: "x", label: "x", kind: "local", model: "m-1", enabled: true, health: "ok", quality: 1, cost: 0 };
const brief = { goal: "Round discounts half up", touches: ["src/cart.ts"], avoid: ["the tests"], done_when: ["the cart test passes"] };
const answer = (client: ModelClient) => runConversationOnce({ db, modelFor: () => ({ ok: true, client }) });
const csrf = "c".repeat(43);
const post = (p: string, body: unknown) =>
  new Request(`http://localhost:3000${p}`, { method: "POST", headers: { host: "localhost:3000", origin: "http://localhost:3000", cookie: `mandat_csrf=${csrf}`, "x-mandat-csrf": csrf, "content-type": "application/json" }, body: JSON.stringify(body) });
const get = (p: string) => new Request(`http://localhost:3000${p}`, { headers: { host: "localhost:3000" } });
const tasks = async () => Number((await asService(db, (sql) => sql.query<{ n: number }>("select count(*)::int as n from public.tasks"))).rows[0]?.n);
const msg = { text: "round discounts half up", agent: "fake:honest-fix", repo: DEMO_REPO_ID };

describe("the conversation in the web (D-531)", () => {
  it("a message opens a conversation; a viewer cannot write; a bad body or a busy conversation is refused", async () => {
    const r = await sendMessage(db, { uid: U.approver, org: DEMO_ORG_ID, body: msg });
    expect(r.status).toBe(201);
    const id = String(r.body.id);
    expect((await conversationFeed(db, U.viewer, DEMO_ORG_ID, id, -1))?.conversation).toMatchObject({ status: "queued", phase: "conversation", agent: "fake:honest-fix" });
    expect((await sendMessage(db, { uid: U.approver, org: DEMO_ORG_ID, body: { ...msg, conversation: id } })).body).toEqual({ error: "answering" });
    expect((await sendMessage(db, { uid: U.viewer, org: DEMO_ORG_ID, body: msg })).status).toBe(403);
    expect((await sendMessage(db, { uid: U.approver, org: DEMO_ORG_ID, body: { text: "x", agent: "nobody here" } })).status).toBe(400);
    expect(await conversationFeed(db, U.viewer, "00000000-0000-4000-8000-000000000999", id, -1)).toBeNull();
  });
  it("a proposed brief makes no task; Start work does, from the brief and the person's words, once", async () => {
    const before = await tasks();
    const r = await sendMessage(db, { uid: U.approver, org: DEMO_ORG_ID, body: msg });
    const id = String(r.body.id);
    await db.query("update public.conversations set status = 'idle' where id <> $1 and status = 'queued'", [id]);
    expect(await answer(fakeModel(ch, () => JSON.stringify({ say: "Like this?", call: { tool: "propose_brief", brief } })))).toBe(id);
    const f = (await conversationFeed(db, U.viewer, DEMO_ORG_ID, id, -1))!;
    expect(f.turns.map((t) => t.kind)).toEqual(["human", "assistant"]);
    expect(f.conversation.status).toBe("idle");
    expect(await tasks()).toBe(before);
    expect(workText(f.turns)).toBe("Goal: Round discounts half up\nTouches: src/cart.ts\nDo not touch: the tests\nDone when: the cart test passes\n\nround discounts half up");
    expect((await startWork(db, { uid: U.viewer, org: DEMO_ORG_ID, id })).status).toBe(403);
    const s = await startWork(db, { uid: U.approver, org: DEMO_ORG_ID, id });
    expect(s.status).toBe(201);
    expect(await tasks()).toBe(before + 1);
    const t = (await asService(db, (sql) => sql.query<{ text: string; agent: string; type: string }>("select text, agent, type from public.tasks where id = $1", [s.body.id]))).rows[0];
    expect(t).toMatchObject({ agent: "fake:honest-fix", type: "bugfix" });
    expect(t?.text).toContain("Goal: Round discounts half up");
    expect((await conversationFeed(db, U.viewer, DEMO_ORG_ID, id, -1))?.conversation).toMatchObject({ phase: "work", task_id: s.body.id });
    expect((await startWork(db, { uid: U.approver, org: DEMO_ORG_ID, id })).body).toEqual({ error: "work_started" });
    expect((await sendMessage(db, { uid: U.approver, org: DEMO_ORG_ID, body: { ...msg, conversation: id } })).body).toEqual({ error: "work_started" });
  });
  it("an overloaded provider can be retried on another model; a spent budget cannot be written past", async () => {
    const id = String((await sendMessage(db, { uid: U.approver, org: DEMO_ORG_ID, body: msg })).body.id);
    await answer({ channel: ch, complete: async () => Promise.reject(new Error("model endpoint answered 529")) });
    expect((await conversationFeed(db, U.viewer, DEMO_ORG_ID, id, -1))?.conversation.status).toBe("overloaded");
    expect((await retryConversation(db, { uid: U.approver, org: DEMO_ORG_ID, id, body: { agent: "claude", model: "claude-haiku-5-5" } })).status).toBe(200);
    expect((await conversationFeed(db, U.viewer, DEMO_ORG_ID, id, -1))?.conversation).toMatchObject({ status: "queued", agent: "claude", model: "claude-haiku-5-5" });
    expect((await retryConversation(db, { uid: U.approver, org: DEMO_ORG_ID, id, body: { agent: "claude" } })).body).toEqual({ error: "not_retryable" });
    await asService(db, (sql) => sql.query("update public.conversations set status = 'budget' where id = $1", [id]));
    expect((await sendMessage(db, { uid: U.approver, org: DEMO_ORG_ID, body: { ...msg, conversation: id } })).body).toEqual({ error: "budget" });
  });
  it("live test 24.11: a spent subscription is the limit stop with its reset, and it can be retried on another account or model", async () => {
    const id = String((await sendMessage(db, { uid: U.approver, org: DEMO_ORG_ID, body: msg })).body.id);
    await answer({ channel: ch, complete: async () => Promise.reject(new MandatError("E_SUBSCRIPTION_LIMIT", subscriptionLimitError("2026-11-26T09:00:00.000Z"))) });
    expect((await conversationFeed(db, U.viewer, DEMO_ORG_ID, id, -1))?.conversation).toMatchObject({ status: "limit", error: "subscription_limit resets 2026-11-26T09:00:00.000Z" });
    expect((await retryConversation(db, { uid: U.approver, org: DEMO_ORG_ID, id, body: { agent: "claude", model: "claude-haiku-5-5" } })).status).toBe(200);
  });
  it("the routes: CSRF and origin guarded posts, an SSE feed that closes once the answer is in", async () => {
    const r = await postConversation(post("/api/conversations", msg), deps);
    expect(r.status).toBe(201);
    const id = String(((await r.json()) as { id: string }).id);
    expect((await postConversation(new Request("http://localhost:3000/api/conversations", { method: "POST", headers: { host: "localhost:3000", origin: "http://evil.test" }, body: "{}" }), deps)).status).toBe(403);
    expect((await streamConversation(get("/api/conversations/x/stream"), deps, "../x")).status).toBe(404);
    expect((await streamConversation(get(`/api/conversations/${id}/stream?after=x`), deps, id)).status).toBe(400);
    expect((await postConversationRetry(post(`/api/conversations/${id}/retry`, { agent: "claude" }), deps, id)).status).toBe(409);
    const stream = await streamConversation(get(`/api/conversations/${id}/stream`), deps, id, { intervalMs: 20, maxMs: 3000 });
    expect(stream.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
    const reading = stream.text();
    await db.query("update public.conversations set status = 'idle' where id <> $1 and status = 'queued'", [id]);
    await answer(fakeModel(ch, () => JSON.stringify({ say: "Hi", call: null })));
    const feeds = (await reading).split("\n\n").filter((b) => b.startsWith("event: feed")).map((b) => JSON.parse(/^data: (.*)$/m.exec(b)?.[1] ?? "null") as { conversation: { status: string }; turns: { kind: string }[] });
    expect(feeds[0]?.turns.map((t) => t.kind)).toEqual(["human"]);
    expect(feeds.at(-1)?.conversation.status).toBe("idle");
    expect(feeds.flatMap((f) => f.turns.map((t) => t.kind))).toEqual(["human", "assistant"]);
    who = null;
    expect((await postConversationStart(post(`/api/conversations/${id}/start`, {}), deps, id)).status).toBe(401);
    who = U.approver;
  });
});

// D-533 (М1 Х2): a proposed spec, approved only by a person (approve.level1), its hash in the ledger and in the task.
const known = { code: "existing", reference: "none", divisible: "no", proof: ["tests"], risk: { level: "low", outward: false }, size: "m" };
const spec = {
  goal: "Round discounts half up",
  product: "The cart rounds a discount that ends in .5 up.",
  criteria: [{ id: "AC-1", when: "a discount ends in .5", shall: "round it up", proof: "tests" }],
  unchanged: ["whole-number totals"],
  out_of_scope: ["currencies"],
  profile: "feature",
} as const;
/** a conversation whose model proposed the axes and then a spec (ready when the axes are all known) */
async function proposed(axes: Record<string, unknown>): Promise<string> {
  const id = String((await sendMessage(db, { uid: U.approver, org: DEMO_ORG_ID, body: msg })).body.id);
  await db.query("update public.conversations set status = 'idle' where id <> $1 and status = 'queued'", [id]);
  let n = 0;
  const answers = [{ say: "", call: { tool: "propose_axes", axes } }, { say: "Approve it if it looks right", call: { tool: "propose_spec", spec } }, { say: "What size?", call: { tool: "ask_user", questions: ["How big?"] } }];
  await answer(fakeModel(ch, () => JSON.stringify(answers[n++])));
  return id;
}
const ledgerRows = async (kind: string) => (await asService(db, (sql) => sql.query<{ task_id: string | null; payload_jcs: string }>("select task_id, payload_jcs from public.ledger where kind = $1 order by seq", [kind]))).rows;

describe("the spec in the web (D-533)", () => {
  it("a spec with unknown axes cannot be approved; the feed shows the profile and the unknown axes", async () => {
    const id = await proposed({ ...known, size: "unknown" });
    const f = (await conversationFeed(db, U.viewer, DEMO_ORG_ID, id, -1))!;
    expect(f.conversation).toMatchObject({ profile: "feature", unknown_axes: ["size"], spec_ready: false, approved_spec_hash: null });
    expect(f.turns.map((t) => t.kind)).toEqual(["human", "axes", "spec", "assistant"]);
    const hash = f.conversation.spec_hash!;
    expect((await approveSpec(db, { uid: U.approver, org: DEMO_ORG_ID, id, body: { spec_hash: hash } })).body).toEqual({ error: "spec_not_ready" });
  });
  it("only a person with the approver's capability approves, and only the hash they saw; the ledger keeps the hash, not the text", async () => {
    const id = await proposed(known);
    const f = (await conversationFeed(db, U.viewer, DEMO_ORG_ID, id, -1))!;
    expect(f.conversation).toMatchObject({ profile: "feature", unknown_axes: [], spec_ready: true, approved_spec_hash: null });
    const hash = f.conversation.spec_hash!;
    expect(hash).toBe(specHash(spec));
    // the model's answer approved nothing: a ready spec waits for a person
    expect(await ledgerRows("spec_approved")).toEqual([]);
    expect((await approveSpec(db, { uid: U.viewer, org: DEMO_ORG_ID, id, body: { spec_hash: hash } })).status).toBe(403);
    expect((await approveSpec(db, { uid: U.approver, org: DEMO_ORG_ID, id, body: { spec_hash: `sha256:${"0".repeat(64)}` } })).body).toEqual({ error: "spec_changed" });
    expect((await approveSpec(db, { uid: U.approver, org: DEMO_ORG_ID, id, body: { spec_hash: "x" } })).status).toBe(400);
    const ok = await approveSpec(db, { uid: U.approver, org: DEMO_ORG_ID, id, body: { spec_hash: hash } });
    expect(ok).toEqual({ status: 200, body: { id, spec_hash: hash } });
    expect((await approveSpec(db, { uid: U.owner, org: DEMO_ORG_ID, id, body: { spec_hash: hash } })).body).toEqual({ error: "already_approved" });
    const rows = await ledgerRows("spec_approved");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.task_id).toBeNull();
    expect(JSON.parse(rows[0]!.payload_jcs)).toEqual({ conversation: id, spec_hash: hash, profile: "feature", by: U.approver });
    expect(rows[0]!.payload_jcs).not.toContain("Round discounts");
    expect((await conversationFeed(db, U.viewer, DEMO_ORG_ID, id, -1))?.conversation.approved_spec_hash).toBe(hash);
  });
  it("Start work with an approved spec: the task is the spec, its hash is on the task and sealed into the contract", async () => {
    const id = await proposed(known);
    const hash = (await conversationFeed(db, U.viewer, DEMO_ORG_ID, id, -1))!.conversation.spec_hash!;
    expect((await approveSpec(db, { uid: U.approver, org: DEMO_ORG_ID, id, body: { spec_hash: hash } })).status).toBe(200);
    await approvedOracle(id, hash); // D-534: the feature profile's plan has hidden tests
    // D-535: with the approved oracle this is a job; its unit tasks carry the hash (the worker's job tests)
    const s = await startWork(db, { uid: U.approver, org: DEMO_ORG_ID, id });
    expect(s.status).toBe(201);
    const j = (await asService(db, (sql) => sql.query<{ spec_hash: string }>("select spec_hash from public.jobs where id = $1", [s.body.job]))).rows[0];
    expect(j).toEqual({ spec_hash: hash });
    const t = { id: "t_x", type: "bugfix" as const, text: specText(spec), agent: "fake:honest-fix", spec_hash: hash };
    const p = parseMandatYml(readFileSync(path.resolve(__dirname, "../../../../../fixtures/demo-shop/.mandat.yml"), "utf8"));
    if (!p.ok) throw new Error(p.error);
    expect(contractForTask(t, p.policy, "a".repeat(40)).spec_hash).toBe(hash);
  });
  it("D-572: a parked job lets a person build the oracle again; the job is superseded and the conversation is open again", async () => {
    const id = await proposed(known);
    const hash = (await conversationFeed(db, U.viewer, DEMO_ORG_ID, id, -1))!.conversation.spec_hash!;
    await approveSpec(db, { uid: U.approver, org: DEMO_ORG_ID, id, body: { spec_hash: hash } });
    await approvedOracle(id, hash);
    const s = await startWork(db, { uid: U.approver, org: DEMO_ORG_ID, id });
    // while the job runs, the approved oracle stays as it is
    expect((await buildOracle(db, { uid: U.approver, org: DEMO_ORG_ID, id })).body).toEqual({ error: "work_started" });
    await asService(db, (sql) => sql.query("update public.jobs set status = 'parked' where id = $1", [s.body.job]));
    expect((await buildOracle(db, { uid: U.viewer, org: DEMO_ORG_ID, id })).status).toBe(403);
    const b = await buildOracle(db, { uid: U.approver, org: DEMO_ORG_ID, id });
    expect(b.status).toBe(201);
    const j = (await asService(db, (sql) => sql.query<{ status: string; question: string }>("select status, question from public.jobs where id = $1", [s.body.job]))).rows[0];
    expect(j?.status).toBe("parked");
    expect(j?.question).toMatch(/^oracle_superseded/);
    const c = (await asService(db, (sql) => sql.query<{ phase: string }>("select phase from public.conversations where id = $1", [id]))).rows[0];
    expect(c?.phase).toBe("conversation");
  });
  it("live test 24.11: the oracle built again after a parked job learns which mutants its tests let through", async () => {
    const id = await proposed(known);
    const hash = (await conversationFeed(db, U.viewer, DEMO_ORG_ID, id, -1))!.conversation.spec_hash!;
    await approveSpec(db, { uid: U.approver, org: DEMO_ORG_ID, id, body: { spec_hash: hash } });
    await approvedOracle(id, hash);
    const s = await startWork(db, { uid: U.approver, org: DEMO_ORG_ID, id });
    await asService(db, async (sql) => {
      const t = (await sql.query<{ id: string }>("select id from public.tasks order by created_at desc limit 1")).rows[0]!.id;
      const v = (await sql.query<{ id: string }>("insert into public.verdicts (org_id, task_id, run_id, attempt, mode, agent, result, reasons, base_sha, verdict_hash) values ($1, $2, 'r_01J0000000000000000000000A', 1, 'full', 'claude', 'UNKNOWN', '[\"D11:survived:src/giftcards/checkout.ts:16\"]', $3, 'sha256:00') returning id", [DEMO_ORG_ID, t, "a".repeat(40)])).rows[0]!.id;
      await sql.query("insert into public.evidence (org_id, verdict_id, detector, phase, status, summary, data, source) values ($1, $2, 'D11.mutation', 2, 'unknown', '1/3 mutants survived', $3, 'worker')", [DEMO_ORG_ID, v, JSON.stringify({ sites: 3, killed: 2, survived: [{ path: "src/giftcards/checkout.ts", line: 16, from: "0", to: "1" }] })]);
      await sql.query("update public.jobs set status = 'parked', final_task_id = $2 where id = $1", [s.body.job, t]);
    });
    const b = await buildOracle(db, { uid: U.approver, org: DEMO_ORG_ID, id });
    expect(b.status).toBe(201);
    const text = (await asService(db, (sql) => sql.query<{ text: string }>("select text from public.tasks where id = $1", [b.body.task_id]))).rows[0]!.text;
    expect(text).toContain("src/giftcards/checkout.ts:16 0 → 1");
    expect(text).toContain("AC-1");
  });
  it("D-593: a person's note on Build oracle again reaches the oracle agent; a bad body is refused", async () => {
    const id = await proposed(known);
    const hash = (await conversationFeed(db, U.viewer, DEMO_ORG_ID, id, -1))!.conversation.spec_hash!;
    await approveSpec(db, { uid: U.approver, org: DEMO_ORG_ID, id, body: { spec_hash: hash } });
    await approvedOracle(id, hash);
    const s = await startWork(db, { uid: U.approver, org: DEMO_ORG_ID, id });
    await asService(db, (sql) => sql.query("update public.jobs set status = 'parked' where id = $1", [s.body.job]));
    expect((await buildOracle(db, { uid: U.approver, org: DEMO_ORG_ID, id, body: { note: "x".repeat(1001) } })).body).toEqual({ error: "bad_body" });
    const b = await buildOracle(db, { uid: U.approver, org: DEMO_ORG_ID, id, body: { note: "AC-1: a second call for the same order adds no points" } });
    expect(b.status).toBe(201);
    const text = (await asService(db, (sql) => sql.query<{ text: string }>("select text from public.tasks where id = $1", [b.body.task_id]))).rows[0]!.text;
    expect(text).toContain("AC-1: a second call for the same order adds no points");
    expect(text).toContain("Acceptance criteria:");
  });
  it("Start work without an approved spec keeps D-531: a proposed but unapproved spec does not reach the task", async () => {
    const id = await proposed(known);
    const s = await startWork(db, { uid: U.approver, org: DEMO_ORG_ID, id });
    const t = (await asService(db, (sql) => sql.query<{ text: string; spec_hash: string | null }>("select text, spec_hash from public.tasks where id = $1", [s.body.id]))).rows[0];
    expect(t).toEqual({ text: "round discounts half up", spec_hash: null });
  });
  it("the approve route: a person's session with CSRF and origin; a bad id is unknown", async () => {
    const id = await proposed(known);
    const hash = (await conversationFeed(db, U.viewer, DEMO_ORG_ID, id, -1))!.conversation.spec_hash!;
    expect((await postConversationApprove(post(`/api/conversations/x/approve`, { spec_hash: hash }), deps, "../x")).status).toBe(404);
    expect((await postConversationApprove(new Request(`http://localhost:3000/api/conversations/${id}/approve`, { method: "POST", headers: { host: "localhost:3000", origin: "http://evil.test" }, body: "{}" }), deps, id)).status).toBe(403);
    who = null;
    expect((await postConversationApprove(post(`/api/conversations/${id}/approve`, { spec_hash: hash }), deps, id)).status).toBe(401);
    who = U.approver;
    expect((await postConversationApprove(post(`/api/conversations/${id}/approve`, { spec_hash: hash }), deps, id)).status).toBe(200);
  });
});

// D-534 (М1 Х3): the oracle of an approved spec. A person builds it (a task of kind oracle), the worker makes it ready
// (simulated here with the row the worker writes), a person approves it, and only then Start work carries its hash.
const TEST = Buffer.from("it('AC-1: rounds .5 up', () => {});");
/** what the worker writes when the oracle's tests are red on base for every criterion (finishOracle) */
async function workerMadeReady(oracleId: string, hash: string): Promise<string> {
  const m = OracleManifest.parse({ spec_hash: hash, hidden_tests: [{ path: "tests/__hidden__/cart.spec.ts", sha256: sha256Tag(TEST) }], red_on_base: [{ criterion_id: "AC-1", red: true }] });
  const h = oracleHash(m);
  await asService(db, (sql) => sql.query("update public.oracles set status = 'ready', manifest = $2::jsonb, red_on_base = $3::jsonb, oracle_hash = $4, hidden_version = 1 where id = $1", [oracleId, JSON.stringify(m), JSON.stringify(m.red_on_base), h]));
  return h;
}
async function approvedOracle(id: string, hash: string): Promise<string> {
  const b = await buildOracle(db, { uid: U.approver, org: DEMO_ORG_ID, id });
  expect(b.status).toBe(201);
  const h = await workerMadeReady(String(b.body.id), hash);
  expect((await approveOracle(db, { uid: U.approver, org: DEMO_ORG_ID, id, body: { oracle_hash: h } })).status).toBe(200);
  return h;
}
async function approvedSpec(): Promise<{ id: string; hash: string }> {
  const id = await proposed(known);
  const hash = (await conversationFeed(db, U.viewer, DEMO_ORG_ID, id, -1))!.conversation.spec_hash!;
  expect((await approveSpec(db, { uid: U.approver, org: DEMO_ORG_ID, id, body: { spec_hash: hash } })).status).toBe(200);
  return { id, hash };
}

describe("the oracle in the web (D-534)", () => {
  it("Build oracle: only for an approved spec, by a person who may start tasks; a task of kind oracle with the oracle's text, once at a time", async () => {
    const id = await proposed(known);
    expect((await buildOracle(db, { uid: U.approver, org: DEMO_ORG_ID, id })).body).toEqual({ error: "spec_not_approved" });
    const hash = (await conversationFeed(db, U.viewer, DEMO_ORG_ID, id, -1))!.conversation.spec_hash!;
    await approveSpec(db, { uid: U.approver, org: DEMO_ORG_ID, id, body: { spec_hash: hash } });
    expect((await buildOracle(db, { uid: U.viewer, org: DEMO_ORG_ID, id })).status).toBe(403);
    const b = await buildOracle(db, { uid: U.approver, org: DEMO_ORG_ID, id });
    expect(b.status).toBe(201);
    const t = (await asService(db, (sql) => sql.query<{ kind: string; text: string; spec_hash: string; oracle_hash: string | null }>("select kind, text, spec_hash, oracle_hash from public.tasks where id = $1", [b.body.task_id]))).rows[0];
    expect(t).toEqual({ kind: "oracle", text: oracleTaskText(spec), spec_hash: hash, oracle_hash: null });
    expect(t?.text).toContain(`a ${HIDDEN_SEGMENT} folder inside a directory the project's test runner already discovers`);
    expect((await buildOracle(db, { uid: U.approver, org: DEMO_ORG_ID, id })).body).toEqual({ error: "oracle_building" });
    const f = (await conversationFeed(db, U.viewer, DEMO_ORG_ID, id, -1))!;
    expect(f.oracle_required).toBe(true);
    expect(f.oracle).toMatchObject({ id: b.body.id, status: "building", spec_hash: hash, oracle_hash: null, tests: 0 });
  });
  it("D-571: building again after a not-ready oracle tells the agent which names its last API.md left out", async () => {
    const id = await proposed(known);
    const hash = (await conversationFeed(db, U.viewer, DEMO_ORG_ID, id, -1))!.conversation.spec_hash!;
    await approveSpec(db, { uid: U.approver, org: DEMO_ORG_ID, id, body: { spec_hash: hash } });
    const first = await buildOracle(db, { uid: U.approver, org: DEMO_ORG_ID, id });
    await asService(db, (sql) => sql.query("update public.oracles set status = 'not_ready', problems = $2::jsonb where id = $1", [first.body.id, JSON.stringify([{ kind: "no_api", id: "checkoutOrder" }, { kind: "no_api", id: "placeOrderRedeeming" }, { kind: "green_on_base", id: "AC-1" }])]));
    // an attempt that failed in between (the agent stopped) does not lose the note
    const failed = await buildOracle(db, { uid: U.approver, org: DEMO_ORG_ID, id });
    await asService(db, (sql) => sql.query("update public.oracles set status = 'failed', problems = $2::jsonb where id = $1", [failed.body.id, JSON.stringify([{ kind: "not_run", id: "agent_exit_1" }])]));
    const again = await buildOracle(db, { uid: U.approver, org: DEMO_ORG_ID, id });
    const text =(await asService(db, (sql) => sql.query<{ text: string }>("select text from public.tasks where id = $1", [again.body.task_id]))).rows[0]!.text;
    expect(text).toContain("checkoutOrder, placeOrderRedeeming");
    expect(text).toContain("green_on_base: AC-1");
    expect(text.length).toBeLessThanOrEqual(4000);
  });
  it("Start work is blocked without an approved oracle when the plan has hidden tests (also while it is only ready)", async () => {
    const { id, hash } = await approvedSpec();
    const before = await tasks();
    expect((await startWork(db, { uid: U.approver, org: DEMO_ORG_ID, id })).body).toEqual({ error: "oracle_not_approved" });
    const b = await buildOracle(db, { uid: U.approver, org: DEMO_ORG_ID, id });
    await workerMadeReady(String(b.body.id), hash);
    expect((await startWork(db, { uid: U.approver, org: DEMO_ORG_ID, id })).body).toEqual({ error: "oracle_not_approved" });
    expect(await tasks()).toBe(before + 1); // only the oracle's own task
  });
  it("approve: a person with the approver's capability, the ready oracle's hash they saw; the ledger keeps hashes and counts, no test", async () => {
    const { id, hash } = await approvedSpec();
    expect((await approveOracle(db, { uid: U.approver, org: DEMO_ORG_ID, id, body: { oracle_hash: `sha256:${"0".repeat(64)}` } })).body).toEqual({ error: "oracle_not_ready" });
    const b = await buildOracle(db, { uid: U.approver, org: DEMO_ORG_ID, id });
    expect((await approveOracle(db, { uid: U.approver, org: DEMO_ORG_ID, id, body: { oracle_hash: `sha256:${"0".repeat(64)}` } })).body).toEqual({ error: "oracle_not_ready" });
    const h = await workerMadeReady(String(b.body.id), hash);
    expect((await conversationFeed(db, U.viewer, DEMO_ORG_ID, id, -1))!.oracle).toMatchObject({ status: "ready", oracle_hash: h, tests: 1, red_on_base: [{ criterion_id: "AC-1", red: true }] });
    expect((await approveOracle(db, { uid: U.viewer, org: DEMO_ORG_ID, id, body: { oracle_hash: h } })).status).toBe(403);
    expect((await approveOracle(db, { uid: U.approver, org: DEMO_ORG_ID, id, body: { oracle_hash: `sha256:${"0".repeat(64)}` } })).body).toEqual({ error: "oracle_changed" });
    expect((await approveOracle(db, { uid: U.approver, org: DEMO_ORG_ID, id, body: { oracle_hash: "x" } })).status).toBe(400);
    // a stored hash that is not the manifest's own hash is never approved
    await asService(db, (sql) => sql.query("update public.oracles set oracle_hash = $2 where id = $1", [b.body.id, `sha256:${"1".repeat(64)}`]));
    expect((await approveOracle(db, { uid: U.approver, org: DEMO_ORG_ID, id, body: { oracle_hash: `sha256:${"1".repeat(64)}` } })).body).toEqual({ error: "oracle_not_ready" });
    await asService(db, (sql) => sql.query("update public.oracles set oracle_hash = $2 where id = $1", [b.body.id, h]));
    expect(await approveOracle(db, { uid: U.approver, org: DEMO_ORG_ID, id, body: { oracle_hash: h } })).toEqual({ status: 200, body: { id, oracle_hash: h } });
    expect((await approveOracle(db, { uid: U.owner, org: DEMO_ORG_ID, id, body: { oracle_hash: h } })).body).toEqual({ error: "already_approved" });
    const rows = await ledgerRows("oracle_approved");
    const mine = rows.filter((r) => (JSON.parse(r.payload_jcs) as { conversation: string }).conversation === id);
    expect(mine).toHaveLength(1);
    expect(JSON.parse(mine[0]!.payload_jcs)).toEqual({ conversation: id, oracle: b.body.id, oracle_hash: h, spec_hash: hash, tests: 1, criteria: 1, by: U.approver });
    expect(mine[0]!.payload_jcs).not.toContain("cart.spec.ts");
    expect(mine[0]!.payload_jcs).not.toContain("rounds .5 up");
    expect((await conversationFeed(db, U.viewer, DEMO_ORG_ID, id, -1))!.oracle?.status).toBe("approved");
    expect((await buildOracle(db, { uid: U.approver, org: DEMO_ORG_ID, id })).body).toEqual({ error: "oracle_approved" });
  });
  it("Start work with the approved oracle makes a job (D-535): both hashes on the job, no task yet; a unit's contract seals both", async () => {
    const { id, hash } = await approvedSpec();
    const h = await approvedOracle(id, hash);
    const before = await tasks();
    const s = await startWork(db, { uid: U.approver, org: DEMO_ORG_ID, id });
    expect(s).toMatchObject({ status: 201, body: { job: expect.stringMatching(/^j_/), state: "planning" } });
    expect(await tasks()).toBe(before);
    const j = (await asService(db, (sql) => sql.query<{ status: string; spec_hash: string; oracle_hash: string; repo_id: string }>("select status, spec_hash, oracle_hash, repo_id::text as repo_id from public.jobs where id = $1", [s.body.job]))).rows[0];
    expect(j).toEqual({ status: "planning", spec_hash: hash, oracle_hash: h, repo_id: DEMO_REPO_ID });
    const f = (await conversationFeed(db, U.viewer, DEMO_ORG_ID, id, -1))!;
    expect(f.conversation.phase).toBe("work");
    expect(f.job).toMatchObject({ id: s.body.job, status: "planning", units: [], seal: null });
    expect((await startWork(db, { uid: U.approver, org: DEMO_ORG_ID, id })).body).toEqual({ error: "work_started" });
    const t = { id: "t_x", type: "bugfix" as const, text: specText(spec), agent: "fake:honest-fix", spec_hash: hash, oracle_hash: h };
    const p = parseMandatYml(readFileSync(path.resolve(__dirname, "../../../../../fixtures/demo-shop/.mandat.yml"), "utf8"));
    if (!p.ok) throw new Error(p.error);
    const c = contractForTask(t, p.policy, "a".repeat(40));
    expect(c).toMatchObject({ spec_hash: hash, oracle_hash: h });
    expect(c.text).not.toContain("cart.spec.ts");
  });
  it("the sealed job: the feed shows units and checked / not checked; only a person who may approve, with the seal's hash, approves; the ledger keeps hashes", async () => {
    const { id, hash } = await approvedSpec();
    const h = await approvedOracle(id, hash);
    const job = String((await startWork(db, { uid: U.approver, org: DEMO_ORG_ID, id })).body.job);
    expect((await approveJob(db, { uid: U.approver, org: DEMO_ORG_ID, id, body: { seal_hash: `sha256:${"0".repeat(64)}` } })).body).toEqual({ error: "job_not_sealed" });
    const seal = { spec_hash: hash, oracle_hash: h, profile: "feature", verdict: "VERIFIED", result_ref: "c".repeat(40), unchecked: ["D11.oracle: not run"] };
    const sh = hashJcs(seal);
    await asService(db, async (sql) => {
      await sql.query("insert into public.job_units (job_id, unit_id, org_id, ord, title, criteria, status, result) values ($1, 'u1', $2::uuid, 0, 'the rule', $3::jsonb, 'passed', 'VERIFIED')", [job, DEMO_ORG_ID, JSON.stringify(["AC-1"])]);
      await sql.query("update public.jobs set status = 'sealed', seal = $2::jsonb, seal_hash = $3 where id = $1", [job, JSON.stringify(seal), sh]);
    });
    const f = (await conversationFeed(db, U.viewer, DEMO_ORG_ID, id, -1))!;
    expect(f.job).toMatchObject({ status: "sealed", units: [{ id: "u1", criteria: ["AC-1"], status: "passed", result: "VERIFIED" }], seal: { hash: sh, verdict: "VERIFIED", checked: ["AC-1"], unchecked: ["D11.oracle: not run"] } });
    expect((await approveJob(db, { uid: U.viewer, org: DEMO_ORG_ID, id, body: { seal_hash: sh } })).status).toBe(403);
    expect((await approveJob(db, { uid: U.approver, org: DEMO_ORG_ID, id, body: { seal_hash: `sha256:${"0".repeat(64)}` } })).body).toEqual({ error: "seal_changed" });
    expect((await approveJob(db, { uid: U.approver, org: DEMO_ORG_ID, id, body: { seal_hash: "x" } })).status).toBe(400);
    expect(await approveJob(db, { uid: U.approver, org: DEMO_ORG_ID, id, body: { seal_hash: sh } })).toEqual({ status: 200, body: { job, seal_hash: sh } });
    expect((await approveJob(db, { uid: U.owner, org: DEMO_ORG_ID, id, body: { seal_hash: sh } })).body).toEqual({ error: "already_approved" });
    const mine = (await ledgerRows("job_approved")).filter((r) => (JSON.parse(r.payload_jcs) as { job: string }).job === job);
    expect(mine.map((r) => JSON.parse(r.payload_jcs) as unknown)).toEqual([{ conversation: id, job, seal_hash: sh, result_ref: "c".repeat(40), by: U.approver }]);
    expect((await conversationFeed(db, U.viewer, DEMO_ORG_ID, id, -1))!.job?.status).toBe("approved");
  });
  it("the job approve route: a person's session with CSRF and origin", async () => {
    const { id, hash } = await approvedSpec();
    await approvedOracle(id, hash);
    await startWork(db, { uid: U.approver, org: DEMO_ORG_ID, id });
    expect((await postConversationJobApprove(post("/api/conversations/x/job/approve", {}), deps, "../x")).status).toBe(404);
    expect((await postConversationJobApprove(new Request(`http://localhost:3000/api/conversations/${id}/job/approve`, { method: "POST", headers: { host: "localhost:3000", origin: "http://evil.test" }, body: "{}" }), deps, id)).status).toBe(403);
    who = null;
    expect((await postConversationJobApprove(post(`/api/conversations/${id}/job/approve`, { seal_hash: `sha256:${"0".repeat(64)}` }), deps, id)).status).toBe(401);
    who = U.approver;
    expect((await postConversationJobApprove(post(`/api/conversations/${id}/job/approve`, { seal_hash: `sha256:${"0".repeat(64)}` }), deps, id)).status).toBe(409);
  });
  it("a spec whose plan has no hidden tests (research) needs no oracle: Build oracle refuses, Start work goes on", async () => {
    const id = await proposed({ code: "none", reference: "none", divisible: "no", proof: ["numbers"], risk: { level: "low", outward: false }, size: "s" });
    const f = (await conversationFeed(db, U.viewer, DEMO_ORG_ID, id, -1))!;
    expect(f.conversation.profile).toBe("research");
    expect((await approveSpec(db, { uid: U.approver, org: DEMO_ORG_ID, id, body: { spec_hash: f.conversation.spec_hash! } })).status).toBe(200);
    expect((await conversationFeed(db, U.viewer, DEMO_ORG_ID, id, -1))!.oracle_required).toBe(false);
    expect((await buildOracle(db, { uid: U.approver, org: DEMO_ORG_ID, id })).body).toEqual({ error: "oracle_not_needed" });
    const s = await startWork(db, { uid: U.approver, org: DEMO_ORG_ID, id });
    expect(s.status).toBe(201);
    expect((await asService(db, (sql) => sql.query<{ oracle_hash: string | null }>("select oracle_hash from public.tasks where id = $1", [s.body.id]))).rows[0]).toEqual({ oracle_hash: null });
  });
  it("the routes: a person's session with CSRF and origin; a bad id is unknown", async () => {
    const { id, hash } = await approvedSpec();
    expect((await postConversationOracle(post("/api/conversations/x/oracle", {}), deps, "../x")).status).toBe(404);
    expect((await postConversationOracle(new Request(`http://localhost:3000/api/conversations/${id}/oracle`, { method: "POST", headers: { host: "localhost:3000", origin: "http://evil.test" }, body: "{}" }), deps, id)).status).toBe(403);
    const r = await postConversationOracle(post(`/api/conversations/${id}/oracle`, {}), deps, id);
    expect(r.status).toBe(201);
    const h = await workerMadeReady(String(((await r.json()) as { id: string }).id), hash);
    expect((await postConversationOracleApprove(new Request(`http://localhost:3000/api/conversations/${id}/oracle/approve`, { method: "POST", headers: { host: "localhost:3000", origin: "http://evil.test" }, body: "{}" }), deps, id)).status).toBe(403);
    who = null;
    expect((await postConversationOracleApprove(post(`/api/conversations/${id}/oracle/approve`, { oracle_hash: h }), deps, id)).status).toBe(401);
    who = U.approver;
    expect((await postConversationOracleApprove(post(`/api/conversations/${id}/oracle/approve`, { oracle_hash: h }), deps, id)).status).toBe(200);
  });
});

describe("open conversations for the task list (D-583)", () => {
  it("a conversation without a project and without a task is listed with the person's first words; another org sees nothing", async () => {
    const r = await sendMessage(db, { uid: U.approver, org: DEMO_ORG_ID, body: { text: "Research the best universities", agent: "fake:honest-fix" } });
    const id = String(r.body.id);
    const list = await openConversations(db, U.viewer, DEMO_ORG_ID);
    expect(list.find((c) => c.id === id)).toMatchObject({ id, text: "Research the best universities", purpose: "task", phase: "conversation", job_id: null, task_id: null });
    expect(await openConversations(db, U.viewer, "00000000-0000-4000-8000-000000000999")).toEqual([]);
  });
});

