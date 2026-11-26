import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ProfileLayers, demoProfileLayers, profileHash } from "@mandat/contract";
import type { ProfileLayers as Layers } from "@mandat/contract";
import { DEMO_REPO_ID } from "../../../../worker/src/online/seed";
import { evolveTick } from "../../../../worker/src/online/evolve";
import { decideTrial, learnCards, profileTrials, revertTrial } from "./evolve";
import { devSecondFactor } from "./session";
import { totpAt } from "./totp";
import { TEST_TOTP, U, webDb } from "./web-db.test-helper";

// E9д (spec 5.5, PRD 6.11, AC-11.1 e2e, AC-11.4; D-645): the rules screen shows each proposal with its rule's name; a
// regression card is read by every member. D-650: nothing waits for a person — the bench gate applies a learned change,
// the screen shows it, and a person reverts it with one button (approve.rules; a fresh TOTP when the revert widens).
let db: Awaited<ReturnType<typeof webDb>>;
let org = "";
let n = 0;
const layers: Layers = (() => {
  const p = ProfileLayers.parse(demoProfileLayers());
  return { ...p, c: p.c.filter((r) => !r.tool.startsWith("path:write:infra")) };
})();
const task = async (reasons: string[], o: { type?: string } = {}) => {
  const id = `t_wl_${++n}`;
  await db.query("insert into public.tasks (id, org_id, repo_id, type, agent, text, state) values ($1, $2, $3, $4, 'claude', 'x', 'BLOCKED')", [id, org, DEMO_REPO_ID, o.type ?? "bugfix"]);
  await db.query("insert into public.verdicts (org_id, task_id, run_id, attempt, mode, agent, result, reasons, base_sha, verdict_hash) values ($1, $2, $3, 1, 'full', 'claude', 'FAILED', $4::jsonb, $5, 'sha256:x')", [org, id, `r_${String(n).padStart(26, "0")}`, JSON.stringify(reasons), "a".repeat(40)]);
  return id;
};

beforeAll(async () => {
  db = await webDb();
  org = (await db.query<{ org_id: string }>("select org_id::text as org_id from public.repos where id = $1", [DEMO_REPO_ID])).rows[0]?.org_id ?? "";
  await db.query("update public.harness_profiles set status = 'superseded' where repo_id = $1 and status = 'approved'", [DEMO_REPO_ID]);
  const p = await db.query<{ id: string }>("insert into public.harness_profiles (org_id, repo_id, version, layers, sources, profile_hash, status, approved_at) values ($1, $2, 90, $3::jsonb, '{}', $4, 'approved', now()) returning id::text as id", [org, DEMO_REPO_ID, JSON.stringify(layers), profileHash(layers)]);
  await db.query("update public.repos set profile_id = $2::uuid where id = $1", [DEMO_REPO_ID, p.rows[0]?.id]);
});
afterAll(() => db.end());

describe("the rules screen (AC-11.1 end to end)", () => {
  it("three FAILED D4:out_of_contract:infra/** → the screen shows „protect infra/**“ with origin rule:d4_repeat", async () => {
    for (let i = 0; i < 3; i++) await task(["D4:out_of_contract:infra/**"]);
    await evolveTick(db, { now: new Date() });
    const v = await profileTrials(db, U.viewer, org);
    expect(v[DEMO_REPO_ID]?.map((x) => [x.manifest.change, x.source, x.weakens, x.status])).toEqual([[{ rule: "protect_path", layer: "c", detail: "infra/**" }, "rule:d4_repeat", false, "proposed"]]);
  });
});

describe("a learned change applies itself; a person reverts it (D-650)", () => {
  const full = { pass: 10, total: 10, false_verified: 0, heldout: { pass: 5, total: 5, false_verified: 0 } };
  const ALLOW = "bash:pnpm add *";
  const current = async () => (await db.query<{ version: number; layers: Layers; origin: string | null }>("select h.version, h.layers, h.origin from public.repos r join public.harness_profiles h on h.id = r.profile_id where r.id = $1", [DEMO_REPO_ID])).rows[0];
  const trial = async (source: string) => (await profileTrials(db, U.viewer, org))[DEMO_REPO_ID]?.find((x) => x.source === source);

  it("five granted asks → a proposal nobody approves: the decide API refuses a learned one; the bench gate applies it", async () => {
    for (let i = 0; i < 5; i++) {
      const t = await task([], { type: "feature" });
      await db.query("insert into public.tool_asks (org_id, task_id, attempt, tool, status, decided_at) values ($1, $2, 1, $3, 'once', now())", [org, t, ALLOW]);
    }
    await evolveTick(db, { now: new Date() });
    const p = await trial("rule:ask_repeat");
    expect(p).toMatchObject({ status: "proposed", weakens: true, revertable: false, manifest: { change: { rule: "tool_allow", detail: ALLOW } } });
    const sf = devSecondFactor(db);
    expect((await decideTrial(db, { uid: U.owner, trialId: p?.id as string, body: { accept: true, code: totpAt(TEST_TOTP, Date.now()) }, secondFactor: sf })).body).toEqual({ error: "learned_applies_itself" });
    // one change per tick: the D4 proposal of the first test, then the allow
    expect((await evolveTick(db, { now: new Date(), bench: () => Promise.resolve(full), requireHeldout: true })).accepted).toEqual(["protect_path|infra/**|bugfix"]);
    expect((await evolveTick(db, { now: new Date(), bench: () => Promise.resolve(full), requireHeldout: true })).accepted).toEqual([`tool_allow|${ALLOW}|feature`]);
    expect(await trial("rule:ask_repeat")).toMatchObject({ status: "accepted", weakens: true, revertable: true });
    expect(await trial("rule:d4_repeat")).toMatchObject({ status: "accepted", weakens: false, revertable: true });
    expect((await current())?.layers.c.filter((r) => r.tool === ALLOW).map((r) => r.decision)).toEqual(["allow"]);
  });

  it("„Върни“ on the allowed tool: an approver → 403; the owner, one button and no code (it only narrows) → a new version without it", async () => {
    const id = (await trial("rule:ask_repeat"))?.id as string;
    const sf = devSecondFactor(db);
    const before = await current();
    expect((await revertTrial(db, { uid: U.approver, trialId: id, body: {}, secondFactor: sf })).status).toBe(403);
    expect(await revertTrial(db, { uid: U.owner, trialId: id, body: {}, secondFactor: sf })).toEqual({ status: 200, body: { version: (before?.version ?? 0) + 1 } });
    const cur = await current();
    expect(cur?.origin).toBe("learn_revert");
    expect(cur?.layers.c.some((r) => r.tool === ALLOW)).toBe(false);
    expect(cur?.layers.c.some((r) => r.tool === "path:write:infra/**" && r.decision === "deny")).toBe(true);
    expect(await trial("rule:ask_repeat")).toMatchObject({ status: "rolled_back", revertable: false });
    const led = (await db.query<{ payload: { action: string; by: string; source: string } }>("select payload from public.ledger where kind = 'profile_change' order by seq desc limit 1")).rows[0]?.payload;
    expect(led).toMatchObject({ action: "learn_revert", by: U.owner, source: "rule:ask_repeat" });
    expect((await revertTrial(db, { uid: U.owner, trialId: id, body: {}, secondFactor: sf })).body).toEqual({ error: "not_applied" });
  });

  it("„Върни“ on a narrowing widens again: it needs a fresh code; an unknown trial is 404", async () => {
    const id = (await trial("rule:d4_repeat"))?.id as string;
    const sf = devSecondFactor(db);
    expect((await revertTrial(db, { uid: U.owner, trialId: id, body: {}, secondFactor: sf })).body).toEqual({ error: "second_factor_required" });
    const ok = await revertTrial(db, { uid: U.owner, trialId: id, body: { code: totpAt(TEST_TOTP, Date.now()) }, secondFactor: sf });
    expect(ok.status).toBe(200);
    expect((await current())?.layers.c.some((r) => r.tool === "path:write:infra/**")).toBe(false);
    expect((await revertTrial(db, { uid: U.owner, trialId: "00000000-0000-4000-8000-0000000000ff", body: {}, secondFactor: sf })).status).toBe(404);
  });
});

describe("learnCards", () => {
  it("every member reads the org's open regression cards; one that does not read through the contract is left out", async () => {
    const card = { kind: "model_regression", source: "rule:model_regression", model: "codex:gpt-x", week: "2026-11-16", prev_week: "2026-11-09", share: 0.5, prev_share: 0.9, tasks: 10, prev_tasks: 10 };
    await db.query("insert into public.learn_cards (org_id, card_key, card) values ($1, 'k1', $2::jsonb), ($1, 'k2', '{\"kind\":\"x\"}'::jsonb)", [org, JSON.stringify(card)]);
    expect(await learnCards(db, U.viewer, org)).toEqual([card]);
  });
});
