import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ProfileLayers, demoProfileLayers, profileHash } from "@mandat/contract";
import type { ProfileLayers as Layers } from "@mandat/contract";
import { NO_HIDDEN_PROBE, TESTS_KEPT } from "@mandat/profile";
import { pgliteDb } from "./pglite-db.test-helper.js";
import { DEMO_ORG_ID, DEMO_OWNER_ID, DEMO_REPO_ID, seedMinimal } from "./seed.js";
import { evolveTick, profileLineage } from "./evolve.js";
import type { BenchScore } from "./evolve.js";

// D-530 (round 2): the tick of profile evolution. Recurring failures → a trial; the bench gate (the same scenarios with
// the current and the changed profile) → a narrowing change Mandat accepts by itself as a new approved version (the
// twin's rule follows it); a regression on the bench → refused; a prediction the next tasks falsify → rolled back.
let db: Awaited<ReturnType<typeof pgliteDb>>;
let n = 0;
const layers: Layers = ProfileLayers.parse(demoProfileLayers());

beforeAll(async () => {
  db = await pgliteDb();
  await seedMinimal(db, { remoteUrl: "file:///tmp/x.git" });
  const p = await db.query<{ id: string }>("insert into public.harness_profiles (org_id, repo_id, version, layers, sources, profile_hash, status, approved_at) values ($1, $2, 1, $3::jsonb, '{}', $4, 'approved', now()) returning id::text as id", [DEMO_ORG_ID, DEMO_REPO_ID, JSON.stringify(layers), profileHash(layers)]);
  await db.query("update public.repos set profile_id = $2::uuid where id = $1", [DEMO_REPO_ID, p.rows[0]?.id]);
});
afterAll(() => db.end());

/** a finished task of `type` with a verdict of `result` and `reasons`, `minsAgo` minutes ago */
const task = async (result: "FAILED" | "UNKNOWN" | "VERIFIED", reasons: string[], o: { type?: string; minsAgo?: number } = {}) => {
  const id = `t_ev_${++n}`;
  await db.query("insert into public.tasks (id, org_id, repo_id, type, agent, text, state) values ($1, $2, $3, $4, 'claude', 'x', 'GATED')", [id, DEMO_ORG_ID, DEMO_REPO_ID, o.type ?? "bugfix"]);
  await db.query("update public.tasks set state = $2, state_entered_at = now() - make_interval(mins => $3::int) where id = $1", [id, result === "VERIFIED" ? "CLOSED" : "BLOCKED", o.minsAgo ?? 60]);
  await db.query("insert into public.verdicts (org_id, task_id, run_id, attempt, mode, agent, result, reasons, base_sha, verdict_hash, created_at) values ($1, $2, $3, 1, 'full', 'claude', $4, $5::jsonb, $6, 'sha256:x', now() - make_interval(mins => $7::int))", [DEMO_ORG_ID, id, `r_${String(n).padStart(26, "0")}`, result, JSON.stringify(reasons), "a".repeat(40), o.minsAgo ?? 60]);
  return id;
};
const current = async () => (await db.query<{ version: number; layers: Layers; profile_hash: string }>("select h.version, h.layers, h.profile_hash from public.repos r join public.harness_profiles h on h.id = r.profile_id where r.id = $1", [DEMO_REPO_ID])).rows[0];
const trials = async () => (await db.query<{ change_key: string; status: string; why: string | null }>("select change_key, status, why from public.profile_trials order by created_at")).rows;
const score = (pass: number, fv = 0): BenchScore => ({ pass, total: 10, false_verified: fv });

describe("evolveTick (D-530)", () => {
  it("three test deletions → a trial; without a bench it waits; the bench passes → a new approved version with the boundary; the twin's rule follows", async () => {
    for (let i = 0; i < 3; i++) await task("FAILED", ["D2:missing_test:tests/cart.spec.ts > a"]);
    const before = await current();
    await db.query("insert into public.twin_rules (org_id, class_key, approved_by, policy_hash) values ($1, $2, $3, $4)", [DEMO_ORG_ID, `${DEMO_REPO_ID}|bugfix|claude|approval`, DEMO_OWNER_ID, before?.profile_hash]);
    let r = await evolveTick(db, { now: new Date() });
    expect(r.proposed).toEqual(["tests_kept||bugfix"]);
    expect(await trials()).toEqual([{ change_key: "tests_kept||bugfix", status: "proposed", why: null }]);
    r = await evolveTick(db, { now: new Date(), bench: (l) => Promise.resolve(l.b.boundaries.includes(TESTS_KEPT) ? score(10) : score(9)) });
    expect(r.accepted).toEqual(["tests_kept||bugfix"]);
    const after = await current();
    expect(after?.version).toBe((before?.version ?? 0) + 1);
    expect(after?.layers.b.boundaries).toContain(TESTS_KEPT);
    expect((await db.query<{ policy_hash: string }>("select policy_hash from public.twin_rules")).rows[0]?.policy_hash).toBe(after?.profile_hash);
    const led = (await db.query<{ payload: { status: string; by: string } }>("select payload from public.ledger where kind = 'profile_trial' order by seq")).rows.map((x) => x.payload);
    expect(led.map((p) => p.status)).toEqual(["proposed", "accepted"]);
    expect(led[1]?.by).toBe("mandat");
    // the same change is never proposed twice
    expect((await evolveTick(db, { now: new Date() })).proposed).toEqual([]);
  });

  it("a change that makes the bench worse is refused and the profile stays", async () => {
    for (let i = 0; i < 3; i++) await task("FAILED", ["D4:out_of_contract:ops/**"]);
    const before = await current();
    await evolveTick(db, { now: new Date() });
    const r = await evolveTick(db, { now: new Date(), bench: (l) => Promise.resolve(l.c.some((x) => x.tool === "path:write:ops/**") ? score(8) : score(10)) });
    expect(r.refused).toEqual(["protect_path|ops/**|bugfix"]);
    expect((await trials()).find((t) => t.change_key === "protect_path|ops/**|bugfix")).toMatchObject({ status: "refused" });
    expect((await current())?.version).toBe(before?.version);
  });

  it("the prediction: the class comes back in the next tasks of the type → the change is rolled back to the old layers", async () => {
    const accepted = await current();
    const first = (await db.query<{ from_profile: string }>("select from_profile::text as from_profile from public.profile_trials where change_key = 'tests_kept||bugfix'")).rows[0];
    await db.query("update public.profile_trials set decided_at = now() - interval '30 minutes' where change_key = 'tests_kept||bugfix'");
    await task("VERIFIED", [], { minsAgo: 20 });
    await task("FAILED", ["D2:skipped:tests/cart.spec.ts > b"], { minsAgo: 10 });
    const r = await evolveTick(db, { now: new Date() });
    expect(r.rolledBack).toEqual(["tests_kept||bugfix"]);
    const now = await current();
    const old = (await db.query<{ layers: Layers; profile_hash: string }>("select layers, profile_hash from public.harness_profiles where id = $1::uuid", [first?.from_profile])).rows[0];
    expect(now?.version).toBe((accepted?.version ?? 0) + 1);
    expect(now?.layers.b.boundaries).not.toContain(TESTS_KEPT);
    expect(now?.profile_hash).toBe(old?.profile_hash);
    expect((await db.query<{ policy_hash: string }>("select policy_hash from public.twin_rules")).rows[0]?.policy_hash).toBe(now?.profile_hash);
    expect((await trials()).find((t) => t.change_key === "tests_kept||bugfix")).toMatchObject({ status: "rolled_back" });
  });
});

describe("the held-out heavy bench in the gate (D-550)", () => {
  it("the visible bench holds but the held-out one gets worse → refused; only the counts are kept", async () => {
    for (let i = 0; i < 3; i++) await task("FAILED", ["D4:out_of_contract:deploy/**"]);
    await evolveTick(db, { now: new Date() });
    const before = await current();
    const denies = (l: Layers) => l.c.some((x) => x.tool === "path:write:deploy/**");
    const r = await evolveTick(db, { now: new Date(), bench: (l) => Promise.resolve({ ...score(10), heldout: denies(l) ? { pass: 6, total: 8, false_verified: 0 } : { pass: 8, total: 8, false_verified: 0 } }) });
    expect(r.refused).toEqual(["protect_path|deploy/**|bugfix"]);
    const t = (await db.query<{ why: string; bench: Record<string, unknown> }>("select why, bench from public.profile_trials where change_key = 'protect_path|deploy/**|bugfix'")).rows[0];
    expect(t?.why).toContain("held-out");
    expect(t?.bench).toEqual({ before: { ...score(10), heldout: { pass: 8, total: 8, false_verified: 0 } }, after: { ...score(10), heldout: { pass: 6, total: 8, false_verified: 0 } } });
    expect((await current())?.version).toBe(before?.version);
  });
  it("a bench without the held-out set can not accept a change by itself: it waits benched", async () => {
    for (let i = 0; i < 3; i++) await task("FAILED", ["D4:out_of_contract:vendorx/**"]);
    await evolveTick(db, { now: new Date() });
    const before = await current();
    const r = await evolveTick(db, { now: new Date(), bench: () => Promise.resolve(score(10)), requireHeldout: true });
    expect(r.accepted).toEqual([]);
    expect(await trials()).toContainEqual(expect.objectContaining({ change_key: "protect_path|vendorx/**|bugfix", status: "benched" }));
    expect((await current())?.version).toBe(before?.version);
  });
});

describe("the archive with lineage (D-551)", () => {
  it("every version Mandat made names its parent, how it came and its trial; the chain reads back to the first", async () => {
    const chain = await profileLineage(db, DEMO_REPO_ID);
    expect(chain.length).toBeGreaterThanOrEqual(3);
    // newest first: the roll back, then the accepted boundary, then the first version a person approved
    expect(chain.slice(0, 2).map((s) => [s.origin, s.change])).toEqual([["evolve_rollback", "tests_kept"], ["evolve", "tests_kept"]]);
    expect(chain[1]?.bench).toMatchObject({ before: "9/10", after: "10/10" });
    expect(chain.at(-1)).toMatchObject({ version: 1, origin: null, change: null });
    const all = (await db.query<{ n: number }>("select count(*)::int as n from public.harness_profiles where repo_id = $1", [DEMO_REPO_ID])).rows[0]?.n;
    expect(chain).toHaveLength(all ?? 0);
  });
});

describe("parts are tried without when the model changes (D-553)", () => {
  it("a part accepted under one model, tasks now on another → a removal trial on the bench; it holds → waits for a person, the profile stays", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) ids.push(await task("UNKNOWN", ["D13:hidden_probe:tool:1"], { minsAgo: 50 }));
    await db.query("update public.tasks set model = 'sonnet-old' where id = any($1::text[])", [ids]);
    await evolveTick(db, { now: new Date() });
    const hasProbe = (l: Layers) => l.b.boundaries.includes(NO_HIDDEN_PROBE);
    const full = { ...score(10), heldout: { pass: 8, total: 8, false_verified: 0 } };
    let r = await evolveTick(db, { now: new Date(), bench: () => Promise.resolve(full) });
    expect(r.accepted).toEqual(["no_hidden_probe||bugfix"]);
    expect(r.ablated).toEqual([]);
    const accepted = await current();
    await db.query("update public.profile_trials set decided_at = now() - interval '5 minutes' where change_key = 'no_hidden_probe||bugfix'");
    // the tasks move to a new model
    const later = await task("VERIFIED", [], { minsAgo: 1 });
    await db.query("update public.tasks set model = 'sonnet-new' where id = $1", [later]);
    const seen: boolean[] = [];
    r = await evolveTick(db, { now: new Date(), bench: (l) => (seen.push(hasProbe(l)), Promise.resolve(full)) });
    expect(r.ablated).toEqual(["ablate|no_hidden_probe||claude:sonnet-new"]);
    expect(seen).toEqual([true, false]);
    expect(await trials()).toContainEqual(expect.objectContaining({ change_key: "ablate|no_hidden_probe||claude:sonnet-new", status: "benched" }));
    expect((await current())?.version).toBe(accepted?.version);
    expect((await current())?.layers.b.boundaries).toContain(NO_HIDDEN_PROBE);
    // once per part and model
    expect((await evolveTick(db, { now: new Date(), bench: () => Promise.resolve(full) })).ablated).toEqual([]);
  });
});
