import { describe, expect, it } from "vitest";
import { gitlabPort } from "./gitlab.js";

// E9f (D-662): run by Simo (docs/setup/live-tests.md, local-live-checklist row 38). Without GITLAB_* → SKIPPED, never counted
// as passed. Needs a project access token (api scope) on a test project with an open MR whose head Mandat may mark.
const E = process.env;
const live = Boolean(E.GITLAB_TOKEN && E.GITLAB_DEMO_PROJECT && E.MANDAT_LIVE_MR);
const gl = () => gitlabPort({ baseUrl: E.GITLAB_URL ?? "https://gitlab.com", token: E.GITLAB_TOKEN ?? "" });
const project = E.GITLAB_DEMO_PROJECT ?? "";
const mr = Number(E.MANDAT_LIVE_MR ?? 0);

describe("GitLab live (GL1–GL3)", () => {
  // D-662: needs GITLAB_TOKEN, GITLAB_DEMO_PROJECT, MANDAT_LIVE_MR (GITLAB_URL optional)
  it.skipIf(!live)("GL1: MR → PullInfo; „Мандат verdict“ status created, then the same one is not posted again", async () => {
    const p = await gl().getPull(project, mr);
    expect(p.head_sha).toMatch(/^[0-9a-f]{40}$/);
    const a = await gl().createOrUpdateCheckRun(project, { name: "Мандат verdict", head_sha: p.head_sha, external_id: "live", conclusion: "action_required", title: "UNKNOWN: live GL1", summary: "" });
    const b = await gl().createOrUpdateCheckRun(project, { name: "Мандат verdict", head_sha: p.head_sha, external_id: "live", conclusion: "action_required", title: "UNKNOWN: live GL1", summary: "" });
    expect(b).toEqual({ id: a.id, created: false });
  });
  // D-662: same env as GL1
  it.skipIf(!live)("GL2: merge with a stale sha → 409", async () => {
    expect(await gl().mergePull(project, mr, { sha: "0".repeat(40), merge_method: "squash" })).toMatchObject({ ok: false, status: 409 });
  });
  // D-662: same env; the project must have „Pipelines must succeed“ on
  it.skipIf(!live)("GL3: a failed „Мандат verdict“ blocks the merge (external status in the pipeline) [НП until this runs]", async () => {
    expect((await gl().getRules(project, "main")).requiredContexts).toContain("Мандат verdict");
    const p = await gl().getPull(project, mr);
    expect((await gl().mergePull(project, mr, { sha: p.head_sha, merge_method: "squash" })).ok).toBe(false);
  });
});
