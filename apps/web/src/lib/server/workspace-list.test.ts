import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_ORG_ID, DEMO_REPO_ID, DEMO_OWNER_ID } from "../../../../worker/src/online/seed";
import { translator } from "../../i18n/t";
import { homeQueue } from "../home";
import { inbox, taskRow } from "./queries";
import { jcs, sha256Tag } from "@mandat/contract";
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
    // D-709: the session has its job's state — running, though its units' tries are blocked (the job retries them)
    expect(mine).toEqual(expect.arrayContaining([["c_wjob", "blue"], ["c_wtalk", "amber"]]));
    expect(rows.some((r) => r.id.startsWith("t_wu"))).toBe(false);
    const ib = await inbox(db, DEMO_OWNER_ID, DEMO_ORG_ID);
    expect(ib.items.filter((x) => x.id.startsWith("t_wu"))).toHaveLength(3);
    expect(waiting).toBe(rows.filter((r) => r.tone === "amber" || r.tone === "red").length);
    // D-542/D-709: a question while the rest works makes it wait for the person
    await asService(db, (sql) => sql.query("update public.jobs set question = 'u2?' where id = 'j_wjob'"));
    expect((await workspaceList(db, DEMO_OWNER_ID, DEMO_ORG_ID, translator("en"))).find((r) => r.id === "c_wjob")).toMatchObject({ tone: "amber", label: "Waiting for you" });
    await asService(db, (sql) => sql.query("update public.jobs set question = null where id = 'j_wjob'"));
  });
});

// D-627: a task its subscription's limit holds (D-607) is in work, with the reset time; the worker runs it again by itself
describe("a task waiting for its subscription's limit (D-627)", () => {
  it("is not waiting for the person; the row carries the reset time from the ledger", async () => {
    const resets = "2026-11-26T09:00:00.000Z";
    await asService(db, async (sql) => {
      await sql.query("insert into public.tasks (id, org_id, repo_id, type, agent, text, state, wait_reason) values ('t_wlimit', $1::uuid, $2::uuid, 'free', 'claude', 'limit', 'HELD', 'channel_limit')", [DEMO_ORG_ID, DEMO_REPO_ID]);
      const text = jcs({ channel: "claude", retry_after_s: null, resets_at: resets });
      await sql.query("select private.ledger_append($1::uuid, 'channel_limit', 't_wlimit', $2, $3)", [DEMO_ORG_ID, text, sha256Tag(text)]);
    });
    const row = await asService(db, (sql) => taskRow(sql, DEMO_ORG_ID, "t_wlimit"));
    expect(row?.limit_resets_at).toBe(resets);
    const rows = await workspaceList(db, DEMO_OWNER_ID, DEMO_ORG_ID, translator("en"));
    expect(rows.find((r) => r.id === "t_wlimit")?.tone).toBe("blue");
    expect((await inbox(db, DEMO_OWNER_ID, DEMO_ORG_ID)).items.some((x) => x.id === "t_wlimit")).toBe(false);
  });
});

// D-633: the list by project — a conversation is one session and its tasks (units, the single-agent comparison) are its
// sub-sessions; every session carries its project's name
describe("sessions and sub-sessions (D-633)", () => {
  it("a job's units and its comparison task belong to its conversation, with the project; under it only what waits (D-709)", async () => {
    await asService(db, (sql) => sql.query("insert into public.tasks (id, org_id, repo_id, type, agent, text, state, kind) values ('t_cmp_wjob', $1::uuid, $2::uuid, 'free', 'claude', 'compare', 'CLOSED', 'compare')", [DEMO_ORG_ID, DEMO_REPO_ID]));
    const rows = await workspaceList(db, DEMO_OWNER_ID, DEMO_ORG_ID, translator("en"));
    const job = rows.find((r) => r.id === "c_wjob");
    // D-709: the tries and the comparison are in the job card, not under the session
    expect(job?.subs).toBeUndefined();
    expect(job?.project).toBe(DEMO_REPO_ID);
    expect(job?.projectName).not.toBe("");
    expect(rows.some((r) => r.id === "t_cmp_wjob")).toBe(false);
  });
});
