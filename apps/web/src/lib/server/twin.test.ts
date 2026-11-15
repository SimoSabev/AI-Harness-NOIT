import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEMO_ORG_ID, DEMO_REPO_ID } from "../../../../worker/src/online/seed";
import { localPresence } from "./local-auth";
import { decideTwinRule, twinView } from "./twin";
import { U, webDb } from "./web-db.test-helper";

// D-523 „Двойникът на собственика“ in the web: the card shows what the twin would decide and how often it was right in
// this class; when the class is accurate enough the owner is asked ONCE whether the twin may decide it. Accepting needs
// approve.rules and a second factor; declining or turning it off narrows and needs neither.
let db: Awaited<ReturnType<typeof webDb>>;
beforeEach(async () => (db = await webDb()));
afterEach(async () => db.end());

const K = `${DEMO_REPO_ID}|bugfix|claude|approval`;
const HASH = `sha256:${"a".repeat(64)}`;
const noMfa = () => Promise.resolve(null);
const policy = async () => {
  const p = await db.query<{ id: string }>("insert into public.harness_profiles (org_id, repo_id, version, layers, sources, profile_hash, status, approved_at) values ($1, $2, 99, '{}'::jsonb, '{}', $3, 'approved', now()) returning id::text as id", [DEMO_ORG_ID, DEMO_REPO_ID, HASH]);
  await db.query("update public.repos set profile_id = $2::uuid where id = $1", [DEMO_REPO_ID, p.rows[0]?.id]);
};
let h = 0;
const history = async (right: number, wrong = 0) => {
  for (let j = 0; j < right + wrong; j++) {
    const i = h++;
    await db.query("insert into public.tasks (id, org_id, repo_id, type, agent, text, state) values ($1, $2, $3, 'bugfix', 'claude', 'x', 'CLOSED')", [`t_twh_${i}`, DEMO_ORG_ID, DEMO_REPO_ID]);
    await db.query("insert into public.twin_predictions (org_id, task_id, attempt, class_key, predicted, p, n, actual, decided_at) values ($1, $2, 1, $3, 'approved', 0.9, 9, $4, now())", [DEMO_ORG_ID, `t_twh_${i}`, K, j < right ? "approved" : "rejected"]);
  }
};
const current = () => db.query("insert into public.twin_predictions (org_id, task_id, attempt, class_key, predicted, p, n) values ($1, 't_seed_bugfix', 1, $2, 'approved', 0.92, 12)", [DEMO_ORG_ID, K]);

describe("twinView (D-523)", () => {
  it("none before the twin predicted this attempt", async () => {
    expect(await twinView(db, U.owner, DEMO_ORG_ID, "t_seed_bugfix")).toBeNull();
  });

  it("the prediction, the class score, and the offer once the class is accurate enough", async () => {
    await current();
    await history(5, 1);
    expect(await twinView(db, U.owner, DEMO_ORG_ID, "t_seed_bugfix")).toEqual({ class_key: K, predicted: "approved", p: 0.92, n: 12, scored: 6, correct: 5, offer: false, rule: null, by_twin: false });
    await history(14);
    const v = await twinView(db, U.viewer, DEMO_ORG_ID, "t_seed_bugfix");
    expect(v).toMatchObject({ scored: 20, correct: 19, offer: true }); // 19 of 20: a lower bound just over 0.8
  });
});

describe("decideTwinRule (D-523)", () => {
  it("accepting needs a ready class, the owner's approve.rules, a second factor and an approved policy", async () => {
    await current();
    await history(12);
    expect((await decideTwinRule(db, { uid: U.owner, org: DEMO_ORG_ID, body: { class_key: K, accept: true }, secondFactor: localPresence })).body).toEqual({ error: "no_policy" });
    await policy();
    expect((await decideTwinRule(db, { uid: U.approver, org: DEMO_ORG_ID, body: { class_key: K, accept: true }, secondFactor: localPresence })).status).toBe(403);
    expect((await decideTwinRule(db, { uid: U.owner, org: DEMO_ORG_ID, body: { class_key: K, accept: true }, secondFactor: noMfa })).status).toBe(403);
    const ok = await decideTwinRule(db, { uid: U.owner, org: DEMO_ORG_ID, body: { class_key: K, accept: true }, secondFactor: localPresence });
    expect(ok.status).toBe(200);
    const r = (await db.query<{ policy_hash: string; revoked_at: string | null; weekly_budget: number }>("select policy_hash, revoked_at, weekly_budget from public.twin_rules where class_key = $1", [K])).rows;
    expect(r).toEqual([{ policy_hash: HASH, revoked_at: null, weekly_budget: 5 }]);
    expect((await twinView(db, U.owner, DEMO_ORG_ID, "t_seed_bugfix"))?.rule).toBe("active");
    const led = (await db.query<{ payload: { accepted: boolean; class_key: string } }>("select payload from public.ledger where kind = 'twin_rule'")).rows;
    expect(led[0]?.payload).toMatchObject({ accepted: true, class_key: K });
  });

  it("a class that is not ready cannot be accepted; declining is remembered and the offer is gone", async () => {
    await policy();
    await current();
    await history(4);
    expect((await decideTwinRule(db, { uid: U.owner, org: DEMO_ORG_ID, body: { class_key: K, accept: true }, secondFactor: localPresence })).body).toEqual({ error: "not_ready" });
    await history(16);
    const no = await decideTwinRule(db, { uid: U.approver, org: DEMO_ORG_ID, body: { class_key: K, accept: false }, secondFactor: noMfa });
    expect(no.status).toBe(200);
    expect(await twinView(db, U.owner, DEMO_ORG_ID, "t_seed_bugfix")).toMatchObject({ offer: false, rule: "off" });
  });

  it("a class of another org or a bad key is refused", async () => {
    const other = `00000000-0000-4000-8000-00000000dead|bugfix|claude|approval`;
    expect((await decideTwinRule(db, { uid: U.owner, org: DEMO_ORG_ID, body: { class_key: other, accept: false }, secondFactor: noMfa })).status).toBe(404);
    expect((await decideTwinRule(db, { uid: U.owner, org: DEMO_ORG_ID, body: { class_key: "x", accept: false }, secondFactor: noMfa })).status).toBe(400);
  });
});
