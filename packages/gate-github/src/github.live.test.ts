import { App } from "@octokit/app";
import { describe, expect, it } from "vitest";
import { octokitGitHub } from "./octokit.js";
import type { Rest } from "./octokit.js";

// D-228 / D-276: run by Simo (docs/setup/live-tests.md). Without GITHUB_* → SKIPPED, never counted as passed.
const E = process.env;
const live = Boolean(E.GITHUB_WRITER_APP_ID && E.GITHUB_WRITER_PRIVATE_KEY && E.GITHUB_WRITER_INSTALLATION_ID && E.GITHUB_DEMO_REPO && E.MANDAT_LIVE_PR);
const gh = () => octokitGitHub({ appId: E.GITHUB_WRITER_APP_ID ?? "", privateKey: E.GITHUB_WRITER_PRIVATE_KEY ?? "", installationId: Number(E.GITHUB_WRITER_INSTALLATION_ID) });
const repo = E.GITHUB_DEMO_REPO ?? "";
const pr = Number(E.MANDAT_LIVE_PR ?? 0);

describe("GitHub live (L1–L3)", () => {
  // D-276: needs GITHUB_WRITER_APP_ID, GITHUB_WRITER_PRIVATE_KEY, GITHUB_WRITER_INSTALLATION_ID, GITHUB_DEMO_REPO, MANDAT_LIVE_PR
  it.skipIf(!live)("L1: check run „Мандат verdict“ на тестов PR (създаден и после обновен по external_id)", async () => {
    const p = await gh().getPull(repo, pr);
    const a = await gh().createOrUpdateCheckRun(repo, { name: "Мандат verdict", head_sha: p.head_sha, external_id: `live:${p.head_sha.slice(0, 12)}`, conclusion: "action_required", title: "UNKNOWN: live L1", summary: "live test" });
    const b = await gh().createOrUpdateCheckRun(repo, { name: "Мандат verdict", head_sha: p.head_sha, external_id: `live:${p.head_sha.slice(0, 12)}`, conclusion: "action_required", title: "UNKNOWN: live L1", summary: "live test (update)" });
    expect(b).toEqual({ id: a.id, created: false });
  });
  // D-276: same env as L1
  it.skipIf(!live)("L2: merge със стар sha → 409", async () => {
    const r = await gh().mergePull(repo, pr, { sha: "0".repeat(40), merge_method: "squash" });
    expect(r).toMatchObject({ ok: false, status: 409 });
  });
  // D-276: same env as L1; the ruleset must require „Мандат verdict“ (docs/setup/github-demo-repo.md)
  it.skipIf(!live)("L3: required „Мандат verdict“ = action_required блокира сливането; context = името на check run-а", async () => {
    const rules = await gh().getRules(repo, "main");
    expect(rules.requiredContexts).toContain("Мандат verdict");
    const p = await gh().getPull(repo, pr);
    const r = await gh().mergePull(repo, pr, { sha: p.head_sha, merge_method: "squash" });
    expect(r.ok).toBe(false);
  });
  // E9f (v5 5.6): a commit the Writer App makes through REST (no custom author/committer/signature) must be „Verified“.
  // D-663: needs GITHUB_WRITER_APP_ID, GITHUB_WRITER_PRIVATE_KEY, GITHUB_WRITER_INSTALLATION_ID, GITHUB_DEMO_REPO
  it.skipIf(!(E.GITHUB_WRITER_APP_ID && E.GITHUB_WRITER_PRIVATE_KEY && E.GITHUB_WRITER_INSTALLATION_ID && E.GITHUB_DEMO_REPO))("L4: a Writer App commit through REST is verified by GitHub", async () => {
    const rest = (await new App({ appId: E.GITHUB_WRITER_APP_ID ?? "", privateKey: E.GITHUB_WRITER_PRIVATE_KEY ?? "" }).getInstallationOctokit(Number(E.GITHUB_WRITER_INSTALLATION_ID))) as unknown as Rest;
    const [owner, name] = repo.split("/");
    const head = ((await rest.request("GET /repos/{owner}/{repo}/branches/{branch}", { owner, repo: name, branch: "main" })).data as { commit: { sha: string } }).commit.sha;
    const port = octokitGitHub({ appId: "", privateKey: "", installationId: 0, rest, materialize: () => Promise.resolve([{ path: "mandat-l4.txt", content: Buffer.from(`L4 ${new Date().toISOString()}\n`), mode: "100644" }]) });
    const c = await port.createCommit(repo, { treeFromDiff: Buffer.from("l4"), parentSha: head, message: "test: L4 verified commit (not on any branch)" });
    const v = ((await rest.request("GET /repos/{owner}/{repo}/git/commits/{commit_sha}", { owner, repo: name, commit_sha: c.commitSha })).data as { verification: { verified: boolean; reason: string } }).verification;
    expect(v).toMatchObject({ verified: true, reason: "valid" });
  });
});
