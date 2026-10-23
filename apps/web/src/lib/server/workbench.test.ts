import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_ORG_ID, DEMO_REPO_ID } from "../../../../worker/src/online/seed";
import { workbench } from "../../../../worker/src/online/workbench";
import { U, webDb } from "./web-db.test-helper";
import { fleet, homeExtras, nightView, researchView, sessionOf, tools } from "./workbench";

let db: Awaited<ReturnType<typeof webDb>>;
beforeAll(async () => {
  db = await webDb();
  const w = workbench(db, DEMO_ORG_ID);
  await w.session({ id: "s_a", task_id: "t_seed_bugfix", parent_id: null, agent: "claude", model: "sonnet", account: "work", role: "lead", state: "running", step: "тестове", context_pct: 40, usd: 0.3, touching: ["src/cart.ts"] }, DEMO_REPO_ID);
  await w.session({ id: "s_a_t", task_id: "t_seed_bugfix", parent_id: "s_a", agent: "тестове", model: "haiku", account: "work", role: "subagent", state: "running", step: "пише", context_pct: 5, usd: 0.01, touching: [] }, DEMO_REPO_ID);
  await w.session({ id: "s_b", task_id: null, parent_id: null, agent: "codex", model: "codex", account: null, role: "lead", state: "waiting", step: "чака", context_pct: null, usd: 0.2, touching: ["src/cart.ts"] }, DEMO_REPO_ID);
  await w.toolCall({ session_id: "s_a", kind: "mcp", tool: "github.get_issue", summary: "#407", decision: "allowed", duration_ms: 10 });
  await w.toolCall({ session_id: "s_b", kind: "bash", tool: "curl", summary: "segment", decision: "denied", duration_ms: null });
  await w.toolCall({ session_id: "s_a", kind: "skill", tool: "test-first", summary: "", decision: "allowed", duration_ms: null });
  await w.mcp({ name: "github", transport: "http", tools: 26, status: "up", latency_ms: 12, egress_hosts: ["api.github.com"], repo_ids: [DEMO_REPO_ID] });
  await w.skill({ name: "test-first", description: "червен тест първо", source: "repo", version: "1" });
  await w.permission({ subject: "codex", tool: "stripe", decision: "deny" });
  await w.window({ kind: "preview", title: "shop", url: "http://localhost:5173/" }, { session_id: "s_a", repo_id: DEMO_REPO_ID });
  const shift = await w.planNight({ starts_at: new Date(Date.now() + 3600_000).toISOString(), ends_at: new Date(Date.now() + 9 * 3600_000).toISOString(), budget_usd: 18, rules: { auto_merge: { min_level: 3, max_lines: 80 }, on_fail: "retry_once", same_file: "wait", forbid_tools: [] } });
  await w.queueNight(shift, { repo_id: DEMO_REPO_ID, text: "README", risk: "low", est_minutes: 40, est_usd: 0.3 });
  await w.research({ id: "q_a", question: "Въпрос?", repo_id: null }, [{ n: 1, title: "docs", url: "https://example.com", state: "read" }], [{ text: "т", verdict: "confirmed", source_ns: [1] }]);
});
afterAll(async () => db.end());

describe("workbench reads (D-307)", () => {
  it("агенти: дърво, инструменти за последния час; конфликт в главната", async () => {
    const f = await fleet(db, U.viewer, DEMO_ORG_ID);
    expect(f.map((x) => [x.id, x.depth])).toEqual([["s_a", 0], ["s_a_t", 1], ["s_b", 0]]);
    expect(f[0]?.tools.sort()).toEqual(["github", "test-first"]);
    const h = await homeExtras(db, U.viewer, DEMO_ORG_ID);
    expect(h.conflicts).toEqual([{ repo: "mandat-demo/shop", path: "src/cart.ts", sessions: 2 }]);
    expect(h.denied24h).toBe(1);
    expect(h.windows).toHaveLength(1);
  });
  it("инструменти, сесия на задача, нощ, ресърч", async () => {
    const t = await tools(db, U.viewer, DEMO_ORG_ID);
    expect(t.mcp[0]).toMatchObject({ name: "github", calls_hour: 1, repos: ["mandat-demo/shop"] });
    expect(t.skills[0]).toMatchObject({ name: "test-first", used_by: 1 });
    expect(t.calls).toHaveLength(3);
    const s = await sessionOf(db, U.viewer, DEMO_ORG_ID, "t_seed_bugfix");
    expect(s.sessions).toHaveLength(2);
    expect(s.calls.map((c) => c.tool)).toEqual(["github.get_issue", "test-first"]);
    expect(s.windows).toHaveLength(1);
    const n = await nightView(db, U.viewer, DEMO_ORG_ID);
    expect(n.queue.map((q) => q.text)).toEqual(["README"]);
    const r = await researchView(db, U.viewer, DEMO_ORG_ID);
    expect(r.current?.claims).toHaveLength(1);
  });
  it("E9а: the night view — the org's repos for the plan, the questions of the last shift, its parked count", async () => {
    const shift = (await db.query<{ id: string }>("insert into public.night_shifts (org_id, starts_at, ends_at, budget_usd, rules, status, spent_usd) values ($1, now() - interval '10 hours', now() - interval '2 hours', 5, '{}', 'done', 1.5) returning id::text as id", [DEMO_ORG_ID])).rows[0]?.id as string;
    await db.query("insert into public.night_queue (org_id, shift_id, repo_id, position, text, risk, est_minutes, est_usd, status, task_id) values ($1, $2::uuid, $3, 0, 'parked one', 'low', 10, 1, 'parked', 't_seed_bugfix')", [DEMO_ORG_ID, shift, DEMO_REPO_ID]);
    await db.query("insert into public.night_questions (org_id, shift_id, task_id, what_stopped, tried, proposal) values ($1, $2::uuid, 't_seed_bugfix', 'FAILED after 2 attempt(s): `x`', '[\"attempt 1: FAILED\"]', 'Add y')", [DEMO_ORG_ID, shift]);
    const n = await nightView(db, U.viewer, DEMO_ORG_ID);
    expect(n.repos.map((r) => r.id)).toContain(DEMO_REPO_ID);
    expect(n.last?.parked).toBe(1);
    expect(n.questions).toEqual([expect.objectContaining({ task_id: "t_seed_bugfix", what_stopped: "FAILED after 2 attempt(s): `x`", tried: ["attempt 1: FAILED"], proposal: "Add y", status: "open", answer: null })]);
  });
  it("чужд потребител не вижда нищо", async () => {
    const stranger = "e0000000-0000-4000-8000-000000000002";
    await db.query("insert into auth.users (id, email) values ($1, 'y@other.invalid')", [stranger]);
    expect(await fleet(db, stranger, DEMO_ORG_ID)).toEqual([]);
    expect((await tools(db, stranger, DEMO_ORG_ID)).mcp).toEqual([]);
  });
});
