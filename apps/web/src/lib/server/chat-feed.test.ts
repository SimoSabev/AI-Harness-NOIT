import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_ORG_ID } from "../../../../worker/src/online/seed";
import { taskFeed } from "./chat-feed";
import { asService } from "./sql";
import { U, webDb } from "./web-db.test-helper";

describe("taskFeed: новото по задача за чата на живо", () => {
  let db: Awaited<ReturnType<typeof webDb>>;
  beforeAll(async () => {
    db = await webDb();
    await asService(db, async (sql) => {
      await sql.query("insert into public.agent_sessions (id, org_id, task_id, agent, model, role, state, step, touching, context_pct, started_at) values ('s_old', $1, 't_seed_docs', 'claude', 'm', 'lead', 'failed', 'x', '{}', null, now() - interval '5 minutes'), ('s_lead', $1, 't_seed_docs', 'claude', 'm', 'lead', 'running', 'Edit', '{src/cart.ts,README.md}', 18, now())", [DEMO_ORG_ID]);
      await sql.query("insert into public.agent_sessions (id, org_id, task_id, parent_id, agent, model, role, state, step, touching) values ('s_sub', $1, 't_seed_docs', 's_lead', 'claude', 'm', 'subagent', 'running', 'Read', '{docs/a.md}')", [DEMO_ORG_ID]);
      await sql.query("insert into public.session_lines (org_id, session_id, seq, kind, text) values ($1, 's_old', 0, 'text', 'стар опит'), ($1, 's_lead', 0, 'init', 'start'), ($1, 's_lead', 1, 'text', 'Ще опиша кода.'), ($1, 's_lead', 2, 'tool_call', 'Read: README.md')", [DEMO_ORG_ID]);
      await sql.query("insert into public.task_activities (org_id, task_id, kind, text) values ($1, 't_seed_docs', 'steer', 'пиши кратко')", [DEMO_ORG_ID]);
      await sql.query("insert into public.task_activities (org_id, task_id, kind, text) values ($1, 't_seed_docs', 'needs_you', 'sensitive:deps:package.json'), ($1, 't_seed_docs', 'tool', 'edit x')", [DEMO_ORG_ID]);
    });
  });
  afterAll(async () => db.end());

  it("последната водеща сесия: редове, файлове (с подагентите), контекст, насочвания", async () => {
    const f = await taskFeed(db, U.approver, DEMO_ORG_ID, "t_seed_docs", -1);
    expect(f?.task).toMatchObject({ id: "t_seed_docs", state: "RUNNING", agent: "claude", last_result: null });
    expect(f?.session).toBe("s_lead");
    expect(f?.lines.map((l) => l.seq)).toEqual([0, 1, 2]);
    expect(f?.lines[2]).toMatchObject({ kind: "tool_call", text: "Read: README.md" });
    expect(typeof f?.lines[0]?.at).toBe("string");
    expect(f?.touching).toEqual(["README.md", "docs/a.md", "src/cart.ts"]);
    expect(f?.context_pct).toBe(18);
    expect(f?.steers.map((s) => s.text)).toEqual(["пиши кратко"]);
    expect(f?.notes).toEqual([{ kind: "needs_you", text: "sensitive:deps:package.json" }]);
  });
  it("само след курсора", async () => {
    const f = await taskFeed(db, U.approver, DEMO_ORG_ID, "t_seed_docs", 1);
    expect(f?.lines.map((l) => l.seq)).toEqual([2]);
  });
  it("viewer вижда потока, но не и насочванията (RLS)", async () => {
    const f = await taskFeed(db, U.viewer, DEMO_ORG_ID, "t_seed_docs", -1);
    expect(f?.lines).toHaveLength(3);
    expect(f?.steers).toEqual([]);
  });
  it("задача без сесия; непозната или с лошо id → null", async () => {
    const f = await taskFeed(db, U.approver, DEMO_ORG_ID, "t_seed_css", -1);
    expect(f).toMatchObject({ session: null, lines: [], touching: [], context_pct: null });
    expect(f?.task.last_result).toBe("VERIFIED");
    expect(await taskFeed(db, U.approver, DEMO_ORG_ID, "t_nope", -1)).toBeNull();
    expect(await taskFeed(db, U.approver, DEMO_ORG_ID, "../x", -1)).toBeNull();
  });
});
