import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pgliteDb } from "./pglite-db.test-helper.js";
import { DEMO_ORG_ID, DEMO_REPO_ID, seedMinimal } from "./seed.js";
import { workbench } from "./workbench.js";

let db: Awaited<ReturnType<typeof pgliteDb>>;
beforeAll(async () => {
  db = await pgliteDb();
  await seedMinimal(db, { remoteUrl: "file:///tmp/x.git", ownerEmail: "o@demo.invalid" });
});
afterAll(() => db.end());

describe("workbench writer (D-307)", () => {
  it("сесия с подагент, удар на сърцето, повикване с почистено обобщение, край", async () => {
    const w = workbench(db, DEMO_ORG_ID);
    await w.session({ id: "s_lead", task_id: null, parent_id: null, agent: "claude", model: "sonnet", account: "work", role: "lead", state: "running", step: "пише", context_pct: 10, usd: 0, touching: [] }, DEMO_REPO_ID);
    await w.session({ id: "s_sub", task_id: null, parent_id: "s_lead", agent: "claude", model: "haiku", account: "work", role: "subagent", state: "running", step: "тестове", context_pct: 5, usd: 0, touching: ["tests/a.spec.ts"] }, DEMO_REPO_ID);
    await w.beat("s_lead", { step: "тестове 3/5", context_pct: 62, usd: 0.31, touching: ["src/signup.ts"] });
    await w.toolCall({ session_id: "s_lead", kind: "mcp", tool: "github.get_issue", summary: "issue #407 token=abc123", decision: "allowed", duration_ms: 12 });
    await w.end("s_sub", "done");
    const s = (await db.query<{ id: string; state: string; step: string; ctx: number; ended: boolean }>("select id, state, step, context_pct::float8 as ctx, ended_at is not null as ended from public.agent_sessions order by id")).rows;
    expect(s).toEqual([{ id: "s_lead", state: "running", step: "тестове 3/5", ctx: 62, ended: false }, { id: "s_sub", state: "done", step: "тестове", ctx: 5, ended: true }]);
    const c = (await db.query<{ summary: string }>("select summary from public.tool_calls")).rows[0];
    expect(c?.summary).toBe("issue #407 [скрито]");
  });
  it("лоши данни не стигат до базата", async () => {
    const w = workbench(db, DEMO_ORG_ID);
    await expect(w.toolCall({ session_id: "s_lead", kind: "x" as "mcp", tool: "a", summary: "", decision: "allowed", duration_ms: null })).rejects.toThrow();
    await expect(w.window({ kind: "preview", title: "x", url: "https://evil.example" })).rejects.toThrow();
  });
  it("MCP, права, прозорци, нощна смяна с опашка, ресърч", async () => {
    const w = workbench(db, DEMO_ORG_ID);
    await w.mcp({ name: "github", transport: "http", tools: 26, status: "up", latency_ms: 12, egress_hosts: ["api.github.com"], repo_ids: null });
    await w.mcp({ name: "github", transport: "http", tools: 27, status: "slow", latency_ms: 900, egress_hosts: ["api.github.com"], repo_ids: null });
    await w.permission({ subject: "codex", tool: "stripe.*", decision: "deny" });
    await w.window({ kind: "preview", title: "shop · :5173", url: "http://localhost:5173/" }, { session_id: "s_lead", repo_id: DEMO_REPO_ID });
    const shift = await w.planNight({ starts_at: "2026-10-22T21:00:00Z", ends_at: "2026-10-23T05:00:00Z", budget_usd: 18, rules: { auto_merge: { min_level: 3, max_lines: 80 }, on_fail: "retry_once", same_file: "wait", forbid_tools: ["stripe.*"] } });
    await w.queueNight(shift, { repo_id: DEMO_REPO_ID, text: "README", risk: "low", est_minutes: 40, est_usd: 0.3 });
    await w.research({ id: "q_limits", question: "Лимити?", repo_id: null }, [{ n: 1, title: "docs", url: "https://example.com/docs", state: "read" }], [{ text: "твърдение", verdict: "single", source_ns: [1] }]);
    const n = async (t: string) => (await db.query<{ n: number }>(`select count(*)::int as n from public.${t}`)).rows[0]?.n;
    expect([await n("mcp_servers"), await n("tool_permissions"), await n("open_windows"), await n("night_queue"), await n("research_claims")]).toEqual([1, 1, 1, 1, 1]);
    expect((await db.query<{ tools: number }>("select tools from public.mcp_servers")).rows[0]?.tools).toBe(27);
  });
});
