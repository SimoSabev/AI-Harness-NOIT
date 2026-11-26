import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Verdict } from "@mandat/contract";
import { decideDelivery } from "@mandat/core";
import { autoMerge, deliver, humanApproved } from "./deliver.js";
import type { DeliverInput } from "./deliver.js";
import { gitlabPort } from "./gitlab.js";
import { fakeGitLab } from "./gitlab-fake.js";
import type { FileChange } from "./octokit.js";

// E9f (v5 5.6, D-662): the GitLab port is the same GitHubPort (merge requests, pipelines, approvals as the „Мандат
// approval“ status). The delivery code of the gate runs unchanged on it; offline against fakeGitLab.
const P = "simo/shop";
const TOKEN = "glpat-test-not-real-0000";
const verdict = (result: "VERIFIED" | "UNKNOWN") =>
  Verdict.parse({
    run_id: "r_01JABCDEFGHJKMNPQRSTVWXYZ0", task_id: "t_gl", attempt: 1, agent: "claude", result, reasons: result === "UNKNOWN" ? ["INFRA:timeout"] : [], evidence: [{ detector: "D1.base_tests", phase: 1, status: "pass", summary: "ok", data: {}, source: "sandbox:verify", agent_visible: true }],
    contract_hash: `sha256:${"a".repeat(64)}`, base_sha: "a".repeat(40), tree_sha: "b".repeat(40), diff_hash: `sha256:${"c".repeat(64)}`, integrity: "ok",
    usage: { usd: 0, input_tokens: 0, output_tokens: 0, requests: 0 }, timings_ms: { provision: 0, install: 0, agent: 0, export: 0, verify: 0, verdict: 0, total: 0 }, created_at: "2026-11-26T00:00:00.000Z",
  });
const materialize = (): Promise<FileChange[]> => Promise.resolve([
  { path: "README.md", content: Buffer.from("# shop\n\nfixed\n"), mode: "100644" },
  { path: "src/new.ts", content: Buffer.from("export const x = 1;\n"), mode: "100644" },
  { path: "bin/run.sh", content: Buffer.from("#!/bin/sh\n"), mode: "100755" },
]);
function setup(o: { pipelines?: boolean; ultimate?: boolean } = {}) {
  const gl = fakeGitLab({ projects: { [P]: { only_allow_merge_if_pipeline_succeeds: o.pipelines ?? true, ...(o.ultimate ? { external_status_checks: [{ name: "security-review" }] } : {}) } } });
  const port = gitlabPort({ baseUrl: "https://gitlab.invalid", token: TOKEN, fetch: gl.fetch, materialize, treeOf: (_r, sha) => Promise.resolve(`tree-of-${sha.slice(0, 7)}`) });
  const base = gl.state.branches.get(`${P}:main`) ?? "";
  const i = (level: 0 | 1 | 2 | 3, result: "VERIFIED" | "UNKNOWN" = "VERIFIED"): DeliverInput => ({ repo: P, base: "main", task_id: "t_gl", attempt: 1, base_sha: base, tree_sha: "-", diffPatch: Buffer.from("diff"), verdict: verdict(result), effectiveLevel: level, levelReasons: [], ledgerSeq: 3, mode: "full", task: { type: "bugfix", text: "Поправи README" } });
  return { gl, port, base, i };
}
const id = (s: string) => s;

describe("GitLab port (D-662)", () => {
  it("level 2: commit + branch, MR (not a draft, squash), „Мандат verdict“ status, approval before the merge with sha = head", async () => {
    const { gl, port, base, i } = setup();
    const d = await deliver(port, i(2), decideDelivery({ result: "VERIFIED", effectiveLevel: 2, mode: "full", origin: "mandat" }));
    expect(d).toMatchObject({ kind: "pr", draft: false, auto_merge: true, number: 1 });
    if (d.kind !== "pr") return;
    const mr = gl.state.mrs.get(`${P}!1`);
    expect(mr).toMatchObject({ source_branch: "mandat/t_gl-a1", target_branch: "main", sha: d.head_sha, draft: false, title: "fix: Поправи README" });
    const files = gl.state.commits.get(d.head_sha)?.files;
    expect(files?.get("README.md")).toBe("# shop\n\nfixed\n");
    expect(files?.get("src/new.ts")).toBe("export const x = 1;\n");
    expect([...gl.state.branches.keys()].filter((k) => k.includes("tmp"))).toEqual([]); // the temporary branch is gone
    const m = await autoMerge(port, { repo: P, base: "main", number: d.number, head_sha: d.head_sha, base_sha: base, tree_sha_expected: "", task_id: "t_gl", level: 2, verdictSeq: 3, redact: id });
    expect(m).toMatchObject({ kind: "merged" });
    const order = gl.state.calls.filter((c) => c.startsWith("POST /statuses") || c.endsWith("/merge"));
    expect(order).toEqual(["POST /statuses/" + d.head_sha, "POST /statuses/" + d.head_sha, "PUT /merge_requests/1/merge"]);
    expect(gl.state.statuses.map((s) => [s.name, s.status])).toEqual([["Мандат verdict", "success"], ["Мандат approval", "success"]]);
    expect(gl.state.tokens.every((t) => t === TOKEN)).toBe(true);
  });
  it("level 1: a draft MR („Draft:“); without the approval the pipeline is not green → 405; approved → ready and mergeable", async () => {
    const { gl, port, i } = setup();
    const d = await deliver(port, i(1), decideDelivery({ result: "VERIFIED", effectiveLevel: 1, mode: "full", origin: "mandat" }));
    expect(d).toMatchObject({ kind: "pr", draft: true });
    if (d.kind !== "pr") return;
    expect(gl.state.mrs.get(`${P}!1`)?.title).toBe("Draft: fix: Поправи README");
    expect((await port.getPull(P, 1)).draft).toBe(true);
    await humanApproved(port, { repo: P, number: 1, head_sha: d.head_sha, task_id: "t_gl", approvedBy: "simo", external: false });
    expect(gl.state.mrs.get(`${P}!1`)).toMatchObject({ title: "fix: Поправи README", draft: false });
    expect(await port.mergePull(P, 1, { sha: d.head_sha, merge_method: "squash" })).toMatchObject({ ok: true });
  });
  it("UNKNOWN → status failed with „UNKNOWN: …“ (GitLab has no action_required; D-209's fallback) → the merge is blocked", async () => {
    const { gl, port, i } = setup();
    const d = await deliver(port, i(2, "UNKNOWN"), { kind: "pr_then_auto_merge", notify: true });
    if (d.kind !== "pr") throw new Error("pr");
    expect(gl.state.statuses[0]).toMatchObject({ name: "Мандат verdict", status: "failed" });
    expect(gl.state.statuses[0]?.description).toMatch(/^UNKNOWN/);
    expect(await port.mergePull(P, 1, { sha: d.head_sha, merge_method: "squash" })).toMatchObject({ ok: false, status: 405 });
  });
  it("a moved head → 409 (autoMerge: mixed); a branch that exists → ref_exists; the same status twice → updated, not new", async () => {
    const { gl, port, base, i } = setup();
    const d = await deliver(port, i(2), { kind: "pr_then_auto_merge", notify: true });
    if (d.kind !== "pr") throw new Error("pr");
    expect(await port.mergePull(P, 1, { sha: "f".repeat(40), merge_method: "squash" })).toMatchObject({ ok: false, status: 409 });
    expect(await port.createRefIfAbsent(P, { ref: "refs/heads/mandat/t_gl-a1", sha: base })).toEqual({ ok: false, reason: "ref_exists" });
    const a = await port.createOrUpdateCheckRun(P, { name: "Мандат approval", head_sha: d.head_sha, external_id: "x", conclusion: "success", title: "ok", summary: "s" });
    const b = await port.createOrUpdateCheckRun(P, { name: "Мандат approval", head_sha: d.head_sha, external_id: "x", conclusion: "success", title: "ok", summary: "s" });
    expect(a.created).toBe(true);
    expect(b).toEqual({ id: a.id, created: false });
    expect(gl.state.statuses.filter((s) => s.name === "Мандат approval")).toHaveLength(1);
  });
  it("pipelines: a red pipeline is a failed check run (and blocks the merge); statuses map to GitHub's states", async () => {
    const { gl, port, i } = setup();
    const d = await deliver(port, i(2), { kind: "pr_then_auto_merge", notify: true });
    if (d.kind !== "pr") throw new Error("pr");
    gl.addPipeline(P, d.head_sha, "failed");
    expect(await port.listCheckRunsForRef(P, d.head_sha)).toEqual([expect.objectContaining({ status: "completed", conclusion: "failure", app_slug: "gitlab-ci" })]);
    gl.state.statuses.push({ id: 1, project: P, sha: d.head_sha, name: "lint", status: "running", description: "", target_url: null, author: { id: 5 } });
    expect(await port.listCommitStatusesForRef(P, d.head_sha)).toEqual(expect.arrayContaining([{ context: "lint", state: "pending", creator_id: 5 }, { context: "Мандат verdict", state: "success", creator_id: 7001 }]));
    await port.createOrUpdateCheckRun(P, { name: "Мандат approval", head_sha: d.head_sha, external_id: "t_gl", conclusion: "success", title: "approved", summary: "" });
    expect(await port.mergePull(P, 1, { sha: d.head_sha, merge_method: "squash" })).toMatchObject({ ok: false, status: 405 });
    gl.addPipeline(P, d.head_sha, "success");
    gl.state.statuses.push({ id: 2, project: P, sha: d.head_sha, name: "lint", status: "success", description: "", target_url: null, author: { id: 5 } });
    expect(await port.mergePull(P, 1, { sha: d.head_sha, merge_method: "squash" })).toMatchObject({ ok: true });
  });
  it("rules: „pipelines must succeed“ → Mandat's two statuses are required; off → none (level ≥ 2 then stays capped, D-231); Ultimate adds the external checks", async () => {
    expect(await setup().port.getRules(P, "main")).toEqual({ strict: false, requiredContexts: ["Мандат verdict", "Мандат approval"], mergeQueue: false, integrationIds: {} });
    expect((await setup({ pipelines: false }).port.getRules(P, "main")).requiredContexts).toEqual([]);
    expect((await setup({ ultimate: true }).port.getRules(P, "main")).requiredContexts).toEqual(["Мандат verdict", "Мандат approval", "security-review"]);
  });
  it("getPull / listOpenPulls map an MR; the token never shows in an error; a bad project path is refused before any request", async () => {
    const { gl, port, i } = setup();
    await deliver(port, i(1), { kind: "draft_pr" });
    const p = await port.getPull(P, 1);
    expect(p).toMatchObject({ number: 1, head_ref: "mandat/t_gl-a1", base_ref: "main", author_login: "mandat-bot", author_type: "Bot", author_association: "NONE", head_repo_full_name: P, draft: true });
    expect((await port.listOpenPulls(P)).map((x) => x.number)).toEqual([1]);
    const e = (await port.getPull(P, 99).then(() => new Error("no error"), (x: unknown) => x)) as Error & { status?: number };
    expect(e.status).toBe(404);
    expect(String(e.message)).not.toContain(TOKEN);
    const n = gl.state.calls.length;
    await expect(port.getPull("../../etc", 1)).rejects.toThrow(/bad project/);
    expect(gl.state.calls.length).toBe(n);
  });
  it("git side: refs/merge-requests/<iid>/head into the mirror and a commit's tree by fetching it (no token on the command line)", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "mandat-gl-git-"));
    const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@x", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@x" };
    const g = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, env, encoding: "utf8" }).trim();
    const bare = path.join(root, "srv", "simo", "shop.git");
    mkdirSync(bare, { recursive: true });
    g(bare, "init", "-q", "--bare");
    const w = path.join(root, "w");
    mkdirSync(w);
    g(w, "init", "-q");
    writeFileSync(path.join(w, "a.txt"), "a\n");
    g(w, "add", "a.txt");
    g(w, "commit", "-q", "--no-gpg-sign", "-m", "a");
    const sha = g(w, "rev-parse", "HEAD");
    const tree = g(w, "rev-parse", "HEAD^{tree}");
    g(w, "push", "-q", bare, "HEAD:refs/heads/main", "HEAD:refs/merge-requests/4/head");
    g(bare, "config", "uploadpack.allowAnySHA1InWant", "true");
    const mirror = path.join(root, "mirror.git");
    mkdirSync(mirror);
    g(mirror, "init", "-q", "--bare");
    const port = gitlabPort({ baseUrl: "https://gitlab.invalid", token: TOKEN, cloneBase: path.join(root, "srv"), fetch: fakeGitLab().fetch });
    expect(await port.fetchPullHead(P, 4, mirror)).toEqual({ head_sha: sha });
    expect(await port.getCommitTreeSha(P, sha)).toBe(tree);
    await expect(port.getCommitTreeSha(P, "x")).rejects.toThrow(/bad sha/);
    await expect(port.fetchPullHead(P, 0, mirror)).rejects.toThrow(/bad merge request/);
    await expect(port.fetchPullHead(P, 5, mirror)).rejects.toThrow(/refs\/merge-requests\/5/);
  });
  it("HTTP errors: 401/403 → 403, 406 → 405 (merge); createCommit without materialize; a 500 is thrown with the route, not the token", async () => {
    const codes = [401, 406, 500];
    const f = (async () => new Response(JSON.stringify({ message: "x" }), { status: codes.shift() ?? 500 })) as unknown as typeof fetch;
    const port = gitlabPort({ baseUrl: "https://gitlab.invalid/", token: TOKEN, fetch: f });
    expect(await port.mergePull(P, 1, { sha: "a".repeat(40), merge_method: "squash" })).toMatchObject({ ok: false, status: 403 });
    expect(await port.mergePull(P, 1, { sha: "a".repeat(40), merge_method: "squash" })).toMatchObject({ ok: false, status: 405 });
    const e = await port.mergePull(P, 1, { sha: "a".repeat(40), merge_method: "squash" }).catch((x: unknown) => x as Error);
    expect(String((e as Error).message)).toBe("GitLab PUT /projects/simo%2Fshop/merge_requests/1/merge → 500");
    await expect(port.createCommit(P, { treeFromDiff: Buffer.from(""), parentSha: "a".repeat(40), message: "m" })).rejects.toThrow(/materialize/);
  });
});
