import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ProfileLayers, demoProfileLayers, profileHash } from "@mandat/contract";
import type { ProfileLayers as Layers } from "@mandat/contract";
import { pgliteDb } from "./pglite-db.test-helper.js";
import { DEMO_ORG_ID, DEMO_REPO_ID, seedMinimal } from "./seed.js";
import { evolveTick } from "./evolve.js";
import type { BenchScore } from "./evolve.js";

// D-650 (Simo 26.11.2026, „за ученето да е автоматично, а не ръчно“): the worker's tick applies a learned proposal by
// itself after the bench gate. A change that can weaken the verdict (a flaky test, an allowed tool) needs the held-out
// set and no false VERIFIED, and rolls itself back when the failures of its task type or a model regression get worse.
// Each apply and roll back is a profile_change row (by: mandat) and a push.
let db: Awaited<ReturnType<typeof pgliteDb>>;
let n = 0;
const T = "tests/cart.test.ts > adds an item";
const ALLOW = "tool_allow|bash:pnpm add *|feature";
const FLAKY = `flaky_test|${T}|bugfix`;
const layers: Layers = (() => {
  const p = ProfileLayers.parse(demoProfileLayers());
  return { ...p, c: p.c.filter((r) => !r.tool.startsWith("path:write:infra")) };
})();
const full = (over: Partial<BenchScore> = {}): BenchScore => ({ pass: 10, total: 10, false_verified: 0, heldout: { pass: 5, total: 5, false_verified: 0 }, ...over });

beforeAll(async () => {
  db = await pgliteDb();
  await seedMinimal(db, { remoteUrl: "file:///tmp/x.git" });
  const p = await db.query<{ id: string }>("insert into public.harness_profiles (org_id, repo_id, version, layers, sources, profile_hash, status, approved_at) values ($1, $2, 1, $3::jsonb, '{}', $4, 'approved', now() - interval '60 days') returning id::text as id", [DEMO_ORG_ID, DEMO_REPO_ID, JSON.stringify(layers), profileHash(layers)]);
  await db.query("update public.repos set profile_id = $2::uuid where id = $1", [DEMO_REPO_ID, p.rows[0]?.id]);
});
afterAll(() => db.end());

const task = async (result: "FAILED" | "VERIFIED", reasons: string[], o: { type?: string; minsAgo?: number } = {}) => {
  const id = `t_al_${++n}`;
  const mins = o.minsAgo ?? 60;
  await db.query("insert into public.tasks (id, org_id, repo_id, type, agent, text, state, created_at) values ($1, $2, $3, $4, 'claude', 'x', 'GATED', now() - make_interval(mins => $5::int))", [id, DEMO_ORG_ID, DEMO_REPO_ID, o.type ?? "bugfix", mins + 5]);
  await db.query("update public.tasks set state = $2, last_result = $4, state_entered_at = now() - make_interval(mins => $3::int) where id = $1", [id, result === "VERIFIED" ? "CLOSED" : "BLOCKED", mins, result]);
  const v = await db.query<{ id: string }>("insert into public.verdicts (org_id, task_id, run_id, attempt, mode, agent, result, reasons, base_sha, verdict_hash, created_at) values ($1, $2, $3, 1, 'full', 'claude', $4, $5::jsonb, $6, 'sha256:x', now() - make_interval(mins => $7::int)) returning id::text as id", [DEMO_ORG_ID, id, `r_${String(n).padStart(26, "0")}`, result, JSON.stringify(reasons), "a".repeat(40), mins]);
  return { id, verdict: v.rows[0]?.id as string };
};
const current = async () => (await db.query<{ version: number; layers: Layers; origin: string | null }>("select h.version, h.layers, h.origin from public.repos r join public.harness_profiles h on h.id = r.profile_id where r.id = $1", [DEMO_REPO_ID])).rows[0];
const trial = async (key: string) => (await db.query<{ status: string; why: string | null }>("select status, why from public.profile_trials where change_key = $1", [key])).rows[0];
const changes = async () => (await db.query<{ payload: { action: string; by: string; source?: string; change_key?: string } }>("select payload from public.ledger where kind = 'profile_change' order by seq")).rows.map((r) => r.payload);
const pushes = async () => (await db.query<{ payload: { kind: string; status: string } }>("select payload from public.outbox where kind = 'web_push' and payload ->> 'kind' = 'profile_learn' order by id")).rows.map((r) => r.payload.status);

describe("a learned change applies itself (D-650)", () => {
  it("a flaky test and five granted asks pass the bench gate and apply, one per tick, without a person", async () => {
    for (let i = 0; i < 2; i++) {
      const t = await task("FAILED", [`D1:regression:${T}`], { minsAgo: 300 + i });
      await db.query("insert into public.failure_labels (org_id, verdict_id, layer, label) values ($1, $2::uuid, 'verification', 'flaky test')", [DEMO_ORG_ID, t.verdict]);
    }
    for (let i = 0; i < 8; i++) await task("VERIFIED", [], { minsAgo: 400 + i });
    for (let i = 0; i < 5; i++) {
      const t = await task("VERIFIED", [], { type: "feature", minsAgo: 300 });
      await db.query("insert into public.tool_asks (org_id, task_id, attempt, tool, status, decided_at) values ($1, $2, 1, 'bash:pnpm add *', 'once', now() - interval '5 hours')", [DEMO_ORG_ID, t.id]);
    }
    const t1 = await evolveTick(db, { now: new Date(), bench: () => Promise.resolve(full()), requireHeldout: true });
    expect(t1.proposed.sort()).toEqual([FLAKY, ALLOW]);
    expect(t1.accepted).toEqual([FLAKY]);
    const t2 = await evolveTick(db, { now: new Date(), bench: () => Promise.resolve(full()), requireHeldout: true });
    expect(t2.accepted).toEqual([ALLOW]);
    const cur = await current();
    expect(cur).toMatchObject({ version: 3, origin: "learn" });
    expect(cur?.layers.a.tests.flaky).toEqual([T]);
    expect(cur?.layers.c.filter((r) => r.tool === "bash:pnpm add *").map((r) => r.decision)).toEqual(["allow"]);
    expect((await changes()).map((p) => [p.action, p.by, p.source, p.change_key])).toEqual([["learn", "mandat", "rule:flaky_repeat", FLAKY], ["learn", "mandat", "rule:ask_repeat", ALLOW]]);
    expect(await pushes()).toEqual(["accepted", "accepted"]);
  });

  it("a weakening change with a false VERIFIED on the bench is not applied", async () => {
    for (let i = 0; i < 5; i++) {
      const t = await task("VERIFIED", [], { type: "feature", minsAgo: 300 });
      await db.query("insert into public.tool_asks (org_id, task_id, attempt, tool, status, decided_at) values ($1, $2, 1, 'bash:pnpm dlx *', 'always', now() - interval '5 hours')", [DEMO_ORG_ID, t.id]);
    }
    const allows = (l: Layers) => l.c.some((r) => r.tool === "bash:pnpm dlx *" && r.decision === "allow");
    const r = await evolveTick(db, { now: new Date(), bench: (l) => Promise.resolve(allows(l) ? full({ false_verified: 1, pass: 10 }) : full({ false_verified: 1 })), requireHeldout: true });
    expect(r.refused).toEqual(["tool_allow|bash:pnpm dlx *|feature"]);
    expect((await trial("tool_allow|bash:pnpm dlx *|feature"))?.why).toMatch(/false VERIFIED/);
    expect((await current())?.version).toBe(3);
  });
});

describe("a weakening change rolls itself back (D-650)", () => {
  it("the failures of its task type get worse after the flaky test → rolled back; the allowed tool stays", async () => {
    await db.query("update public.profile_trials set decided_at = now() - interval '100 minutes' where change_key = $1", [FLAKY]);
    for (const [i, r] of (["FAILED", "FAILED", "FAILED", "VERIFIED", "VERIFIED"] as const).entries()) await task(r, [], { minsAgo: 50 - i });
    const r = await evolveTick(db, { now: new Date() });
    expect(r.rolledBack).toEqual([FLAKY]);
    expect(await trial(FLAKY)).toMatchObject({ status: "rolled_back", why: expect.stringMatching(/failures got worse: 60% .* vs 20%/) });
    const cur = await current();
    expect(cur).toMatchObject({ version: 4, origin: "evolve_rollback" });
    expect(cur?.layers.a.tests.flaky ?? []).toEqual([]);
    expect(cur?.layers.c.some((x) => x.tool === "bash:pnpm add *" && x.decision === "allow")).toBe(true);
    expect((await changes()).at(-1)).toMatchObject({ action: "evolve_rollback", by: "mandat", source: "rule:flaky_repeat", change_key: FLAKY });
    expect(await pushes()).toEqual(["accepted", "accepted", "rolled_back"]);
  });

  it("a model regression card for a week the watch overlaps → the allowed tool is rolled back to what it replaced", async () => {
    await db.query("update public.profile_trials set decided_at = now() - interval '30 minutes' where change_key = $1", [ALLOW]);
    const monday = (() => {
      const d = new Date();
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7))).toISOString().slice(0, 10);
    })();
    const card = { kind: "model_regression", source: "rule:model_regression", model: "claude:default", week: monday, prev_week: monday, share: 0.4, prev_share: 0.9, tasks: 10, prev_tasks: 10 };
    // a card of a model this repo never ran does not count
    await db.query("insert into public.learn_cards (org_id, card_key, card) values ($1, 'x1', $2::jsonb)", [DEMO_ORG_ID, JSON.stringify({ ...card, model: "codex:other" })]);
    expect((await evolveTick(db, { now: new Date() })).rolledBack).toEqual([]);
    await db.query("insert into public.learn_cards (org_id, card_key, card) values ($1, 'x2', $2::jsonb)", [DEMO_ORG_ID, JSON.stringify(card)]);
    const r = await evolveTick(db, { now: new Date() });
    expect(r.rolledBack).toEqual([ALLOW]);
    expect((await trial(ALLOW))?.why).toMatch(/model regression/);
    expect((await current())?.layers.c.some((x) => x.tool === "bash:pnpm add *")).toBe(false);
    expect(await pushes()).toEqual(["accepted", "accepted", "rolled_back", "rolled_back"]);
  });
});
