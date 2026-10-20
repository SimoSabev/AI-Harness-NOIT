import { describe, expect, it } from "vitest";
import { octokitGitHub } from "./octokit.js";
import type { Rest } from "./octokit.js";

// The REST mapping of the real adapter, against a scripted client (routes and bodies from the GitHub OpenAPI).
function rest(script: Record<string, (p: Record<string, unknown>) => unknown>, calls: string[]): Rest {
  return {
    request: (route, params = {}) => {
      calls.push(route);
      const f = script[route];
      if (!f) return Promise.reject(Object.assign(new Error(`unscripted ${route}`), { status: 500 }));
      try {
        return Promise.resolve({ status: 200, data: f(params) });
      } catch (e) {
        return Promise.reject(e);
      }
    },
  };
}
const err = (status: number, message = "x") => Object.assign(new Error(message), { status });
const PULL = { number: 3, head: { sha: "a".repeat(40), ref: "f", repo: { full_name: "o/r" } }, base: { sha: "b".repeat(40), ref: "main" }, user: { login: "u", id: 9, type: "User" }, author_association: "MEMBER", draft: false, title: "t", body: null, node_id: "N" };

describe("octokitGitHub (scripted REST)", () => {
  it("pulls, rules, check run create/update, refs 422, merge 409/405, statuses", async () => {
    const calls: string[] = [];
    const runs: { id: number; external_id: string }[] = [];
    const gh = octokitGitHub({ appId: "1", privateKey: "-", installationId: 1, rest: rest({
      "GET /repos/{owner}/{repo}/pulls/{pull_number}": () => PULL,
      "GET /repos/{owner}/{repo}/pulls": () => [PULL],
      "GET /repos/{owner}/{repo}/rules/branches/{branch}": () => [{ type: "required_status_checks", parameters: { strict_required_status_checks_policy: true, required_status_checks: [{ context: "Мандат verdict", integration_id: 1001 }] } }, { type: "merge_queue" }],
      "GET /repos/{owner}/{repo}/commits/{ref}/check-runs": () => ({ check_runs: runs.map((r) => ({ ...r, name: "Мандат verdict", status: "completed", conclusion: "failure", app: { id: 1001, slug: "w" } })) }),
      "POST /repos/{owner}/{repo}/check-runs": (p) => {
        runs.push({ id: 7, external_id: p.external_id as string });
        return { id: 7 };
      },
      "PATCH /repos/{owner}/{repo}/check-runs/{check_run_id}": () => ({}),
      "POST /repos/{owner}/{repo}/git/refs": (p) => {
        if (p.ref === "refs/heads/dup") throw err(422, "Reference already exists");
        return {};
      },
      "PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge": (p) => {
        if (p.sha === "0".repeat(40)) throw err(409, "Head branch was modified");
        if (p.pull_number === 4) throw err(405, "not mergeable");
        if (p.pull_number === 5) throw err(500, "boom");
        return { sha: "c".repeat(40) };
      },
      "GET /repos/{owner}/{repo}/git/commits/{commit_sha}": () => ({ tree: { sha: "d".repeat(40) } }),
      "GET /repos/{owner}/{repo}/commits/{ref}/statuses": () => [{ context: "ci", state: "success", creator: { id: 2 } }, { context: "x", state: "pending", creator: null }],
      "POST /repos/{owner}/{repo}/pulls": () => ({ number: 8, html_url: "https://github.invalid/o/r/pull/8" }),
      "POST /graphql": () => ({}),
      "POST /repos/{owner}/{repo}/git/blobs": () => ({ sha: "e".repeat(40) }),
      "POST /repos/{owner}/{repo}/git/trees": () => ({ sha: "f".repeat(40) }),
      "POST /repos/{owner}/{repo}/git/commits": () => ({ sha: "1".repeat(40) }),
    }, calls), materialize: () => Promise.resolve([{ path: "a.ts", content: Buffer.from("x"), mode: "100644" }, { path: "b.ts", content: null, mode: "100644" }]) });
    expect(await gh.getPull("o/r", 3)).toMatchObject({ number: 3, head_sha: "a".repeat(40), author_id: 9, author_app_id: null, base_ref: "main" });
    expect(await gh.listOpenPulls("o/r")).toHaveLength(1);
    expect(await gh.getRules("o/r", "main")).toEqual({ strict: true, requiredContexts: ["Мандат verdict"], mergeQueue: true, integrationIds: { "Мандат verdict": 1001 } });
    const c = { name: "Мандат verdict" as const, head_sha: "a".repeat(40), external_id: "t_a", conclusion: "failure" as const, title: "F", summary: "s" };
    expect(await gh.createOrUpdateCheckRun("o/r", c)).toEqual({ id: 7, created: true });
    expect(await gh.createOrUpdateCheckRun("o/r", c)).toEqual({ id: 7, created: false });
    expect(await gh.createRefIfAbsent("o/r", { ref: "refs/heads/x", sha: "a".repeat(40) })).toEqual({ ok: true });
    expect(await gh.createRefIfAbsent("o/r", { ref: "refs/heads/dup", sha: "a".repeat(40) })).toEqual({ ok: false, reason: "ref_exists" });
    expect(await gh.mergePull("o/r", 3, { sha: "a".repeat(40), merge_method: "squash" })).toEqual({ ok: true, merge_commit_sha: "c".repeat(40) });
    expect(await gh.mergePull("o/r", 3, { sha: "0".repeat(40), merge_method: "squash" })).toMatchObject({ ok: false, status: 409 });
    expect(await gh.mergePull("o/r", 4, { sha: "a".repeat(40), merge_method: "squash" })).toMatchObject({ ok: false, status: 405 });
    await expect(gh.mergePull("o/r", 5, { sha: "a".repeat(40), merge_method: "squash" })).rejects.toThrow(/boom/);
    expect(await gh.getCommitTreeSha("o/r", "c".repeat(40))).toBe("d".repeat(40));
    expect(await gh.listCheckRunsForRef("o/r", "a".repeat(40))).toEqual([{ name: "Мандат verdict", status: "completed", conclusion: "failure", app_id: 1001, app_slug: "w" }]);
    expect(await gh.listCommitStatusesForRef("o/r", "a".repeat(40))).toEqual([{ context: "ci", state: "success", creator_id: 2 }, { context: "x", state: "pending", creator_id: 0 }]);
    expect(await gh.createPull("o/r", { head: "h", base: "main", title: "t", body: "b", draft: true })).toEqual({ number: 8, url: "https://github.invalid/o/r/pull/8" });
    await gh.markReadyForReview("o/r", 3);
    expect(await gh.createCommit("o/r", { treeFromDiff: Buffer.from("d"), parentSha: "b".repeat(40), message: "m" })).toEqual({ commitSha: "1".repeat(40), treeSha: "f".repeat(40) });
    await expect(octokitGitHub({ appId: "1", privateKey: "-", installationId: 1, rest: rest({}, []) }).createCommit("o/r", { treeFromDiff: Buffer.from(""), parentSha: "b", message: "m" })).rejects.toThrow(/materialize/);
    await expect(gh.getPull("bad", 1)).rejects.toThrow(/bad repo/);
    await expect(gh.fetchPullHead("bad repo", 1, "/tmp")).rejects.toThrow(/bad repo/);
    expect(calls).toContain("POST /graphql");
  });
});
