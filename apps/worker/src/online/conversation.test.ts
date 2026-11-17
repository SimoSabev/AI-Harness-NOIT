import type * as ChildProcess from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CHAT_TOOLS } from "@mandat/contract";
import { fakeModel } from "@mandat/research";
import type { ModelClient, ModelRequest, RouterChannel } from "@mandat/research";
import { pgliteDb } from "./pglite-db.test-helper.js";
import { DEMO_OWNER_ID, DEMO_ORG_ID, DEMO_REPO_ID, seedMinimal } from "./seed.js";
import { CHAT_SYSTEM, answerTurn, claimConversation, loadTurns, processConversation, readReply, reapStaleConversations, runConversationOnce } from "./conversation.js";
import type { ChatDeps, NewTurn } from "./conversation.js";
import { chatModelFor } from "./conversation-host.js";

// D-531 (E10а ф. 1): the conversation without a sandbox. A key, a connection and a local model go through the proxy
// with the conversation's mdt_ token; nothing starts a process or a container. The model has three tools and none that
// writes; a spent budget and a passed expiry stop it; a brief is only shown.
const spawned = vi.hoisted(() => [] as string[]);
vi.mock("node:child_process", async (orig) => {
  const real = await orig<typeof ChildProcess>();
  const trap = (name: string) => (...a: unknown[]) => {
    spawned.push(`${name} ${String(a[0])}`);
    throw new Error("no process in a conversation");
  };
  return { ...real, spawn: trap("spawn"), execFile: trap("execFile"), exec: trap("exec"), fork: trap("fork"), spawnSync: trap("spawnSync"), execFileSync: trap("execFileSync") };
});

const ch: RouterChannel = { id: "x", label: "x", kind: "local", model: "m-1", enabled: true, health: "ok", quality: 1, cost: 0 };
const say = (o: unknown) => JSON.stringify(o);
const brief = { goal: "Round discounts half up", touches: ["src/cart.ts"], avoid: ["the tests"], done_when: ["the cart test passes"] };
const human = (text: string): NewTurn => ({ kind: "human", text });
const base = { budgetUsd: 1, spentUsd: 0, expiresAt: Date.now() + 60_000, now: Date.now, search: async () => [] };

describe("one answer (D-531)", () => {
  it("the system prompt names exactly the three tools; a call to any other tool does nothing", async () => {
    for (const t of CHAT_TOOLS) expect(CHAT_SYSTEM).toContain(`"tool": "${t}"`);
    expect(CHAT_SYSTEM.match(/"tool": "/g)).toHaveLength(3);
    for (const bad of ["write_file", "run_shell", "fetch_url", "start_task"]) expect(readReply(say({ say: "done", call: { tool: bad, path: "x" } }))).toEqual({ say: "done", call: null });
    expect(readReply("just words")).toEqual({ say: "just words", call: null });
  });
  it("ask_user: at most 3 questions even when the model asks 5", async () => {
    const client = fakeModel(ch, () => say({ say: "A few questions", call: { tool: "ask_user", questions: ["1?", "2?", "3?", "4?", "5?"] } }));
    const r = await answerTurn({ ...base, client, turns: [human("make it better")] });
    expect(r.turns).toEqual([{ kind: "assistant", text: "A few questions", questions: ["1?", "2?", "3?"], brief: null, model: "m-1", usd: 0 }]);
  });
  it("search_memory: the hits go back to the model, which answers once more", async () => {
    const asked: ModelRequest[] = [];
    let n = 0;
    const client = fakeModel(ch, (q) => (asked.push(q), n++ === 0 ? say({ say: "", call: { tool: "search_memory", query: "rounding" } }) : say({ say: "Got it", call: { tool: "propose_brief", brief } })));
    const r = await answerTurn({ ...base, client, turns: [human("fix rounding")], search: async (q) => [{ id: "m1", text: `we round half up (${q})` }] });
    expect(r.turns.map((t) => t.kind)).toEqual(["memory", "assistant"]);
    expect(asked[1]?.user).toContain("we round half up (rounding)");
    expect(r.turns[1]).toMatchObject({ brief });
  });
  it("a spent budget stops before the next call; a passed expiry stops before any call", async () => {
    const calls: string[] = [];
    const client = fakeModel(ch, () => (calls.push("call"), say({ say: "", call: { tool: "search_memory", query: "x" } })), 0.3);
    expect(await answerTurn({ ...base, client, budgetUsd: 0.5, turns: [human("hi")] })).toMatchObject({ stop: "budget", usd: 0.6 });
    expect(calls).toHaveLength(2);
    expect(await answerTurn({ ...base, client, budgetUsd: 0.5, spentUsd: 0.5, turns: [human("hi")] })).toMatchObject({ stop: "budget", turns: [], usd: 0 });
    expect(await answerTurn({ ...base, client, expiresAt: Date.now() - 1, turns: [human("hi")] })).toMatchObject({ stop: "expired", turns: [] });
    expect(calls).toHaveLength(2);
  });
  it("an overloaded provider is its own stop (the person can pick another model)", async () => {
    const client: ModelClient = { channel: ch, complete: async () => Promise.reject(new Error("model endpoint answered 529")) };
    expect(await answerTurn({ ...base, client, turns: [human("hi")] })).toMatchObject({ stop: "overloaded", error: "model endpoint answered 529" });
    const down: ModelClient = { channel: ch, complete: async () => Promise.reject(new Error("model endpoint unreachable")) };
    expect(await answerTurn({ ...base, client: down, turns: [human("hi")] })).toMatchObject({ stop: "failed" });
  });
});

describe("the model of a conversation on this computer (D-531)", () => {
  let server: ReturnType<typeof createServer>;
  let url = "";
  const seen: { path: string; key: string; body: { model?: string; tools?: unknown } }[] = [];
  const secretPath = path.join(mkdtempSync(path.join(tmpdir(), "chat-")), "secret");
  beforeAll(async () => {
    writeFileSync(secretPath, Buffer.alloc(32, 7));
    server = createServer((req, res) => {
      let b = "";
      req.on("data", (c: Buffer) => (b += c.toString()));
      req.on("end", () => {
        seen.push({ path: req.url ?? "", key: String(req.headers["x-api-key"] ?? req.headers.authorization ?? "").replace(/^Bearer /, ""), body: JSON.parse(b) as { model?: string } });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(say({ id: "msg_1", type: "message", role: "assistant", model: "claude-sonnet-5-5", content: [{ type: "text", text: say({ say: "Hi! What should change?", call: null }) }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 10, output_tokens: 5 } }));
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const route = (agent: string) => ({ id: "c_test1", agent, model: "claude-sonnet-5-5", budgetUsd: 0.5, expiresAt: Math.floor(Date.now() / 1000) + 3600 });
  it("a key and a local connection answer through the proxy with an mdt_ token — no process, no container, no tools", async () => {
    const profileExec = vi.fn(async () => "");
    for (const agent of ["claude", "claude+ollama"]) {
      const m = chatModelFor({ proxy: { url, secretPath }, profileExec }, route(agent));
      if (!m.ok) throw new Error(m.why);
      const r = await answerTurn({ ...base, client: m.client, turns: [human("hi")] });
      expect(r.turns[0]).toMatchObject({ kind: "assistant", text: "Hi! What should change?" });
    }
    expect(profileExec).not.toHaveBeenCalled();
    expect(spawned).toEqual([]);
    expect(seen.map((s) => s.path)).toEqual(["/v1/messages", "/v1/messages"]);
    for (const s of seen) {
      expect(s.key).toMatch(/^mdt_/);
      expect(s.body.tools).toBeUndefined();
    }
    const claims = (k: string) => JSON.parse(Buffer.from(k.slice(4).split(".")[0] as string, "base64url").toString()) as { t: string; r: string; b: number; e: number; u?: string };
    expect(claims(seen[0]!.key)).toMatchObject({ t: "c_test1", r: "c_test1_0", b: 0.5 });
    expect(claims(seen[1]!.key).u).toBe("ollama");
  });
  it("a Claude subscription uses the profile's CLI (D-295); a demo agent answers from a script; unknown ones are refused", async () => {
    const profileExec = vi.fn(async (_profile: string, _argv: string[], _stdin: string) => say({ type: "result", is_error: false, result: say({ say: "hello", call: null }), usage: {} }));
    const m = chatModelFor({ proxy: null, profileExec }, route("claude@personal"));
    if (!m.ok) throw new Error(m.why);
    expect((await m.client.complete({ system: "s", user: "u", maxTokens: 10, json: true })).text).toContain("hello");
    expect(profileExec.mock.calls[0]?.[0]).toBe("personal");
    const demo = chatModelFor({ proxy: null, profileExec: null }, route("fake:honest-fix"));
    expect(demo.ok).toBe(true);
    expect(chatModelFor({ proxy: null, profileExec: null }, route("claude")).ok).toBe(false);
    expect(chatModelFor({ proxy: { url, secretPath }, profileExec: null }, route("gemini+g1")).ok).toBe(false);
    expect(chatModelFor({ proxy: { url, secretPath }, profileExec: null }, { ...route("claude"), model: null }).ok).toBe(false);
  });
});

describe("the conversation queue (D-531)", () => {
  let db: Awaited<ReturnType<typeof pgliteDb>>;
  beforeAll(async () => {
    db = await pgliteDb();
    await seedMinimal(db, { remoteUrl: "file:///tmp/x.git" });
  });
  afterAll(() => db.end());
  const open = async (id: string, text: string, o: { budget?: number; expires?: string } = {}) => {
    await db.query("insert into public.conversations (id, org_id, repo_id, created_by, agent, model, budget_usd, expires_at) values ($1, $2::uuid, $3::uuid, $4::uuid, 'claude', 'm-1', $5, now() + $6::interval)", [id, DEMO_ORG_ID, DEMO_REPO_ID, DEMO_OWNER_ID, o.budget ?? 0.5, o.expires ?? "2 hours"]);
    await db.query("insert into public.conversation_turns (org_id, conversation_id, seq, kind, data) values ($1::uuid, $2, 0, 'human', $3::jsonb)", [DEMO_ORG_ID, id, JSON.stringify({ text })]);
  };
  const status = async (id: string) => (await db.query<{ status: string; usd: number; error: string | null }>("select status, usd::float8 as usd, error from public.conversations where id = $1", [id])).rows[0];
  const memories = async () => Number((await db.query<{ n: number }>("select count(*)::int as n from public.memory_items")).rows[0]?.n);
  const deps = (client: ModelClient): ChatDeps => ({ db, modelFor: () => ({ ok: true, client }) });

  it("hi: the answer is written as a turn and the conversation waits for the person; no task, no memory", async () => {
    const before = await memories();
    await open("c_hi", "hi");
    expect(await runConversationOnce(deps(fakeModel(ch, () => say({ say: "Hi there", call: null }), 0.01)))).toBe("c_hi");
    expect((await loadTurns(db, "c_hi")).map((t) => t.kind)).toEqual(["human", "assistant"]);
    expect(await status("c_hi")).toMatchObject({ status: "idle", usd: 0.01 });
    expect(await memories()).toBe(before);
    expect((await db.query("select 1 from public.tasks")).rows).toEqual([]);
  });
  it("propose_brief only shows the brief: no task is made", async () => {
    await open("c_brief", "round discounts half up");
    await runConversationOnce(deps(fakeModel(ch, () => say({ say: "Here it is", call: { tool: "propose_brief", brief } }))));
    expect((await loadTurns(db, "c_brief")).at(-1)).toMatchObject({ kind: "assistant", brief });
    expect((await db.query("select 1 from public.tasks")).rows).toEqual([]);
    expect((await db.query<{ phase: string; task_id: string | null }>("select phase, task_id from public.conversations where id = 'c_brief'")).rows[0]).toEqual({ phase: "conversation", task_id: null });
  });
  it("memory is read; it is written only when the person said remember", async () => {
    const before = await memories();
    await open("c_mem", "remember: answer in short sentences");
    await runConversationOnce(deps(fakeModel(ch, () => say({ say: "Noted", call: null }))));
    expect(await memories()).toBe(before + 1);
    let user = "";
    await open("c_mem2", "how should you answer?");
    let n = 0;
    await runConversationOnce(deps(fakeModel(ch, (q) => (n++ === 0 ? say({ say: "", call: { tool: "search_memory", query: "answer short sentences" } }) : ((user = q.user), say({ say: "Short", call: null }))))));
    expect(user).toContain("answer in short sentences");
    expect((await loadTurns(db, "c_mem2")).map((t) => t.kind)).toEqual(["human", "memory", "assistant"]);
    expect(await memories()).toBe(before + 1);
  });
  it("a spent budget and a passed expiry stop the conversation with that status and no model call", async () => {
    const never = fakeModel(ch, () => {
      throw new Error("no call");
    });
    await open("c_broke", "hi", { budget: 0 });
    await runConversationOnce(deps(never));
    expect((await status("c_broke"))?.status).toBe("budget");
    await open("c_old", "hi", { expires: "-1 minute" });
    await runConversationOnce(deps(never));
    expect((await status("c_old"))?.status).toBe("expired");
    await open("c_spend", "hi", { budget: 0.05 });
    await runConversationOnce(deps(fakeModel(ch, () => say({ say: "ok", call: null }), 0.06)));
    expect(await status("c_spend")).toMatchObject({ status: "budget", usd: 0.06 });
  });
  it("an unusable model fails with the reason; a dead worker's conversation is reaped", async () => {
    await open("c_nomodel", "hi");
    const c = await claimConversation(db);
    expect(await processConversation({ db, modelFor: () => ({ ok: false, why: "no model chosen" }) }, c!)).toBe("failed");
    expect(await status("c_nomodel")).toMatchObject({ status: "failed", error: "no model chosen" });
    await open("c_dead", "hi");
    await db.query("update public.conversations set status = 'running', heartbeat_at = now() - interval '5 minutes' where id = 'c_dead'");
    expect(await reapStaleConversations(db)).toEqual(["c_dead"]);
    expect(spawned).toEqual([]);
  });
});
