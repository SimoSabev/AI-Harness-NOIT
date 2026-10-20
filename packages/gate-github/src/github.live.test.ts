import { describe, expect, it } from "vitest";
import { octokitGitHub } from "./octokit.js";

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
});
