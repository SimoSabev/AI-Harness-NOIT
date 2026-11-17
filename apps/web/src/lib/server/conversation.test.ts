import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fakeModel } from "@mandat/research";
import type { ModelClient, RouterChannel } from "@mandat/research";
import { DEMO_ORG_ID, DEMO_REPO_ID } from "../../../../worker/src/online/seed";
import { runConversationOnce } from "../../../../worker/src/online/conversation";
import { postConversation, postConversationRetry, postConversationStart, streamConversation } from "./api";
import type { ApiDeps } from "./api";
import { conversationFeed, retryConversation, sendMessage, startWork, workText } from "./conversation";
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
