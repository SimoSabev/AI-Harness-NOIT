import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pushFromGitHub } from "@mandat/contract";
import { LADDER_STEP_FAILURE } from "@mandat/core";
import { autoMerge, fakeGitHub, prTitle } from "@mandat/gate-github";
import { finishOutcome } from "./daemon.js";
import { pgliteDb } from "./pglite-db.test-helper.js";
import { observePush } from "./revert.js";
import { DEMO_ORG_ID, seedMinimal } from "./seed.js";

// AC-9.5 (v5 5.6, D-660): a change merged at level 2 and reverted within 7 days → outcomes.failure, the ladder takes a
// failure step (−1,099 on s_up, +1,099 on s_down), a notification and a ledger row. Offline with fakeGitHub.
let db: Awaited<ReturnType<typeof pgliteDb>>;
let repoId = "";
const REPO = "simo/shop";
const TEXT = "Поправи закръглянето на ДДС";
beforeAll(async () => {
  db = await pgliteDb();
  await seedMinimal(db, {});
  await db.query("update public.orgs set is_demo = false where id = $1", [DEMO_ORG_ID]);
  repoId = (await db.query<{ id: string }>("insert into public.repos (org_id, provider, full_name, remote_url) values ($1, 'github', $2, 'https://github.com/simo/shop.git') returning id::text as id", [DEMO_ORG_ID, REPO])).rows[0]?.id as string;
});
afterAll(() => db.end());

const S_UP = 2.5;
const S_DOWN = 0.4;
let n = 0;
/** A level-2 task merged by Mandat through fakeGitHub; returns its changeset, the PR and the fake. */
// one GitHub for the whole file, like a real repo: every PR has its own number
const GH = fakeGitHub({ repos: { [REPO]: { rules: { strict: true, requiredContexts: [], mergeQueue: false } } } });
async function mergedAtLevel2(gh = GH) {
  n++;
  const task = `t_rev_${n}`;
  await db.query("insert into public.tasks (id, org_id, repo_id, type, agent, text, state) values ($1, $2, $3, 'bugfix', 'claude', $4, 'GATED')", [task, DEMO_ORG_ID, repoId, TEXT]);
  const cs = (await db.query<{ id: string }>("insert into public.changesets (org_id, task_id, attempt, base_sha, head_sha) values ($1, $2, 1, $3, $3) returning id::text as id", [DEMO_ORG_ID, task, "a".repeat(40)])).rows[0]?.id as string;
  await db.query(
    `insert into public.ladder_state (org_id, repo_id, task_type, agent, level, s_up, s_down, pinned) values ($1, $2, 'bugfix', 'claude', 2, $3, $4, false)
       on conflict (repo_id, task_type, agent) do update set level = 2, s_up = $3, s_down = $4`,
    [DEMO_ORG_ID, repoId, S_UP, S_DOWN],
  );
  const base = gh.state.repos.get(REPO)?.head as string;
  const c = await gh.createCommit(REPO, { treeFromDiff: Buffer.from(`diff ${task}`), parentSha: base, message: "fix" });
  await gh.createRefIfAbsent(REPO, { ref: `refs/heads/mandat/${task}-a1`, sha: c.commitSha });
  const pr = await gh.createPull(REPO, { head: `mandat/${task}-a1`, base: "main", title: prTitle({ type: "bugfix", text: TEXT }), body: "", draft: false });
  const m = await autoMerge(gh, { repo: REPO, base: "main", number: pr.number, head_sha: c.commitSha, base_sha: base, tree_sha_expected: "", task_id: task, level: 2, verdictSeq: 1, redact: (s) => s });
  if (m.kind !== "merged") throw new Error(`not merged: ${m.kind}`);
  const ladder = { level: 2 as const, s_up: S_UP, s_down: S_DOWN, pinned: false };
  await finishOutcome({ db }, { id: task, org_id: DEMO_ORG_ID, repo_id: repoId, type: "bugfix", agent: "claude", is_demo: false }, ladder, "success", cs, pr.number, m.merge_commit_sha);
  const after = (await db.query<{ s_up: number; s_down: number }>("select s_up, s_down from public.ladder_state where repo_id = $1 and task_type = 'bugfix' and agent = 'claude'", [repoId])).rows[0];
  return { task, cs, pr: pr.number, gh, after: { s_up: Number(after?.s_up), s_down: Number(after?.s_down) } };
}
const ladderNow = async () => {
  const r = (await db.query<{ level: number; s_up: number; s_down: number }>("select level, s_up, s_down from public.ladder_state where repo_id = $1 and task_type = 'bugfix' and agent = 'claude'", [repoId])).rows[0];
  return { level: r?.level, s_up: Number(r?.s_up), s_down: Number(r?.s_down) };
};

describe("revert observer (AC-9.5)", () => {
  it("`git revert` of the merge pushed to main → outcomes.failure, ladder −1,099, push „reverted“, ledger, activity", async () => {
    const x = await mergedAtLevel2();
    const push = pushFromGitHub(x.gh.revertMerge(REPO, x.pr, "git"));
    if (!push) throw new Error("push did not parse");
    const found = await observePush({ db }, push, new Date());
    expect(found).toEqual([expect.objectContaining({ changeset_id: x.cs, signal: "reverts_commit" })]);
    const o = (await db.query<{ result: string; reason: string; revert_sha: string }>("select result, reason, revert_sha from public.outcomes where changeset_id = $1 order by decided_at, reason", [x.cs])).rows;
    expect(o.map((r) => [r.result, r.reason])).toEqual([["success", "merge"], ["failure", "revert"]]);
    expect(o[1]?.revert_sha).toBe(push.after);
    const l = await ladderNow();
    expect(LADDER_STEP_FAILURE).toBeCloseTo(-1.099, 3);
    expect(l.s_up).toBeCloseTo(Math.max(0, x.after.s_up + LADDER_STEP_FAILURE), 9);
    expect(l.s_down).toBeCloseTo(x.after.s_down - LADDER_STEP_FAILURE, 9);
    const ev = (await db.query<{ input: string; task_id: string }>("select input, task_id from public.ladder_events where task_id = $1 order by id", [x.task])).rows;
    expect(ev.map((e) => e.input)).toEqual(["success", "failure"]);
    const ob = (await db.query<{ payload: { task_id: string; kind: string } }>("select payload from public.outbox where kind = 'web_push' and idempotency_key = $1", [`push:${x.task}:reverted`])).rows;
    expect(ob[0]?.payload).toEqual({ task_id: x.task, kind: "reverted" });
    const led = (await db.query<{ payload_jcs: string }>("select payload_jcs from public.ledger where task_id = $1 and kind = 'outcome' order by seq", [x.task])).rows.map((r) => JSON.parse(r.payload_jcs) as Record<string, unknown>);
    expect(led[1]).toMatchObject({ result: "failure", reason: "revert", revert_sha: push.after, signal: "reverts_commit" });
    const act = (await db.query<{ kind: string; text: string }>("select kind, text from public.task_activities where task_id = $1 and kind = 'reverted'", [x.task])).rows;
    expect(act).toEqual([{ kind: "reverted", text: `reverts_commit ${push.after.slice(0, 12)}` }]);
  });
  it("the same push again (webhook redelivery) changes nothing", async () => {
    const x = await mergedAtLevel2();
    const push = pushFromGitHub(x.gh.revertMerge(REPO, x.pr, "button"));
    if (!push) throw new Error("push did not parse");
    expect(await observePush({ db }, push, new Date())).toHaveLength(1);
    const once = await ladderNow();
    expect(await observePush({ db }, push, new Date())).toEqual([]);
    expect(await ladderNow()).toEqual(once);
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.outcomes where changeset_id = $1 and reason = 'revert'", [x.cs])).rows[0]?.n).toBe(1);
  });
  it("after 7 days the revert is not the agent's failure any more; a push to another branch or repo is ignored", async () => {
    const x = await mergedAtLevel2();
    const push = pushFromGitHub(x.gh.revertMerge(REPO, x.pr, "git"));
    if (!push) throw new Error("push did not parse");
    const before = await ladderNow();
    expect(await observePush({ db }, { ...push, branch: "release" }, new Date())).toEqual([]);
    expect(await observePush({ db }, { ...push, repo: "simo/other" }, new Date())).toEqual([]);
    expect(await observePush({ db }, push, new Date(Date.now() + 7 * 24 * 3600 * 1000 + 60_000))).toEqual([]);
    expect(await ladderNow()).toEqual(before);
  });
  it("enough reverts take the level down (CUSUM down, h = 3.5)", async () => {
    await db.query("update public.ladder_state set s_down = 3.0 where repo_id = $1", [repoId]);
    const x = await mergedAtLevel2();
    await db.query("update public.ladder_state set s_down = 3.0 where repo_id = $1", [repoId]);
    const push = pushFromGitHub(x.gh.revertMerge(REPO, x.pr, "git"));
    if (!push) throw new Error("push did not parse");
    await observePush({ db }, push, new Date());
    expect((await ladderNow()).level).toBe(1);
    const led = (await db.query<{ payload_jcs: string }>("select payload_jcs from public.ledger where task_id = $1 and kind = 'ladder_change'", [x.task])).rows.map((r) => JSON.parse(r.payload_jcs) as Record<string, unknown>);
    expect(led.at(-1)).toMatchObject({ from: 2, to: 1 });
  });
});
