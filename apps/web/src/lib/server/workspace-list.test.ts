import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_ORG_ID, DEMO_REPO_ID, DEMO_OWNER_ID } from "../../../../worker/src/online/seed";
import { translator } from "../../i18n/t";
import { homeQueue } from "../home";
import { inbox } from "./queries";
import { asService } from "./sql";
import { workspaceList } from "./workspace-list";
import { webDb } from "./web-db.test-helper";

// D-624 (Simo 26.11.2026, "изравни ги"): the badge on the rail and the window title said 32 while the list said 9 —
// they counted every waiting task (a job's units one by one) and no conversation. They count the list's own rows now.
let db: Awaited<ReturnType<typeof webDb>>;
beforeAll(async () => {
  db = await webDb();
  await asService(db, async (sql) => {
    await sql.query("insert into public.conversations (id, org_id, repo_id, agent, budget_usd, expires_at, status, created_by) values ('c_wjob', $1::uuid, $2::uuid, 'claude', 0.5, now() + interval '1 hour', 'idle', $3::uuid), ('c_wtalk', $1::uuid, $2::uuid, 'claude', 0.5, now() + interval '1 hour', 'idle', $3::uuid)", [DEMO_ORG_ID, DEMO_REPO_ID, DEMO_OWNER_ID]);
    await sql.query("insert into public.conversation_turns (conversation_id, org_id, seq, kind, data) values ('c_wtalk', $1::uuid, 0, 'human', '{\"text\":\"hi\"}'::jsonb)", [DEMO_ORG_ID]);
    await sql.query("insert into public.jobs (id, org_id, repo_id, conversation_id, spec_hash, oracle_hash, type, agent, status) values ('j_wjob', $1::uuid, $2::uuid, 'c_wjob', $3, $3, 'free', 'claude', 'running')", [DEMO_ORG_ID, DEMO_REPO_ID, `sha256:${"b".repeat(64)}`]);
    await sql.query("update public.conversations set job_id = 'j_wjob' where id = 'c_wjob'");
    for (const id of ["t_wu1", "t_wu2", "t_wu3"]) {
      await sql.query("insert into public.tasks (id, org_id, repo_id, type, agent, text, state, job_id, job_role) values ($1, $2::uuid, $3::uuid, 'free', 'claude', 'unit', 'BLOCKED', 'j_wjob', 'unit')", [id, DEMO_ORG_ID, DEMO_REPO_ID]);
    }
  });
});
afterAll(async () => db.end());

describe("the waiting count is the list's (D-624)", () => {
  it("a job's three blocked units are one row; an idle conversation counts; the inbox counted them one by one", async () => {
    const rows = await workspaceList(db, DEMO_OWNER_ID, DEMO_ORG_ID, translator("en"));
    const waiting = homeQueue(rows).counts.waiting;
    const mine = rows.filter((r) => ["c_wjob", "c_wtalk"].includes(r.id)).map((r) => [r.id, r.tone]);
    expect(mine).toEqual(expect.arrayContaining([["c_wjob", "red"], ["c_wtalk", "amber"]]));
    expect(rows.some((r) => r.id.startsWith("t_wu"))).toBe(false);
    const ib = await inbox(db, DEMO_OWNER_ID, DEMO_ORG_ID);
    expect(ib.items.filter((x) => x.id.startsWith("t_wu"))).toHaveLength(3);
    expect(waiting).toBe(rows.filter((r) => r.tone === "amber" || r.tone === "red").length);
  });
});
