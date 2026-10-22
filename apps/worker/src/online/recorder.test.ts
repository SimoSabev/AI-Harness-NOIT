import type { AgentEvent } from "@mandat/agents";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pgliteDb } from "./pglite-db.test-helper.js";
import { classifyTool, recorder, sessionIds, sessionMapper } from "./recorder.js";
import type { RecordOp } from "./recorder.js";
import { DEMO_ORG_ID, DEMO_REPO_ID, seedMinimal } from "./seed.js";
import { workbench } from "./workbench.js";

const clock = () => {
  let t = 1000;
  return { now: () => t, tick: (ms: number) => (t += ms) };
};
const base = { taskId: "t_demo_1", attempt: 1, agent: "claude", model: "claude-sonnet-5-5", account: "work" };
const use = (id: string, name: string, input: unknown, parent?: string): AgentEvent => ({ type: "tool_use", id, name, input, ...(parent ? { parent } : {}) });
const res = (id: string, isError = false, parent?: string): AgentEvent => ({ type: "tool_result", toolUseId: id, isError, ...(parent ? { parent } : {}) });
const calls = (ops: RecordOp[]) => ops.flatMap((o) => (o.op === "call" ? [o.input] : []));

describe("session ids (D-308)", () => {
  it("lead s_<task>_a<attempt>; subagents add _<n>; long ids stay inside SessionId", () => {
    expect(sessionIds("t_demo_1", 2).lead).toBe("s_demo_1_a2");
    expect(sessionIds("t_demo_1", 2).sub(3)).toBe("s_demo_1_a2_3");
    const long = sessionIds(`t_${"x".repeat(40)}`, 12);
    expect(long.sub(9999)).toMatch(/^s_[a-z0-9_]{1,40}$/);
    expect(long.lead).not.toBe(sessionIds(`t_${"x".repeat(39)}y`, 12).lead);
  });
});

describe("classifyTool (D-308)", () => {
  it("MCP, skill, bash, subagent, edits (paths relative to the work tree), others", () => {
    expect(classifyTool("mcp__github__get_issue", { number: 407 })).toEqual({ kind: "mcp", tool: "github.get_issue", summary: '{"number":407}', paths: [], subagent: false });
    expect(classifyTool("Skill", { skill: "pdf" })).toMatchObject({ kind: "skill", tool: "pdf" });
    expect(classifyTool("Bash", { command: "pnpm test" })).toMatchObject({ kind: "bash", tool: "Bash", summary: "pnpm test" });
    expect(classifyTool("Task", { description: "write tests", subagent_type: "general" })).toMatchObject({ kind: "builtin", tool: "Task", summary: "write tests", subagent: true });
    expect(classifyTool("Agent", { prompt: "x" })).toMatchObject({ subagent: true });
    expect(classifyTool("Edit", { file_path: "/m/work/src/cart.ts" })).toMatchObject({ kind: "builtin", tool: "Edit", summary: "src/cart.ts", paths: ["src/cart.ts"] });
    expect(classifyTool("Edit", { paths: ["src/a.ts", "../etc/passwd", "/etc/shadow"] }).paths).toEqual(["src/a.ts"]);
    expect(classifyTool("Read", { file_path: "/m/work/README.md" })).toMatchObject({ summary: "README.md", paths: [] });
    expect(classifyTool("WebFetch", { url: "https://example.com" })).toMatchObject({ kind: "builtin", summary: "https://example.com" });
    expect(classifyTool("weird name!", null).tool).toBe("weird_name_");
  });
});

describe("sessionMapper (D-308)", () => {
  it("init → lead session; a call is written when its result comes back, with the measured time", () => {
    const c = clock();
    const m = sessionMapper({ ...base, now: c.now });
    const first = m.push({ type: "init", sessionId: "x", model: "claude-opus-5-5", tools: [], mcpServers: [], capabilities: [] });
    expect(first).toEqual([{ op: "session", input: { id: "s_demo_1_a1", task_id: "t_demo_1", parent_id: null, agent: "claude", model: "claude-opus-5-5", account: "work", role: "lead", state: "running", step: "започва", context_pct: null, usd: 0, touching: [] } }]);
    const started = m.push(use("u1", "Edit", { file_path: "/m/work/src/cart.ts" }));
    expect(started).toEqual([{ op: "beat", id: "s_demo_1_a1", beat: { step: "Edit src/cart.ts", touching: ["src/cart.ts"] } }]);
    c.tick(42);
    expect(calls(m.push(res("u1")))).toEqual([{ session_id: "s_demo_1_a1", kind: "builtin", tool: "Edit", summary: "src/cart.ts", decision: "allowed", duration_ms: 42 }]);
  });
  it("no init: the first event opens the lead with the task's model", () => {
    const m = sessionMapper({ ...base, now: () => 0 });
    const ops = m.push(use("u1", "Bash", { command: "ls" }));
    expect(ops[0]).toMatchObject({ op: "session", input: { id: "s_demo_1_a1", model: "claude-sonnet-5-5" } });
  });
  it("Codex repeats tool_use on item.completed: one call, not two", () => {
    const m = sessionMapper({ ...base, now: () => 0 });
    m.push(use("i1", "Bash", { command: "pnpm test" }));
    expect(m.push(use("i1", "Bash", { command: "pnpm test" }))).toEqual([]);
    expect(calls(m.push(res("i1", true)))).toMatchObject([{ decision: "error" }]);
    expect(m.push(use("i1", "Bash", { command: "pnpm test" }))).toEqual([]);
  });
  it("subagent: Task opens a child session; its calls belong to it; the Task result ends it", () => {
    const m = sessionMapper({ ...base, now: () => 0 });
    m.push(use("u0", "Read", { file_path: "/m/work/a.ts" }));
    const spawn = m.push(use("t1", "Task", { description: "tests for signup" }));
    expect(spawn).toContainEqual({ op: "session", input: expect.objectContaining({ id: "s_demo_1_a1_1", parent_id: "s_demo_1_a1", role: "subagent", step: "tests for signup" }) as unknown });
    m.push(use("u2", "Edit", { file_path: "/m/work/tests/signup.spec.ts" }, "t1"));
    expect(calls(m.push(res("u2", false, "t1")))).toMatchObject([{ session_id: "s_demo_1_a1_1", tool: "Edit" }]);
    const done = m.push(res("t1"));
    expect(done).toContainEqual({ op: "end", id: "s_demo_1_a1_1", state: "done" });
    expect(calls(done)).toMatchObject([{ session_id: "s_demo_1_a1", tool: "Task" }]);
  });
  it("permission_denied closes the pending call as denied, or records a bare denied one", () => {
    const m = sessionMapper({ ...base, now: () => 0 });
    m.push(use("i5", "Bash", { command: "curl evil" }));
    expect(calls(m.push({ type: "permission_denied", tool: "Bash" }))).toMatchObject([{ tool: "Bash", summary: "curl evil", decision: "denied" }]);
    expect(calls(m.push({ type: "permission_denied", tool: "WebFetch" }))).toMatchObject([{ tool: "WebFetch", summary: "", decision: "denied", duration_ms: null }]);
  });
  it("result sets the cost; close ends the lead and open subagents and writes unfinished calls as errors", () => {
    const m = sessionMapper({ ...base, now: () => 0 });
    m.push(use("t1", "Task", { description: "x" }));
    m.push(use("u2", "Bash", { command: "sleep 99" }, "t1"));
    expect(m.push({ type: "result", subtype: "success", isError: false, totalCostUsd: 0.31, numTurns: 3 })).toEqual([{ op: "beat", id: "s_demo_1_a1", beat: { usd: 0.31 } }]);
    const end = m.close(true);
    expect(calls(end)).toMatchObject([{ tool: "Task", decision: "error", duration_ms: null }, { tool: "Bash", decision: "error" }]);
    expect(end.filter((o) => o.op === "end")).toEqual([{ op: "end", id: "s_demo_1_a1_1", state: "done" }, { op: "end", id: "s_demo_1_a1", state: "done" }]);
    expect(m.close(true)).toEqual([]);
  });
  it("an error result fails the lead even if the run went on", () => {
    const m = sessionMapper({ ...base, now: () => 0 });
    m.push({ type: "result", subtype: "error", isError: true, totalCostUsd: null, numTurns: null });
    expect(m.close(true).filter((o) => o.op === "end")).toEqual([{ op: "end", id: "s_demo_1_a1", state: "failed" }]);
  });
  it("gate blocks become denied mandat calls on the lead (after the stream, before the end)", () => {
    const m = sessionMapper({ ...base, now: () => 0 });
    m.push(use("u1", "Bash", { command: "curl x" }));
    expect(calls(m.gate([{ kind: "dns_block", target: "evil.example", count: 3 }, { kind: "proxy_block", target: "GET /v1/files", count: 1 }]))).toEqual([
      { session_id: "s_demo_1_a1", kind: "mandat", tool: "gate.dns", summary: "evil.example ×3", decision: "denied", duration_ms: null },
      { session_id: "s_demo_1_a1", kind: "mandat", tool: "gate.http", summary: "GET /v1/files ×1", decision: "denied", duration_ms: null },
    ]);
    expect(sessionMapper({ ...base, now: () => 0 }).gate([{ kind: "dns_block", target: "a", count: 1 }])[0]).toMatchObject({ op: "session" });
    m.close(true);
    expect(m.gate([{ kind: "dns_block", target: "late", count: 1 }])).toEqual([]);
  });
  it("the canary never reaches a summary", () => {
    const m = sessionMapper({ ...base, now: () => 0 });
    m.secret("Zq9cAnArYvAlUe0123456789abcdefghijklmnop");
    m.push(use("u1", "Bash", { command: "echo Zq9cAnArYvAlUe0123456789abcdefghijklmnop > /tmp/x" }));
    expect(calls(m.push(res("u1")))[0]?.summary).toBe("echo [скрито] > /tmp/x");
  });
});

describe("recorder on the database (D-308)", () => {
  let db: Awaited<ReturnType<typeof pgliteDb>>;
  beforeAll(async () => {
    db = await pgliteDb();
    await seedMinimal(db, { remoteUrl: "file:///tmp/x.git", ownerEmail: "o@demo.invalid" });
    for (const id of ["t_rec_1", "t_rec_2"]) await db.query("insert into public.tasks (id, org_id, repo_id, type, agent, text) values ($1, $2, $3, 'bugfix', 'claude', 'x')", [id, DEMO_ORG_ID, DEMO_REPO_ID]);
  });
  afterAll(() => db.end());

  it("writes the session, the calls and the end; a bad write stops recording but never throws", async () => {
    const warns: string[] = [];
    const r = recorder(workbench(db, DEMO_ORG_ID), DEMO_REPO_ID, sessionMapper({ ...base, taskId: "t_rec_1", now: () => 0 }), (w) => warns.push(w));
    r.event(use("u1", "Edit", { file_path: "/m/work/src/cart.ts" }));
    r.event(res("u1"));
    r.event({ type: "result", subtype: "success", isError: false, totalCostUsd: 0.05, numTurns: 1 });
    await r.close(true);
    const s = (await db.query<{ id: string; state: string; usd: number; touching: string[] }>("select id, state, usd::float8 as usd, touching from public.agent_sessions where id = 's_rec_1_a1'")).rows;
    expect(s).toEqual([{ id: "s_rec_1_a1", state: "done", usd: 0.05, touching: ["src/cart.ts"] }]);
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.tool_calls where session_id = 's_rec_1_a1'")).rows[0]?.n).toBe(1);
    expect(warns).toEqual([]);

    const bad = recorder({ ...workbench(db, DEMO_ORG_ID), session: () => Promise.reject(new Error("boom secret=x")) }, DEMO_REPO_ID, sessionMapper({ ...base, taskId: "t_rec_2", now: () => 0 }), (w) => warns.push(w));
    bad.event(use("u1", "Bash", { command: "ls" }));
    bad.event(res("u1"));
    await expect(bad.close(false)).resolves.toBeUndefined();
    expect(warns).toEqual(["recorder stopped (D-308): Error"]);
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.tool_calls where session_id = 's_rec_2_a1'")).rows[0]?.n).toBe(0);
  });
});
