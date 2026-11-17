import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fakeModel } from "@mandat/research";
import type { ModelClient, RouterChannel } from "@mandat/research";
import { DEMO_ORG_ID, DEMO_REPO_ID } from "../../../../worker/src/online/seed";
import { runConversationOnce } from "../../../../worker/src/online/conversation";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseMandatYml, specHash, specText } from "@mandat/contract";
import { contractForTask } from "../../../../worker/src/online/daemon";
import { postConversation, postConversationApprove, postConversationRetry, postConversationStart, streamConversation } from "./api";
import type { ApiDeps } from "./api";
import { approveSpec, conversationFeed, retryConversation, sendMessage, startWork, workText } from "./conversation";
import { RateLimiter } from "./guard";
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
    const s = await startWork(db, { uid: U.approver, org: DEMO_ORG_ID, id });
    expect(s.status).toBe(201);
    const t = (await asService(db, (sql) => sql.query<{ id: string; type: "bugfix"; text: string; agent: string; spec_hash: string | null }>("select id, type, text, agent, spec_hash from public.tasks where id = $1", [s.body.id]))).rows[0]!;
    expect(t).toMatchObject({ text: specText(spec), spec_hash: hash });
    const p = parseMandatYml(readFileSync(path.resolve(__dirname, "../../../../../fixtures/demo-shop/.mandat.yml"), "utf8"));
    if (!p.ok) throw new Error(p.error);
    expect(contractForTask(t, p.policy, "a".repeat(40)).spec_hash).toBe(hash);
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
