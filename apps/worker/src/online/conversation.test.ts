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
import { CHAT_SYSTEM, answerTurn, checkAxes, checkSpec, claimConversation, loadTurns, processConversation, readReply, reapStaleConversations, runConversationOnce } from "./conversation.js";
import { unavailableReader } from "./repo-tools.js";
import type { RepoReader } from "./repo-tools.js";
import type { ChatDeps, NewTurn } from "./conversation.js";
import { chatModelFor } from "./conversation-host.js";

// D-531 (E10а ф. 1): the conversation without a sandbox. A key, a connection and a local model go through the proxy
// with the conversation's mdt_ token; nothing starts a process or a container. The model has its listed tools and none that
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
  it("the system prompt names exactly the listed tools; a call to any other tool (approving included) does nothing", async () => {
    for (const t of CHAT_TOOLS) expect(CHAT_SYSTEM).toContain(`"tool": "${t}"`);
    expect(CHAT_SYSTEM.match(/\{"tool": "/g)).toHaveLength(CHAT_TOOLS.length);
    for (const bad of ["write_file", "run_shell", "fetch_url", "start_task", "approve_spec", "approve"]) expect(readReply(say({ say: "done", call: { tool: bad, path: "x" } }))).toEqual({ say: "done", call: null });
    expect(readReply("just words")).toEqual({ say: "just words", call: null });
  });
  it("ask_user: the interview has no cap — 12 questions stay 12 (D-533 supersedes the cut at 3)", async () => {
    const twelve = Array.from({ length: 12 }, (_, i) => `${i + 1}?`);
    const client = fakeModel(ch, () => say({ say: "A few questions", call: { tool: "ask_user", questions: twelve } }));
    const r = await answerTurn({ ...base, client, turns: [human("make it better")] });
    expect(r.turns).toEqual([{ kind: "assistant", text: "A few questions", questions: twelve, brief: null, model: "m-1", usd: 0 }]);
    expect(CHAT_SYSTEM).not.toMatch(/at most 3/);
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

// D-533 (М1 Х1–Х2): the interview — read-only repo tools, the six axes and the spec, ready only when nothing is open.
const known = { code: "existing", reference: "none", divisible: "no", proof: ["tests"], risk: { level: "low", outward: false }, size: "m" };
const spec = {
  goal: "Round discounts half up",
  product: "The cart rounds a discount that ends in .5 up.",
  criteria: [{ id: "AC-1", when: "a discount ends in .5", shall: "round it up", proof: "tests" }],
  unchanged: ["whole-number totals"],
  out_of_scope: ["currencies"],
  profile: "other",
};
const script = (...answers: unknown[]) => {
  const asked: ModelRequest[] = [];
  const client = fakeModel(ch, (q) => (asked.push(q), say(answers[Math.min(asked.length - 1, answers.length - 1)])));
  return { client, asked };
};
const reader = (over: Partial<RepoReader> = {}): RepoReader => ({ ...unavailableReader, ...over });

describe("the interview (D-533)", () => {
  it("unknown axes keep the interview going: the model sees them, and a spec is not ready while any is unknown", async () => {
    const m = script(
      { say: "", call: { tool: "propose_axes", axes: { ...known, size: "unknown" } } },
      { say: "", call: { tool: "propose_spec", spec } },
      { say: "How big is it?", call: { tool: "ask_user", questions: ["How many screens does it touch?"] } },
    );
    const r = await answerTurn({ ...base, client: m.client, turns: [human("round discounts half up")] });
    expect(r.turns.map((t) => t.kind)).toEqual(["axes", "spec", "assistant"]);
    expect(r.turns[0]).toMatchObject({ kind: "axes", profile: "feature", unknown: ["size"] });
    expect(r.turns[1]).toMatchObject({ kind: "spec", ready: false, unknown: ["size"], untestable: [], spec: { profile: "feature" } });
    expect(m.asked[0]?.user).toContain("Axes: not proposed yet");
    expect(m.asked[1]?.user).toContain("Unknown axes: size.");
    expect(m.asked[2]?.user).toContain("Spec: not ready (unknown axes: size; untestable criteria: none)");
    expect(r.turns[2]).toMatchObject({ kind: "assistant", questions: ["How many screens does it touch?"] });
  });
  it("a spec with an untestable criterion is not ready; the fixed one is, and ends the answer", async () => {
    const vague = { ...spec, criteria: [...spec.criteria, { id: "AC-2", when: "a person looks at the cart", shall: "it feels right", proof: "human" }, { id: "AC-3", when: " ", shall: "x", proof: "tests" }] };
    const m = script({ say: "", call: { tool: "propose_axes", axes: known } }, { say: "", call: { tool: "propose_spec", spec: vague } }, { say: "Ready for you", call: { tool: "propose_spec", spec } }, { say: "never asked", call: null });
    const r = await answerTurn({ ...base, client: m.client, turns: [human("round discounts half up")] });
    expect(r.turns.map((t) => t.kind)).toEqual(["axes", "spec", "spec", "assistant"]);
    expect(r.turns[1]).toMatchObject({ ready: false, unknown: [], untestable: ["AC-2", "AC-3"] });
    expect(m.asked[2]?.user).toContain("untestable criteria: AC-2, AC-3");
    expect(r.turns[2]).toMatchObject({ ready: true, unknown: [], untestable: [] });
    expect(r.turns[3]).toMatchObject({ kind: "assistant", text: "Ready for you" });
    expect(m.asked).toHaveLength(3);
  });
  it("a malformed spec or axes come back to the model as problems, not as a lost call; without axes no spec is ready", async () => {
    expect(checkSpec({ ...spec, criteria: [] }, [])).toMatchObject({ kind: "tool", tool: "propose_spec", ok: false });
    expect(checkAxes({ ...known, size: "huge" })).toMatchObject({ kind: "tool", tool: "propose_axes", ok: false });
    expect(checkSpec(spec, [])).toMatchObject({ kind: "spec", ready: false, unknown: ["code", "reference", "divisible", "proof", "risk", "size"] });
    expect(checkAxes(known, "tests")).toMatchObject({ kind: "axes", hint: "tests", profile: "tests" });
    expect(checkAxes(known, "nonsense")).toMatchObject({ kind: "axes", hint: null, profile: "feature" });
    const m = script({ say: "", call: { tool: "propose_spec", spec: { goal: "" } } }, { say: "Let me ask", call: null });
    const r = await answerTurn({ ...base, client: m.client, turns: [human("x")] });
    expect(r.turns[0]).toMatchObject({ kind: "tool", ok: false });
    expect(m.asked[1]?.user).toMatch(/\[propose_spec "spec"\] refused or failed: .*goal/);
  });
  it("the repo tools: the contents reach the model inside the answer, a refusal reaches it as a note", async () => {
    const calls: string[] = [];
    const repo = reader({
      readFile: async (p, from, to) => (calls.push(`read ${p} ${from ?? ""}-${to ?? ""}`), { ok: true, text: "1| export const CONTENTS_SEEN = 1;", note: "lines 1-1 of 1" }),
      grep: async (q, p) => (calls.push(`grep ${q} ${p ?? ""}`), { ok: false, note: "refused: the path is outside the project" }),
      listDir: async (p) => (calls.push(`ls ${p}`), { ok: true, text: "src/", note: "1 entries" }),
    });
    const m = script({ say: "", call: { tool: "list_dir", path: "" } }, { say: "", call: { tool: "read_file", path: "src/a.ts", from_line: 1, to_line: 9 } }, { say: "", call: { tool: "grep", pattern: "round", path: "../" } }, { say: "Read it", call: null });
    const r = await answerTurn({ ...base, client: m.client, turns: [human("look at the cart")], repo });
    expect(calls).toEqual(["ls ", "read src/a.ts 1-9", "grep round ../"]);
    expect(m.asked[2]?.user).toContain("CONTENTS_SEEN");
    expect(m.asked[3]?.user).toContain('[grep "round in ../"] refused or failed: refused: the path is outside the project');
    expect(r.turns.map((t) => t.kind)).toEqual(["tool", "tool", "tool", "assistant"]);
    // without a mirror every repo tool says the project is not on this computer
    const n = script({ say: "", call: { tool: "read_file", path: "package.json" } }, { say: "ok", call: null });
    await answerTurn({ ...base, client: n.client, turns: [human("x")] });
    expect(n.asked[1]?.user).toContain("the project is not on this computer");
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
  it("D-533: the axes and a ready spec are stored on the conversation; file contents are never stored or logged; nothing is approved", async () => {
    await open("c_spec", "round discounts half up");
    const logs: string[] = [];
    const repo = reader({ readFile: async () => ({ ok: true, text: "1| const CONTENTS_SEEN = 1;", note: "lines 1-1 of 1" }) });
    let n = 0;
    const answers = [{ say: "", call: { tool: "read_file", path: "src/cart.ts" } }, { say: "", call: { tool: "propose_axes", axes: known } }, { say: "Approve it if it looks right", call: { tool: "propose_spec", spec } }];
    await runConversationOnce({ db, modelFor: () => ({ ok: true, client: fakeModel(ch, () => say(answers[n++])) }), readerFor: () => repo, log: (l) => logs.push(l) });
    const turns = await loadTurns(db, "c_spec");
    expect(turns.map((t) => t.kind)).toEqual(["human", "tool", "axes", "spec", "assistant"]);
    expect(turns[1]).toEqual({ seq: 1, at: expect.any(String), kind: "tool", tool: "read_file", target: "src/cart.ts", ok: true, note: "lines 1-1 of 1" });
    const raw = (await db.query<{ data: unknown }>("select data from public.conversation_turns where conversation_id = 'c_spec'")).rows;
    expect(JSON.stringify(raw)).not.toContain("CONTENTS_SEEN");
    expect(logs.join("\n")).not.toContain("CONTENTS_SEEN");
    const row = async () => (await db.query<{ profile: string; unknown_axes: string[]; spec_ready: boolean; spec_hash: string; approved_spec_hash: string | null; axes: unknown }>("select profile, unknown_axes, spec_ready, spec_hash, approved_spec_hash, axes from public.conversations where id = 'c_spec'")).rows[0];
    const c = await row();
    expect(c).toMatchObject({ profile: "feature", unknown_axes: [], spec_ready: true, approved_spec_hash: null, axes: known });
    expect(c?.spec_hash).toBe(turns[3]?.kind === "spec" ? turns[3].hash : "");
    // an approval of this hash survives only while the spec is the same; another spec drops it
    await db.query("update public.conversations set approved_spec = spec, approved_spec_hash = spec_hash, approved_at = now() where id = 'c_spec'");
    await db.query("insert into public.conversation_turns (org_id, conversation_id, seq, kind, data) values ($1::uuid, 'c_spec', 5, 'human', $2::jsonb)", [DEMO_ORG_ID, JSON.stringify({ text: "change the goal" })]);
    await db.query("update public.conversations set status = 'queued' where id = 'c_spec'");
    await runConversationOnce({ db, modelFor: () => ({ ok: true, client: fakeModel(ch, () => say({ say: "New one", call: { tool: "propose_spec", spec: { ...spec, goal: "Round half even" } } })) }), readerFor: () => repo });
    expect(await row()).toMatchObject({ spec_ready: true, approved_spec_hash: null });
    expect((await db.query("select 1 from public.tasks")).rows).toEqual([]);
  });
  it("D-533: a project that is not on this computer — the repo tools report it unavailable", async () => {
    await db.query("update public.repos set remote_url = 'https://github.com/o/r.git' where id = $1::uuid", [DEMO_REPO_ID]);
    await open("c_far", "look at the cart");
    const asked: string[] = [];
    let n = 0;
    await runConversationOnce(deps(fakeModel(ch, (q) => (asked.push(q.user), n++ === 0 ? say({ say: "", call: { tool: "list_dir", path: "" } }) : say({ say: "I cannot see it", call: null })))));
    expect(asked[1]).toContain("the project is not on this computer");
    expect((await loadTurns(db, "c_far"))[1]).toMatchObject({ kind: "tool", ok: false, note: "the project is not on this computer" });
    expect(spawned).toEqual([]);
  });
});
