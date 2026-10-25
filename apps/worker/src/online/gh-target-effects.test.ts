import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fakeGitHub } from "@mandat/gate-github";
import { pgliteDb } from "./pglite-db.test-helper.js";
import { DEMO_ORG_ID, DEMO_REPO_ID, seedMinimal } from "./seed.js";
import { pollCi } from "./ci.js";
import { approvalHandlers } from "./effects.js";

// D-388: the approval effects and the CI rounds follow the project of the task, not the worker's one repo.
let db: Awaited<ReturnType<typeof pgliteDb>>;
const HEAD = "3".repeat(40);
beforeAll(async () => {
  db = await pgliteDb();
  await seedMinimal(db, { remoteUrl: "file:///tmp/x.git" });
});
afterAll(() => db.end());

const changeset = async (task: string, repo: string, kind: "pr" | "branch_only") => {
  await db.query("insert into public.tasks (id, org_id, repo_id, type, agent, text, state, wait_reason) values ($1, $2, $3, 'bugfix', 'claude', 'x', 'HELD', 'approval')", [task, DEMO_ORG_ID, repo]);
  const cs = (await db.query<{ id: string }>("insert into public.changesets (org_id, task_id, attempt, base_sha, head_sha) values ($1, $2, 1, $3, $4) returning id::text as id", [DEMO_ORG_ID, task, "a".repeat(40), HEAD])).rows[0]?.id as string;
  await db.query("insert into public.deliveries (org_id, changeset_id, level, kind, ref, pr_number, head_sha) values ($1, $2, 1, $3, $4, $5, $6)", [DEMO_ORG_ID, cs, kind, `mandat/${task}-a1`, kind === "pr" ? 9 : null, HEAD]);
  return cs;
};

describe("per-project GitHub side (D-388)", () => {
  it("approval_check of an own local project goes to the offline GitHub under its name; the worker's GitHub is untouched", async () => {
    await db.query("update public.repos set full_name = 'local/shop' where id = $1", [DEMO_REPO_ID]);
    const cs = await changeset("t_own", DEMO_REPO_ID, "branch_only");
    const gh = fakeGitHub({ repos: { "mandat-demo/shop": {} } });
    const localGh = fakeGitHub({ autoRepos: true });
    await approvalHandlers({ db, gh, ghRepo: "mandat-demo/shop", localGh }).approval_check({ id: 1, kind: "approval_check", payload: { changeset_id: cs, head_sha: HEAD } } as never);
    expect(localGh.state.calls.some((c) => c.startsWith("check local/shop Мандат approval"))).toBe(true);
    expect(gh.state.calls).toEqual([]);
  });
  it("CI of a GitHub project is read from its own repo", async () => {
    const repo = (await db.query<{ id: string }>("insert into public.repos (org_id, provider, full_name, remote_url) values ($1, 'github', 'simo/api', 'https://github.com/simo/api.git') returning id::text as id", [DEMO_ORG_ID])).rows[0]?.id as string;
    await changeset("t_gh", repo, "pr");
    const gh = fakeGitHub({ repos: { "mandat-demo/shop": {}, "simo/api": {} } });
    // a commit status is per repo in the fake (its check runs are not), so this tells the repos apart
    gh.state.statuses.push({ repo: "simo/api", sha: HEAD, context: "ci/test", state: "failure", creator_id: 42 });
    expect(await pollCi({ db, gh, ghRepo: "mandat-demo/shop" })).toEqual(["t_gh"]);
  });
});
