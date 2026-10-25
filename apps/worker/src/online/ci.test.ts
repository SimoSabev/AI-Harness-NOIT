import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fakeGitHub } from "@mandat/gate-github";
import { pgliteDb } from "./pglite-db.test-helper.js";
import { DEMO_ORG_ID, DEMO_REPO_ID, seedMinimal } from "./seed.js";
import { ciNote, fixCi, pollCi } from "./ci.js";

// E8g (v5 p. 4.7 (3), AC-9.2, D-356): the project's CI on Mandat's PR. A failure → HELD ci_failed with the failing checks as
// the log (names only, framed); "Fix CI" → a new attempt with the log in the contract; after ci_rounds (2) failed rounds the
// task is the person's (no more automatic rounds). Mandat's own checks never count.
let db: Awaited<ReturnType<typeof pgliteDb>>;
const gh = fakeGitHub({ repos: { "mandat-demo/shop": {} } });
const HEAD1 = "1".repeat(40);
const HEAD2 = "2".repeat(40);
const deliveredPr = async (attempt: number, head: string) => {
  const cs = (await db.query<{ id: string }>("insert into public.changesets (org_id, task_id, attempt, base_sha, head_sha) values ($1, 't_ci', $2, $3, $4) returning id::text as id", [DEMO_ORG_ID, attempt, "a".repeat(40), head])).rows[0]?.id;
  await db.query("insert into public.deliveries (org_id, changeset_id, level, kind, ref, pr_number, head_sha) values ($1, $2, 1, 'pr', 'mandat/t_ci-a1', 7, $3)", [DEMO_ORG_ID, cs, head]);
  await db.query("update public.tasks set state = 'HELD', wait_reason = 'approval', attempt = $1 where id = 't_ci'", [attempt]);
};
beforeAll(async () => {
  db = await pgliteDb();
  await seedMinimal(db, { remoteUrl: "file:///tmp/x.git" });
  await db.query("insert into public.tasks (id, org_id, repo_id, type, agent, text, state) values ('t_ci', $1, $2, 'bugfix', 'claude', 'x', 'GATED')", [DEMO_ORG_ID, DEMO_REPO_ID]);
});
afterAll(() => db.end());

describe("CI rounds (AC-9.2)", () => {
  it("Mandat's own checks and green CI change nothing; a red CI → HELD ci_failed with the log; polled once per head", async () => {
    await deliveredPr(1, HEAD1);
    gh.addCheck("mandat-demo/shop", { name: "Мандат verdict", head_sha: HEAD1, external_id: "t_ci", conclusion: "success", app_id: 1001, title: "", summary: "" });
    gh.addCheck("mandat-demo/shop", { name: "lint", head_sha: HEAD1, external_id: "x", conclusion: "success", app_id: 42, title: "", summary: "" });
    expect(await pollCi({ db, gh, ghRepo: "mandat-demo/shop" })).toEqual([]);
    gh.addCheck("mandat-demo/shop", { name: "test (node 24)", head_sha: HEAD1, external_id: "y", conclusion: "failure", app_id: 42, title: "", summary: "" });
    expect(await pollCi({ db, gh, ghRepo: "mandat-demo/shop" })).toEqual(["t_ci"]);
    expect((await db.query("select state, wait_reason, ci_rounds from public.tasks where id = 't_ci'")).rows[0]).toEqual({ state: "HELD", wait_reason: "ci_failed", ci_rounds: 1 });
    expect(await ciNote(db, "t_ci")).toContain("`test (node 24)`: failure");
    expect(await pollCi({ db, gh, ghRepo: "mandat-demo/shop" })).toEqual([]);
  });
  it("Fix CI → a new attempt (retry_reason ci); the second red round → no more rounds (409)", async () => {
    expect(await fixCi(db, { taskId: "t_ci", by: null })).toEqual({ ok: true, attempt: 2 });
    expect((await db.query("select state, retry_reason from public.tasks where id = 't_ci'")).rows[0]).toEqual({ state: "CREATED", retry_reason: "ci" });
    await deliveredPr(2, HEAD2);
    gh.addCheck("mandat-demo/shop", { name: "test (node 24)", head_sha: HEAD2, external_id: "z", conclusion: "failure", app_id: 42, title: "", summary: "" });
    expect(await pollCi({ db, gh, ghRepo: "mandat-demo/shop" })).toEqual(["t_ci"]);
    expect((await db.query<{ ci_rounds: number }>("select ci_rounds from public.tasks where id = 't_ci'")).rows[0]?.ci_rounds).toBe(2);
    expect(await fixCi(db, { taskId: "t_ci", by: null })).toEqual({ ok: false, reason: "ci_rounds_exhausted" });
  });
});
