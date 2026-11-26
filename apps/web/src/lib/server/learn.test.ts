import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ProfileLayers, demoProfileLayers, profileHash } from "@mandat/contract";
import type { ProfileLayers as Layers } from "@mandat/contract";
import { DEMO_REPO_ID } from "../../../../worker/src/online/seed";
import { evolveTick } from "../../../../worker/src/online/evolve";
import { decideTrial, learnCards, profileTrials } from "./evolve";
import { devSecondFactor } from "./session";
import { totpAt } from "./totp";
import { TEST_TOTP, U, webDb } from "./web-db.test-helper";

// E9д (spec 5.5, PRD 6.11, AC-11.1 e2e, AC-11.4; D-645): the rules screen shows each proposal with its rule's name; a
// person decides the ones that wait for a person (approve.rules, and a fresh TOTP to approve); each decision is a
// config_change row; a regression card is read by every member.
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
    expect(v[DEMO_REPO_ID]?.map((x) => [x.manifest.change, x.source, x.needs_person, x.status])).toEqual([[{ rule: "protect_path", layer: "c", detail: "infra/**" }, "rule:d4_repeat", false, "proposed"]]);
  });
});

describe("decideTrial (AC-11.4)", () => {
  const proposal = async () => {
    for (let i = 0; i < 5; i++) {
      const t = await task([], { type: "feature" });
      await db.query("insert into public.tool_asks (org_id, task_id, attempt, tool, status, decided_at) values ($1, $2, 1, 'bash:pnpm add *', 'once', now())", [org, t]);
    }
    await evolveTick(db, { now: new Date() });
    return (await profileTrials(db, U.viewer, org))[DEMO_REPO_ID]?.find((x) => x.source === "rule:ask_repeat");
  };

  it("a proposal that waits for a person: approver → 403; approve without a code → second factor; with it → a new version", async () => {
    const p = await proposal();
    expect(p).toMatchObject({ needs_person: true, status: "proposed", manifest: { change: { rule: "tool_allow", detail: "bash:pnpm add *" } } });
    const id = p?.id as string;
    const sf = devSecondFactor(db);
    expect((await decideTrial(db, { uid: U.approver, trialId: id, body: { accept: true, code: totpAt(TEST_TOTP, Date.now()) }, secondFactor: sf })).status).toBe(403);
    expect((await decideTrial(db, { uid: U.owner, trialId: id, body: { accept: true }, secondFactor: sf })).body).toEqual({ error: "second_factor_required" });
    const ok = await decideTrial(db, { uid: U.owner, trialId: id, body: { accept: true, code: totpAt(TEST_TOTP, Date.now()) }, secondFactor: sf });
    expect(ok).toEqual({ status: 200, body: { version: 91 } });
    const cur = (await db.query<{ layers: Layers; origin: string }>("select h.layers, h.origin from public.repos r join public.harness_profiles h on h.id = r.profile_id where r.id = $1", [DEMO_REPO_ID])).rows[0];
    expect(cur?.origin).toBe("learn");
    expect(cur?.layers.c.filter((r) => r.tool === "bash:pnpm add *").map((r) => r.decision)).toEqual(["allow"]);
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.ledger where kind = 'config_change' and payload ->> 'source' = 'rule:ask_repeat'")).rows[0]?.n).toBe(1);
    expect((await decideTrial(db, { uid: U.owner, trialId: id, body: { accept: false }, secondFactor: sf })).body).toEqual({ error: "not_open" });
  });

  it("a refusal needs no code and makes no version; an unknown proposal is 404", async () => {
    const sf = devSecondFactor(db);
    const d4 = (await profileTrials(db, U.viewer, org))[DEMO_REPO_ID]?.find((x) => x.source === "rule:d4_repeat");
    expect(await decideTrial(db, { uid: U.owner, trialId: d4?.id as string, body: { accept: false }, secondFactor: sf })).toEqual({ status: 200, body: { version: 0 } });
    expect((await profileTrials(db, U.viewer, org))[DEMO_REPO_ID]?.find((x) => x.id === d4?.id)?.status).toBe("refused");
    expect((await decideTrial(db, { uid: U.owner, trialId: "00000000-0000-4000-8000-0000000000ff", body: { accept: false }, secondFactor: sf })).status).toBe(404);
  });
});

describe("learnCards", () => {
  it("every member reads the org's open regression cards; one that does not read through the contract is left out", async () => {
    const card = { kind: "model_regression", source: "rule:model_regression", model: "codex:gpt-x", week: "2026-11-16", prev_week: "2026-11-09", share: 0.5, prev_share: 0.9, tasks: 10, prev_tasks: 10 };
    await db.query("insert into public.learn_cards (org_id, card_key, card) values ($1, 'k1', $2::jsonb), ($1, 'k2', '{\"kind\":\"x\"}'::jsonb)", [org, JSON.stringify(card)]);
    expect(await learnCards(db, U.viewer, org)).toEqual([card]);
  });
});
