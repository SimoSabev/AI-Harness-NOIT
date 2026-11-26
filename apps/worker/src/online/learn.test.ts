import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ProfileLayers, demoProfileLayers, profileHash } from "@mandat/contract";
import type { ProfileLayers as Layers } from "@mandat/contract";
import { selectChannel } from "@mandat/channels";
import type { ChannelState } from "@mandat/channels";
import { learnedQuality } from "@mandat/learn";
import { pgliteDb } from "./pglite-db.test-helper.js";
import { DEMO_ORG_ID, DEMO_REPO_ID, seedMinimal } from "./seed.js";
import { evolveTick } from "./evolve.js";
import { abTable, channelQualityOf, forecastFor, learnCardsTick } from "./learn.js";

// E9д (spec 5.5, PRD 6.11, D-644): the worker's side of learning — rules from the ledger's failures and asks become
// proposals with their rule's name (AC-11.1 end to end), the learned Q of a channel moves the choice under mode auto
// (AC-11.2), the cost forecast, the A/B table and the regression cards.
let db: Awaited<ReturnType<typeof pgliteDb>>;
let n = 0;
/** the demo profile without its deny on infra/**, so a recurring D4 there has something to propose */
const layers: Layers = (() => {
  const p = ProfileLayers.parse(demoProfileLayers());
  return { ...p, c: p.c.filter((r) => !r.tool.startsWith("path:write:infra")) };
})();

beforeAll(async () => {
  db = await pgliteDb();
  await seedMinimal(db, { remoteUrl: "file:///tmp/x.git" });
  const p = await db.query<{ id: string }>("insert into public.harness_profiles (org_id, repo_id, version, layers, sources, profile_hash, status, approved_at) values ($1, $2, 1, $3::jsonb, '{}', $4, 'approved', now() - interval '60 days') returning id::text as id", [DEMO_ORG_ID, DEMO_REPO_ID, JSON.stringify(layers), profileHash(layers)]);
  await db.query("update public.repos set profile_id = $2::uuid where id = $1", [DEMO_REPO_ID, p.rows[0]?.id]);
});
afterAll(() => db.end());

/** a finished task with a verdict; returns its id and the verdict's id */
const task = async (result: "FAILED" | "UNKNOWN" | "VERIFIED", reasons: string[], o: { type?: string; minsAgo?: number; agent?: string; model?: string; usd?: number; channel?: string; attempt?: number } = {}) => {
  const id = `t_ln_${++n}`;
  const mins = o.minsAgo ?? 60;
  await db.query("insert into public.tasks (id, org_id, repo_id, type, agent, text, state, model, usd, channel_id, attempt, created_at) values ($1, $2, $3, $4, $5, 'x', 'GATED', $6, $7, $8::uuid, $9, now() - make_interval(mins => $10::int))", [id, DEMO_ORG_ID, DEMO_REPO_ID, o.type ?? "bugfix", o.agent ?? "claude", o.model ?? null, o.usd ?? 0, o.channel ?? null, o.attempt ?? 1, mins + 5]);
  await db.query("update public.tasks set state = $2, last_result = $4, state_entered_at = now() - make_interval(mins => $3::int) where id = $1", [id, result === "VERIFIED" ? "CLOSED" : "BLOCKED", mins, result]);
  const v = await db.query<{ id: string }>("insert into public.verdicts (org_id, task_id, run_id, attempt, mode, agent, result, reasons, base_sha, verdict_hash, created_at) values ($1, $2, $3, 1, 'full', 'claude', $4, $5::jsonb, $6, 'sha256:x', now() - make_interval(mins => $7::int)) returning id::text as id", [DEMO_ORG_ID, id, `r_${String(n).padStart(26, "0")}`, result, JSON.stringify(reasons), "a".repeat(40), mins]);
  return { id, verdict: v.rows[0]?.id as string };
};
const trials = async () => (await db.query<{ change_key: string; status: string; source: string | null; needs_person: boolean }>("select change_key, status, source, needs_person from public.profile_trials order by created_at, change_key")).rows;

describe("rules from failures, end to end (AC-11.1)", () => {
  it("three FAILED D4:out_of_contract:infra/** in 30 days → a proposal to protect infra/**, origin rule:d4_repeat", async () => {
    for (const d of [1, 10, 20]) await task("FAILED", ["D4:out_of_contract:infra/**"], { minsAgo: d * 1440 });
    const tick = await evolveTick(db, { now: new Date() });
    expect(tick.proposed).toEqual(["protect_path|infra/**|bugfix"]);
    expect(await trials()).toEqual([{ change_key: "protect_path|infra/**|bugfix", status: "proposed", source: "rule:d4_repeat", needs_person: false }]);
    const m = (await db.query<{ manifest: { change: unknown; source: string } }>("select manifest from public.profile_trials")).rows[0]?.manifest;
    expect(m).toMatchObject({ change: { rule: "protect_path", layer: "c", detail: "infra/**" }, source: "rule:d4_repeat" });
  });

  it("a flaky test (two labelled failures) and five granted asks → proposals that only a person may accept", async () => {
    const T = "tests/cart.test.ts > adds an item";
    for (let i = 0; i < 2; i++) {
      const t = await task("FAILED", [`D1:regression:${T}`]);
      await db.query("insert into public.failure_labels (org_id, verdict_id, layer, label) values ($1, $2::uuid, 'verification', 'flaky test')", [DEMO_ORG_ID, t.verdict]);
    }
    for (let i = 0; i < 5; i++) {
      const t = await task("VERIFIED", [], { type: "feature" });
      await db.query("insert into public.tool_asks (org_id, task_id, attempt, tool, status, decided_at) values ($1, $2, 1, 'bash:pnpm add *', 'once', now())", [DEMO_ORG_ID, t.id]);
    }
    let benched = 0;
    const tick = await evolveTick(db, { now: new Date(), bench: async () => { benched++; return { pass: 10, total: 10, false_verified: 0 }; } });
    expect(tick.proposed.sort()).toEqual([`flaky_test|${T}|bugfix`, "tool_allow|bash:pnpm add *|feature"]);
    const rows = (await trials()).filter((t) => t.needs_person);
    expect(rows.map((t) => [t.source, t.status])).toEqual([["rule:flaky_repeat", "proposed"], ["rule:ask_repeat", "proposed"]].sort((a, b) => (String(a[0]) < String(b[0]) ? 1 : -1)));
    // the bench only ran for the D-530 proposal; nothing a person must decide was accepted by Mandat
    expect(benched).toBe(2);
    expect(tick.accepted).toEqual(["protect_path|infra/**|bugfix"]);
  });
});

describe("channel quality (AC-11.2)", () => {
  const A = "d0000000-0000-4000-8000-0000000000a1";
  const B = "d0000000-0000-4000-8000-0000000000b1";
  const state = (id: string, label: string, quality: number): ChannelState => ({ id, label, provider: "anthropic", kind: "api_key", model: "m", enabled: true, health: "ok", budget_usd_day: null, spent_today_usd: 0, quality, cost: 0.5, used_today: 0, cooldown_until: null, limit_resets_at: null });
  const outcome = async (channel: string, good: boolean) => {
    const t = await task(good ? "VERIFIED" : "FAILED", [], { type: "docs", channel });
    const c = await db.query<{ id: string }>("insert into public.changesets (org_id, task_id, base_sha, status) values ($1, $2, $3, 'MERGED') returning id::text as id", [DEMO_ORG_ID, t.id, "b".repeat(40)]);
    await db.query("insert into public.outcomes (org_id, changeset_id, result, window_minutes) values ($1, $2::uuid, $3, 0)", [DEMO_ORG_ID, c.rows[0]?.id, good ? "success" : "failure"]);
  };

  it("after 10 OUTCOMEs the learned Q replaces the static one and the auto choice moves to the other channel", async () => {
    await db.query("insert into public.model_channels (id, org_id, label, provider, kind, model, quality, cost) values ($1, $3, 'a', 'anthropic', 'api_key', 'm', 0.9, 0.5), ($2, $3, 'b', 'anthropic', 'api_key', 'm', 0.8, 0.5)", [A, B, DEMO_ORG_ID]);
    const chans = [state(A, "a", 0.9), state(B, "b", 0.8)];
    const pick = async () => {
      const q = await channelQualityOf(db, DEMO_ORG_ID, new Date());
      const s = selectChannel(learnedQuality(chans, q, "docs"), { estCostUsd: 0.1, rule: { mode: "auto", channel_id: null, fallback_ids: [] }, now: new Date() });
      return s.ok ? s.channel.label : null;
    };
    for (let i = 0; i < 9; i++) await outcome(A, false);
    expect(await pick()).toBe("a"); // nine outcomes: the static Q still stands
    await outcome(A, false);
    expect((await channelQualityOf(db, DEMO_ORG_ID, new Date())).get(`${A}|docs`)).toEqual({ q: 0, n: 10 });
    expect(await pick()).toBe("b");
  });
});

describe("cost forecast, A/B, regression cards (PRD 6.11 т. 4–6)", () => {
  it("the forecast is the median of the last 10 paid tasks of (repo, type, agent); the budget is twice that", async () => {
    for (const usd of [0.2, 0.4, 0.6]) await task("VERIFIED", [], { type: "css", agent: "codex", usd });
    expect(await forecastFor(db, { repo_id: DEMO_REPO_ID, task_type: "css", agent: "codex" })).toEqual({ forecast_usd: 0.4, budget_usd: 0.8, n: 3 });
    expect(await forecastFor(db, { repo_id: DEMO_REPO_ID, task_type: "css", agent: "claude" })).toBeNull();
  });

  it("the A/B table: the current version against its parent, each task under the version approved when it was created", async () => {
    await task("VERIFIED", [], { minsAgo: -6 }); // created after version 2 (the accepted infra/** change) was approved
    const t = await abTable(db, DEMO_REPO_ID);
    expect(t?.task_types).toEqual(["bugfix"]);
    expect(t?.a).toMatchObject({ version: 1, verified_share: 0 });
    expect(t?.b).toEqual({ version: 2, tasks: 1, verified_share: 1, avg_rounds: 1, avg_usd: 0 });
  });

  it("a model whose VERIFIED share fell > 20% week on week → one card; a second tick adds nothing", async () => {
    const now = new Date();
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7)));
    const minsAgo = (daysBeforeMonday: number) => Math.round((now.getTime() - monday.getTime()) / 60_000) + daysBeforeMonday * 1440 - 60;
    for (let i = 0; i < 10; i++) await task(i < 9 ? "VERIFIED" : "FAILED", [], { agent: "codex", model: "gpt-x", minsAgo: minsAgo(10) });
    for (let i = 0; i < 10; i++) await task(i < 5 ? "VERIFIED" : "FAILED", [], { agent: "codex", model: "gpt-x", minsAgo: minsAgo(3) });
    const keys = await learnCardsTick(db, now);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^model_regression\|codex:gpt-x\|\d{4}-\d{2}-\d{2}$/);
    const card = (await db.query<{ card: { share: number; prev_share: number } }>("select card from public.learn_cards")).rows[0]?.card;
    expect(card).toMatchObject({ share: 0.5, prev_share: 0.9 });
    expect(await learnCardsTick(db, now)).toEqual([]);
  });
});
