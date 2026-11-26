import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fakeGitHub, prTitle } from "@mandat/gate-github";
import { finishOutcome } from "./daemon.js";
import { observerRecorder } from "./observer.js";
import { pgliteDb } from "./pglite-db.test-helper.js";
import { DEMO_ORG_ID, seedMinimal } from "./seed.js";

// E9f (D-660, D-215): the Observer App's webhook → sync_events (dedupe by X-GitHub-Delivery) → a push runs the revert
// observer. The commit messages are untrusted: sync_events keeps only the ref, the sha and the commit count.
let db: Awaited<ReturnType<typeof pgliteDb>>;
let repoId = "";
const REPO = "simo/web";
beforeAll(async () => {
  db = await pgliteDb();
  await seedMinimal(db, {});
  repoId = (await db.query<{ id: string }>("insert into public.repos (org_id, provider, full_name, remote_url) values ($1, 'github', $2, 'https://github.com/simo/web.git') returning id::text as id", [DEMO_ORG_ID, REPO])).rows[0]?.id as string;
});
afterAll(() => db.end());

describe("observerRecorder (D-660)", () => {
  it("push from the Observer: stored once without the messages; a revert of a merged change → failure outcome", async () => {
    const gh = fakeGitHub({ repos: { [REPO]: { rules: { strict: true, requiredContexts: [], mergeQueue: false } } } });
    await db.query("insert into public.tasks (id, org_id, repo_id, type, agent, text, state) values ('t_obs_1', $1, $2, 'docs', 'claude', 'Опиши API', 'GATED')", [DEMO_ORG_ID, repoId]);
    const cs = (await db.query<{ id: string }>("insert into public.changesets (org_id, task_id, attempt, base_sha, head_sha) values ($1, 't_obs_1', 1, $2, $2) returning id::text as id", [DEMO_ORG_ID, "a".repeat(40)])).rows[0]?.id as string;
    const base = gh.state.repos.get(REPO)?.head as string;
    const c = await gh.createCommit(REPO, { treeFromDiff: Buffer.from("d"), parentSha: base, message: "docs" });
    await gh.createRefIfAbsent(REPO, { ref: "refs/heads/mandat/t_obs_1-a1", sha: c.commitSha });
    const pr = await gh.createPull(REPO, { head: "mandat/t_obs_1-a1", base: "main", title: prTitle({ type: "docs", text: "Опиши API" }), body: "", draft: false });
    const m = await gh.mergePull(REPO, pr.number, { sha: c.commitSha, merge_method: "squash" });
    if (!m.ok) throw new Error("merge");
    await finishOutcome({ db }, { id: "t_obs_1", org_id: DEMO_ORG_ID, repo_id: repoId, type: "docs", agent: "claude", is_demo: false }, { level: 2, s_up: 0, s_down: 0, pinned: false }, "success", cs, pr.number, m.merge_commit_sha);
    const payload = gh.revertMerge(REPO, pr.number, "button");
    const logs: string[] = [];
    const record = observerRecorder({ db, log: (l) => logs.push(l) });
    expect(await record({ app: "observer", delivery: "d-1111-2222", event: "push", payload })).toBe(true);
    expect(await record({ app: "observer", delivery: "d-1111-2222", event: "push", payload })).toBe(false);
    const ev = (await db.query<{ event: string; source: string; payload: Record<string, unknown> }>("select event, source, payload from public.sync_events where delivery_id = 'd-1111-2222'")).rows;
    expect(ev).toEqual([{ event: "push", source: "webhook", payload: { ref: "refs/heads/main", after: payload.after, commits: 1 } }]);
    expect(JSON.stringify(ev)).not.toContain("Revert");
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.outcomes where changeset_id = $1 and reason = 'revert'", [cs])).rows[0]?.n).toBe(1);
    expect(logs).toEqual(["[observer] revert of t_obs_1 (revert_pr) → outcome failure"]);
  });
  it("the Writer's own events, other events, an unknown repo or a bad push: accepted and ignored, never an error", async () => {
    const record = observerRecorder({ db });
    expect(await record({ app: "writer", delivery: "d-w", event: "push", payload: {} })).toBe(true);
    expect(await record({ app: "observer", delivery: "d-o", event: "pull_request", payload: { action: "opened" } })).toBe(true);
    expect(await record({ app: "observer", delivery: "d-u", event: "push", payload: { ref: "refs/heads/main", before: "a".repeat(40), after: "b".repeat(40), repository: { full_name: "nobody/here" }, commits: [] } })).toBe(true);
    expect(await record({ app: "observer", delivery: "d-b", event: "push", payload: { ref: 1 } })).toBe(true);
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.sync_events where delivery_id in ('d-w', 'd-o', 'd-u', 'd-b')")).rows[0]?.n).toBe(0);
  });
});
