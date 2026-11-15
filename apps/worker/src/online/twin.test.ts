import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pgliteDb } from "./pglite-db.test-helper.js";
import { DEMO_ORG_ID, DEMO_OWNER_ID, DEMO_REPO_ID, seedMinimal } from "./seed.js";
import { twinTick } from "./twin.js";

// D-523 „Двойникът на собственика“: the tick. In shadow it writes one prediction per attempt waiting on an approval and
// scores it when the owner decides; under an approved rule it approves alone (method 'twin', as the rule's owner), and
// never where a second factor, a changed policy or a used-up weekly budget says no. Its own approvals never teach it.
let db: Awaited<ReturnType<typeof pgliteDb>>;
const HASH = `sha256:${"a".repeat(64)}`;
const BUG = `${DEMO_REPO_ID}|bugfix|claude|approval`;
const FEAT = `${DEMO_REPO_ID}|feature|claude|approval`;
let n = 0;

beforeAll(async () => {
  db = await pgliteDb();
  await seedMinimal(db, { remoteUrl: "file:///tmp/x.git" });
  const p = await db.query<{ id: string }>("insert into public.harness_profiles (org_id, repo_id, version, layers, sources, profile_hash, status, approved_at) values ($1, $2, 1, '{}'::jsonb, '{}', $3, 'approved', now()) returning id::text as id", [DEMO_ORG_ID, DEMO_REPO_ID, HASH]);
  await db.query("update public.repos set profile_id = $2::uuid where id = $1", [DEMO_REPO_ID, p.rows[0]?.id]);
});
afterAll(() => db.end());

/** a task of `type` waiting on the owner's approval of attempt 1 (VERIFIED) */
const held = async (id: string, o: { type?: string; twoFactor?: boolean; level?: number } = {}) => {
  await db.query("insert into public.tasks (id, org_id, repo_id, type, agent, text, state) values ($1, $2, $3, $4, 'claude', 'x', 'GATED')", [id, DEMO_ORG_ID, DEMO_REPO_ID, o.type ?? "bugfix"]);
  const head = (++n).toString(16).padStart(40, "0");
  const cs = await db.query<{ id: string }>(
    "insert into public.changesets (org_id, task_id, attempt, base_sha, head_sha, effective_level, requires_second_factor, approval_needed) values ($1, $2, 1, $3, $4, $5, $6, true) returning id::text as id",
    [DEMO_ORG_ID, id, "b".repeat(40), head, o.level ?? 1, o.twoFactor ?? false],
  );
  await db.query("update public.tasks set state = 'HELD', wait_reason = 'approval', last_result = 'VERIFIED' where id = $1", [id]);
  return cs.rows[0]?.id ?? "";
};
/** the owner's own decision on a task, `days` ago */
const decide = async (id: string, cs: string, decision: "approved" | "rejected", days = 1) => {
  await db.query("insert into public.approvals (org_id, changeset_id, user_id, decision, method, client, decided_at) values ($1, $2::uuid, $3, $4, 'tap', 'web', now() - make_interval(days => $5::int))", [DEMO_ORG_ID, cs, DEMO_OWNER_ID, decision, days]);
  await db.query("update public.tasks set state = $2, wait_reason = null where id = $1", [id, decision === "approved" ? "GATED" : "CLOSED"]);
};
const past = async (prefix: string, decisions: ("approved" | "rejected")[], type = "bugfix") => {
  for (const [i, d] of decisions.entries()) await decide(`${prefix}${i}`, await held(`${prefix}${i}`, { type }), d, 3);
};
const pred = async (id: string) => (await db.query<{ predicted: string; n: number; actual: string | null; by_twin: boolean; class_key: string }>("select predicted, n, actual, by_twin, class_key from public.twin_predictions where task_id = $1", [id])).rows;
const scored = async (k: number, class_key = BUG) => {
  for (let i = 0; i < k; i++) {
    await db.query("insert into public.tasks (id, org_id, repo_id, type, agent, text, state) values ($1, $2, $3, 'bugfix', 'claude', 'x', 'CLOSED')", [`t_tw_sc${n}_${i}`, DEMO_ORG_ID, DEMO_REPO_ID]);
    await db.query("insert into public.twin_predictions (org_id, task_id, attempt, class_key, predicted, p, n, actual, decided_at) values ($1, $2, 1, $3, 'approved', 0.95, 10, 'approved', now())", [DEMO_ORG_ID, `t_tw_sc${n}_${i}`, class_key]);
  }
  n++;
};
const rule = (o: { hash?: string; revoked?: boolean } = {}) =>
  db.query("insert into public.twin_rules (org_id, class_key, approved_by, policy_hash, revoked_at) values ($1, $2, $3, $4, $5) on conflict (org_id, class_key) do update set policy_hash = excluded.policy_hash, revoked_at = excluded.revoked_at", [DEMO_ORG_ID, BUG, DEMO_OWNER_ID, o.hash ?? HASH, o.revoked ? new Date().toISOString() : null]);

describe("twinTick (D-523)", () => {
  it("shadow: a waiting task gets one prediction from the owner's past decisions, scored when the owner decides", async () => {
    await past("t_tw_h", ["approved", "approved", "approved"]);
    const cs = await held("t_tw_new");
    const r = await twinTick(db, { now: new Date() });
    expect(r.predicted).toContain("t_tw_new");
    expect(await pred("t_tw_new")).toEqual([{ predicted: "approved", n: 3, actual: null, by_twin: false, class_key: BUG }]);
    await twinTick(db, { now: new Date() });
    expect(await pred("t_tw_new")).toHaveLength(1);
    await decide("t_tw_new", cs, "rejected", 0);
    await twinTick(db, { now: new Date() });
    expect((await pred("t_tw_new"))[0]?.actual).toBe("rejected");
  });

  it("a class with no history abstains; the second factor is its own class", async () => {
    await held("t_tw_feat", { type: "feature" });
    await held("t_tw_2fa", { twoFactor: true });
    await twinTick(db, { now: new Date() });
    expect((await pred("t_tw_feat"))[0]).toMatchObject({ predicted: "abstain", n: 0, class_key: FEAT });
    expect((await pred("t_tw_2fa"))[0]?.class_key).toBe(`${DEMO_REPO_ID}|bugfix|claude|approval_2fa`);
  });

  it("offers a class once it is accurate enough and has no rule", async () => {
    await scored(20); // with the one miss above: 20 of 21, a lower bound just over 0.8
    expect((await twinTick(db, { now: new Date() })).offers).toContain(BUG);
    await rule({ revoked: true });
    expect((await twinTick(db, { now: new Date() })).offers).not.toContain(BUG);
  });

  it("under an approved rule it approves alone as the rule's owner, and that approval does not teach it", async () => {
    await past("t_tw_m", ["approved", "approved", "approved", "approved", "approved"]);
    await rule();
    const cs = await held("t_tw_act");
    const r = await twinTick(db, { now: new Date() });
    expect(r.decided).toEqual(["t_tw_act"]);
    const a = (await db.query<{ method: string; client: string; user_id: string; decision: string }>("select method, client, user_id::text as user_id, decision from public.approvals where changeset_id = $1::uuid", [cs])).rows;
    expect(a).toEqual([{ method: "twin", client: "twin", user_id: DEMO_OWNER_ID, decision: "approved" }]);
    expect((await db.query<{ state: string }>("select state from public.tasks where id = 't_tw_act'")).rows[0]?.state).toBe("GATED");
    expect((await pred("t_tw_act"))[0]).toMatchObject({ by_twin: true, actual: null });
    const led = (await db.query<{ payload: { class_key: string; by: string } }>("select payload from public.ledger where task_id = 't_tw_act' and kind = 'twin_decided'")).rows;
    expect(led[0]?.payload).toMatchObject({ class_key: BUG, by: "twin" });
    await held("t_tw_next");
    await twinTick(db, { now: new Date() });
    const before = (await pred("t_tw_next"))[0]?.n ?? 0;
    expect(before).toBe(9); // 3 + 1 + 5 of the owner; the twin's own approval is not one of them
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.approvals where method = 'twin'")).rows[0]?.n).toBe(2);
  });

  it("never alone: a second factor, a level-2 change, a changed policy, a revoked rule or a used-up week", async () => {
    await held("t_tw_no2fa", { twoFactor: true });
    await held("t_tw_lvl", { level: 2 });
    await twinTick(db, { now: new Date() });
    for (const id of ["t_tw_no2fa", "t_tw_lvl"]) expect((await db.query<{ state: string }>("select state from public.tasks where id = $1", [id])).rows[0]?.state).toBe("HELD");
    await rule({ hash: `sha256:${"c".repeat(64)}` });
    await held("t_tw_pol");
    expect((await twinTick(db, { now: new Date() })).decided).toEqual([]);
    await rule({ revoked: true });
    await held("t_tw_rev");
    expect((await twinTick(db, { now: new Date() })).decided).toEqual([]);
    await rule();
    for (let i = 0; i < 3; i++) await held(`t_tw_wk${i}`);
    const r = await twinTick(db, { now: new Date() });
    expect(r.decided.length).toBe(3); // 2 earlier this week + 3 = the budget of 5
    await held("t_tw_over");
    expect((await twinTick(db, { now: new Date() })).decided).toEqual([]);
  });
});
