import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProfileLayers, demoProfileLayers, profileHash } from "@mandat/contract";
import { DEMO_ORG_ID, DEMO_REPO_ID } from "../../../../worker/src/online/seed";
import { profileTrials } from "./evolve";
import { U, webDb } from "./web-db.test-helper";

// D-530: what the projects page shows of profile evolution — each trial with its change, evidence, prediction, bench
// and where it stands — read as the person (RLS: every member of the org).
let db: Awaited<ReturnType<typeof webDb>>;
beforeEach(async () => (db = await webDb()));
afterEach(async () => db.end());

describe("profileTrials (D-530)", () => {
  it("lists the trials of each project, newest first, with the manifest read through the contract", async () => {
    const layers = ProfileLayers.parse(demoProfileLayers());
    const p = await db.query<{ id: string }>("insert into public.harness_profiles (org_id, repo_id, version, layers, sources, profile_hash, status, approved_at) values ($1, $2, 77, $3::jsonb, '{}', $4, 'approved', now()) returning id::text as id", [DEMO_ORG_ID, DEMO_REPO_ID, JSON.stringify(layers), profileHash(layers)]);
    const manifest = { change: { rule: "tests_kept", layer: "b", detail: "" }, evidence: ["t_a", "t_b", "t_c"], reason_class: "D2:missing_test", prediction: { task_type: "bugfix", next_n: 10, max_repeats: 0 } };
    await db.query("insert into public.profile_trials (org_id, repo_id, change_key, manifest, from_profile, status, bench, why, created_at) values ($1, $2, 'tests_kept||bugfix', $3::jsonb, $4::uuid, 'accepted', $5::jsonb, 'held', now() - interval '1 hour')", [DEMO_ORG_ID, DEMO_REPO_ID, JSON.stringify(manifest), p.rows[0]?.id, JSON.stringify({ before: { pass: 9, total: 10, false_verified: 0 }, after: { pass: 10, total: 10, false_verified: 0 } })]);
    await db.query("insert into public.profile_trials (org_id, repo_id, change_key, manifest, from_profile) values ($1, $2, 'bad', '{}'::jsonb, $3::uuid)", [DEMO_ORG_ID, DEMO_REPO_ID, p.rows[0]?.id]);
    const v = await profileTrials(db, U.viewer, DEMO_ORG_ID);
    // E9д (D-645): a trial from before E9д has no rule name and Mandat may accept it
    expect(v[DEMO_REPO_ID]).toEqual([{ id: expect.any(String), status: "accepted", manifest, bench: { before: { pass: 9, total: 10, false_verified: 0 }, after: { pass: 10, total: 10, false_verified: 0 } }, why: "held", source: null, needs_person: false }]);
  });
});
