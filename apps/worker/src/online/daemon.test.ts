import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Verdict, sha256Tag } from "@mandat/contract";
import { readLedgerOnline, verifyOnlineRows } from "@mandat/ledger";
import { fakeGitHub } from "@mandat/gate-github";
import { addMemory, loadMemory } from "@mandat/memory";
import { buildFixture } from "../fixtures.js";
import { repoRoot } from "../testing.js";
import { DEMO_CHANNELS, DEMO_ORG_ID, DEMO_OWNER_ID, DEMO_REPO_ID, seedChannels, seedMinimal } from "./seed.js";
import { contractForTask, runDaemonOnce } from "./daemon.js";
import type { DaemonDeps } from "./daemon.js";
import { pgliteDb } from "./pglite-db.test-helper.js";
import type { RunTaskInput } from "../run.js";

const verdict = (result: "VERIFIED" | "FAILED" | "UNKNOWN", base: string) =>
  Verdict.parse({
    run_id: "r_01JABCDEFGHJKMNPQRSTVWXYZ0", task_id: "t_web_1", attempt: 1, agent: "fake:honest-fix", result, reasons: result === "FAILED" ? ["D2:missing_test:tests/cart.spec.ts > cart > applies 10% over 50"] : [],
    evidence: [{ detector: "D1.base_tests", phase: 1, status: "pass", summary: "20/20", data: {}, source: "sandbox:verify", agent_visible: true }],
    contract_hash: `sha256:${"a".repeat(64)}`, base_sha: base, tree_sha: "b".repeat(40), diff_hash: `sha256:${"c".repeat(64)}`, integrity: "ok",
    usage: { usd: 0.12, input_tokens: 1, output_tokens: 1, requests: 1 }, timings_ms: { provision: 0, install: 0, agent: 0, export: 0, verify: 0, verdict: 0, total: 0 }, created_at: "2026-10-20T00:00:00.000Z",
  });

async function setup(level: number, result: "VERIFIED" | "FAILED" | "UNKNOWN" = "VERIFIED", patchOf?: (mirror: string) => Buffer) {
  const home = mkdtempSync(path.join(os.tmpdir(), "mandat-daemon-"));
  const fx = buildFixture({ repoRoot, mandatHome: home, force: false, name: "demo-shop" });
  const db = await pgliteDb();
  await seedMinimal(db, { remoteUrl: `file://${fx.mirror}` });
  await db.query("update public.repos set ruleset_strict = true where id = $1", [DEMO_REPO_ID]);
  if (level > 0) await db.query("insert into public.ladder_state (org_id, repo_id, task_type, agent, level) values ($1, $2, 'bugfix', 'fake:honest-fix', $3)", [DEMO_ORG_ID, DEMO_REPO_ID, level]);
  await db.query("insert into public.tasks (id, org_id, repo_id, type, agent, text) values ('t_web_1', $1, $2, 'bugfix', 'fake:honest-fix', 'Fix the discount')", [DEMO_ORG_ID, DEMO_REPO_ID]);
  const gh = fakeGitHub({ repos: { "mandat-demo/shop": {} } });
  const patch = patchOf ? patchOf(fx.mirror) : Buffer.from("diff --git a/src/cart.ts b/src/cart.ts\n");
  const events: { topic: string; payload: Record<string, unknown> }[] = [];
  const runs: RunTaskInput[] = [];
  const deps: DaemonDeps = {
    db, home, gh, ghRepo: "mandat-demo/shop",
    broadcast: (topic, _e, payload) => Promise.resolve(void events.push({ topic, payload })),
    run: (i) => {
      runs.push(i);
      const runDir = path.join(home, "runs", "r1");
      mkdirSync(path.join(runDir, "export"), { recursive: true });
      writeFileSync(path.join(runDir, "export", "diff.patch"), patch);
      return Promise.resolve({ verdict: verdict(result, fx.sha), exit: 0, runDir, ledger: { from: 1, to: 3 }, agentExit: 0 });
    },
  };
  return { db, deps, events, runs, gh, fx };
}

describe("daemon (MANDAT_MODE=worker, D-275)", () => {
  it("ниво 0 → клон, HELD „approval“; присъда, evidence, changeset и дневник в базата; broadcast на board и task", async () => {
    const s = await setup(0);
    expect(await runDaemonOnce(s.deps)).toBe("t_web_1");
    const t = (await s.db.query<{ state: string; wait_reason: string; last_result: string; effective_level: number; seq: string }>("select state, wait_reason, last_result, effective_level, seq from public.tasks where id = 't_web_1'")).rows[0];
    expect(t).toMatchObject({ state: "HELD", wait_reason: "approval", last_result: "VERIFIED", effective_level: 0 });
    expect(s.runs[0]).toMatchObject({ agent: "fake:honest-fix", mirror: "demo-shop" });
    expect((await s.db.query("select 1 from public.evidence")).rows).toHaveLength(1);
    const cs = (await s.db.query<{ head_sha: string; approval_needed: boolean }>("select head_sha, approval_needed from public.changesets")).rows[0];
    expect(cs?.approval_needed).toBe(true);
    expect(cs?.head_sha).toMatch(/^[0-9a-f]{40}$/);
    expect((await s.db.query<{ diff: string }>("select diff from public.changeset_diffs")).rows[0]?.diff).toContain("src/cart.ts");
    expect(s.gh.state.calls.some((c) => c.startsWith("createRef") && c.includes("mandat/t_web_1-a1"))).toBe(true);
    expect((await s.db.query<{ kind: string; ref: string }>("select kind, ref from public.deliveries")).rows).toEqual([{ kind: "branch_only", ref: "mandat/t_web_1-a1" }]);
    const rows = await readLedgerOnline(s.db, DEMO_ORG_ID);
    expect(rows.map((r) => r.kind)).toEqual(["demo_reset", "task_created", "verdict", "gated"]);
    expect(verifyOnlineRows(rows, DEMO_ORG_ID).ok).toBe(true);
    expect(s.events.map((e) => e.topic)).toContain(`org:${DEMO_ORG_ID}:board`);
    expect(s.events.map((e) => e.topic)).toContain("task:t_web_1");
    for (const e of s.events) expect(JSON.stringify(e.payload).length).toBeLessThanOrEqual(1024);
    expect(await runDaemonOnce(s.deps)).toBe(null);
  });
  it("D-392: паметта на човека влиза в договора (memory_hash = sha256 на блока), в дневника и в memory_usage; MEMORY: от бележките на агента чака одобрение", async () => {
    const s = await setup(0);
    await s.db.query("update public.tasks set created_by = $1, text = $2 where id = 't_web_1'", [DEMO_OWNER_ID, "Fix the discount in the cart\nзапомни: отговаряй на български"]);
    await addMemory(s.db, { org: DEMO_ORG_ID, user: DEMO_OWNER_ID, note: { text: "The cart discount code is SAVE10", kind: "fact", scope: "project", basis: "user_said", repo_id: DEMO_REPO_ID }, source: "human", actor: `human:${DEMO_OWNER_ID}` });
    const run = s.deps.run;
    s.deps.run = async (i) => {
      const o = await (run as NonNullable<typeof run>)(i);
      writeFileSync(path.join(o.runDir ?? "", "notes.txt"), "done\nMEMORY: The cart tests live in tests/cart.spec.ts\n");
      return o;
    };
    await runDaemonOnce(s.deps);
    const block = s.runs[0]?.memoryBlock ?? "";
    expect(block).toContain("About the person:\n- отговаряй на български\n");
    expect(block).toContain("The cart discount code is SAVE10");
    const c = JSON.parse(readFileSync(s.runs[0]?.contractPath ?? "", "utf8")) as { memory_hash: string };
    expect(c.memory_hash).toBe(sha256Tag(block));
    const rows = await readLedgerOnline(s.db, DEMO_ORG_ID);
    expect(rows.map((r) => r.kind)).toEqual(["demo_reset", "task_created", "memory_snapshot", "verdict", "gated"]);
    expect(verifyOnlineRows(rows, DEMO_ORG_ID).ok).toBe(true);
    expect((await s.db.query<{ block_hash: string }>("select block_hash from public.memory_usage where task_id = 't_web_1'")).rows).toEqual([{ block_hash: c.memory_hash }]);
    expect((await loadMemory(s.db, { org: DEMO_ORG_ID, user: DEMO_OWNER_ID, statuses: ["pending"] })).map((m) => [m.text, m.source])).toEqual([["The cart tests live in tests/cart.spec.ts", "agent_sandbox"]]);
  });
  it("ниво 2 → PR, approval check, сливане на fakeGitHub → OUTCOME (прозорец 0 мин) → стълбата расте → CLOSED", async () => {
    const s = await setup(2);
    await s.db.query("update public.ladder_state set s_up = 4.95 where agent = 'fake:honest-fix'");
    await runDaemonOnce(s.deps);
    const t = (await s.db.query<{ state: string; outcome_decided: boolean; effective_level: number }>("select state, outcome_decided, effective_level from public.tasks where id = 't_web_1'")).rows[0];
    expect(t).toMatchObject({ state: "CLOSED", outcome_decided: true, effective_level: 3 });
    expect(s.gh.state.calls.some((c) => c.startsWith("merge"))).toBe(true);
    const lad = (await s.db.query<{ level: number }>("select level from public.ladder_state where agent = 'fake:honest-fix'")).rows[0];
    expect(lad?.level).toBe(3);
    const kinds = (await readLedgerOnline(s.db, DEMO_ORG_ID)).map((r) => r.kind);
    expect(kinds).toEqual(expect.arrayContaining(["delivered", "outcome", "ladder_change"]));
    expect((await s.db.query("select 1 from public.ladder_events")).rows).toHaveLength(1);
  });
  it("drift (E3б): твърдо поле спрямо одобрения харнес → BLOCKED harness_stale; меко → маркер и продължава", async () => {
    const { readFileSync } = await import("node:fs");
    const yml = readFileSync(path.join(repoRoot, "fixtures/demo-shop/.mandat.yml"), "utf8");
    const { sha256Tag } = await import("@mandat/contract");
    const approve = async (s: Awaited<ReturnType<typeof setup>>, text: string) => {
      await s.db.query("update public.repos set config_hash = $2, config_version = 1 where id = $1", [DEMO_REPO_ID, sha256Tag(text)]);
      await s.db.query("insert into public.harness_proposals (org_id, repo_id, status, policy_yaml, yaml_sha256, approved_at) values ($1, $2, 'approved', $3, $4, now())", [DEMO_ORG_ID, DEMO_REPO_ID, text, sha256Tag(text)]);
    };
    const hard = await setup(0);
    await approve(hard, yml.replace("--outputFile=$MANDAT_REPORT", "--outputFile=$MANDAT_REPORT --bail=1"));
    await runDaemonOnce(hard.deps);
    expect((await hard.db.query<{ state: string; wait_reason: string }>("select state, wait_reason from public.tasks where id = 't_web_1'")).rows[0]).toEqual({ state: "BLOCKED", wait_reason: "harness_stale" });
    expect((await hard.db.query<{ harness_stale: boolean }>("select harness_stale from public.repos")).rows[0]?.harness_stale).toBe(true);
    expect(hard.runs).toHaveLength(0);
    const soft = await setup(0);
    await approve(soft, yml.replace("task_usd: 2", "task_usd: 3"));
    await runDaemonOnce(soft.deps);
    expect((await soft.db.query<{ state: string }>("select state from public.tasks where id = 't_web_1'")).rows[0]?.state).toBe("HELD");
    expect((await soft.db.query<{ text: string }>("select text from public.task_activities where kind = 'harness_drift'")).rows[0]?.text).toContain("budgets.task_usd");
  }, 30_000);
  it("spill (E3в): 429 на anthropic-key-demo (2 ч) → openai-key-demo · fake-codex · опит 2 · VERIFIED · ниво 0 → клон …-a2", async () => {
    const s = await setup(0);
    await seedChannels(s.db);
    await s.db.query("update public.tasks set agent = 'fake:limit-429' where id = 't_web_1'");
    const agents: string[] = [];
    s.deps.run = (i) => {
      agents.push(i.agent);
      s.runs.push(i);
      const first = agents.length === 1;
      return Promise.resolve(first
        ? { verdict: verdict("UNKNOWN", s.fx.sha), exit: 10, runDir: null, ledger: null, agentExit: 1, limit: { retry_after_s: 7200, resets_at: "2026-10-20T14:00:00.000Z", at: "2026-10-20T12:00:00.000Z" } }
        : { verdict: verdict("VERIFIED", s.fx.sha), exit: 0, runDir: null, ledger: { from: 1, to: 3 }, agentExit: 0 });
    };
    await runDaemonOnce(s.deps);
    expect(agents).toEqual(["fake:limit-429", "fake-codex:honest-fix"]);
    const t = (await s.db.query<{ state: string; attempt: number; agent: string; retry_reason: string; spills: number; channel_id: string; effective_level: number }>("select state, attempt, agent, retry_reason, spills, channel_id::text as channel_id, effective_level from public.tasks where id = 't_web_1'")).rows[0];
    expect(t).toMatchObject({ state: "HELD", attempt: 2, agent: "fake-codex:honest-fix", retry_reason: "channel", spills: 1, channel_id: DEMO_CHANNELS.openai, effective_level: 0 });
    const kinds = (await readLedgerOnline(s.db, DEMO_ORG_ID)).map((r) => r.kind);
    expect(kinds).toEqual(expect.arrayContaining(["channel_limit", "channel_spill", "verdict"]));
    const spill = JSON.parse((await readLedgerOnline(s.db, DEMO_ORG_ID)).find((r) => r.kind === "channel_spill")?.payload_jcs ?? "{}") as Record<string, unknown>;
    expect(spill).toMatchObject({ from: "anthropic-key-demo", to: "openai-key-demo", agent_from: "fake:limit-429", agent_to: "fake-codex:honest-fix", attempt: 2 });
    expect(s.gh.state.calls.some((c) => c.startsWith("createRef") && c.includes("mandat/t_web_1-a2"))).toBe(true);
    const ch = (await s.db.query<{ health: string; limit_resets_at: string }>("select health, to_char(limit_resets_at at time zone 'UTC', 'HH24:MI') as limit_resets_at from public.model_channels where id = $1", [DEMO_CHANNELS.anthropic])).rows[0];
    expect(ch).toEqual({ health: "limited", limit_resets_at: "14:00" });
    expect((await s.db.query("select 1 from public.channel_usage")).rows).toHaveLength(2);
    const c2 = JSON.parse((await import("node:fs")).readFileSync(path.join(s.deps.home, "contracts", "t_web_1-a2.json"), "utf8")) as { channel: { label: string }; agent: string };
    expect([c2.channel.label, c2.agent]).toEqual(["openai-key-demo", "codex"]);
  });
  it("лимит: retry-after 30 s → изчакване и повтор на същия канал; второ преливане → HELD channel_limit", async () => {
    const s = await setup(0);
    await seedChannels(s.db);
    const slept: number[] = [];
    s.deps.sleep = (ms) => (slept.push(ms), Promise.resolve());
    let n = 0;
    s.deps.run = () => {
      n++;
      const lim = n === 1 ? { retry_after_s: 30, resets_at: null, at: "x" } : { retry_after_s: 7200, resets_at: null, at: "x" };
      return Promise.resolve({ verdict: verdict("UNKNOWN", s.fx.sha), exit: 10, runDir: null, ledger: null, agentExit: 1, limit: lim });
    };
    await runDaemonOnce(s.deps);
    expect(slept).toEqual([30_000]);
    expect(n).toBe(3); // wait → same channel; 2 h → spill; 2 h again → HELD (at most one spill)
    expect((await s.db.query<{ state: string; wait_reason: string }>("select state, wait_reason from public.tasks where id = 't_web_1'")).rows[0]).toEqual({ state: "HELD", wait_reason: "channel_limit" });
  });
  it("D-288: празна промяна (EXPORT 0 файла) с VERIFIED → HELD empty_change, без доставка и без стълба", async () => {
    const s = await setup(2);
    s.deps.run = () => {
      const v = verdict("VERIFIED", s.fx.sha);
      v.evidence.unshift({ detector: "EXPORT", phase: 1, status: "pass", summary: "0 file(s) changed", data: {}, source: "export", agent_visible: true });
      return Promise.resolve({ verdict: v, exit: 0, runDir: null, ledger: null, agentExit: 0 });
    };
    await runDaemonOnce(s.deps);
    expect((await s.db.query<{ state: string; wait_reason: string }>("select state, wait_reason from public.tasks where id = 't_web_1'")).rows[0]).toEqual({ state: "HELD", wait_reason: "empty_change" });
    expect(s.gh.state.calls.filter((c) => /^(createRef|createPull|merge)/.test(c))).toEqual([]);
    expect((await s.db.query("select 1 from public.ladder_events")).rows).toHaveLength(0);
  });
  it("E9б (D12): the before/after screenshots named by D12 go to changeset_shots with the verdict; nothing outside runs/<id>/ui", async () => {
    const s = await setup(0, "UNKNOWN");
    const run = s.deps.run as NonNullable<DaemonDeps["run"]>;
    s.deps.run = async (i) => {
      const r = await run(i);
      const ui = path.join(r.runDir ?? "", "ui");
      mkdirSync(ui, { recursive: true });
      writeFileSync(path.join(ui, "route-0.png"), "AFTER");
      writeFileSync(path.join(ui, "base-route-0.png"), "BEFORE");
      writeFileSync(path.join(r.runDir ?? "", "secret.png"), "NO");
      const d12: Verdict["evidence"][number] = { detector: "D12.ui", phase: 1, status: "unknown", summary: "1 route(s) look different from base", source: "sandbox:verify", agent_visible: true, signature: "D12:visual_diff:/",
        data: { routes: [{ route: "/", screenshot: "ui/route-0.png", base_screenshot: "ui/base-route-0.png", visual_diff: 0.2 }, { route: "/x", screenshot: "../secret.png", base_screenshot: null }] } };
      return { ...r, verdict: r.verdict ? { ...r.verdict, evidence: [...r.verdict.evidence, d12] } : r.verdict };
    };
    expect(await runDaemonOnce(s.deps)).toBe("t_web_1");
    const shots = (await s.db.query<{ name: string; png: Uint8Array }>("select name, png from public.changeset_shots order by name")).rows;
    expect(shots.map((x) => [x.name, Buffer.from(x.png).toString()])).toEqual([["base-route-0.png", "BEFORE"], ["route-0.png", "AFTER"]]);
  }, 30_000);
  it("промяна над 1 MB: редът в changeset_diffs остава с размера (omitted_bytes), без текста — задачата не изчезва от прегледа", async () => {
    const big = Buffer.from(`diff --git a/src/cart.ts b/src/cart.ts\n@@ -1 +1 @@\n${"+x\n".repeat(400_000)}`);
    const s = await setup(0, "VERIFIED", () => big);
    expect(await runDaemonOnce(s.deps)).toBe("t_web_1");
    expect((await s.db.query<{ diff: string; omitted_bytes: number }>("select diff, omitted_bytes::int as omitted_bytes from public.changeset_diffs")).rows).toEqual([{ diff: "", omitted_bytes: big.length }]);
  });
  it("FAILED → BLOCKED „failed“ без доставка", async () => {
    const s = await setup(2, "FAILED");
    await runDaemonOnce(s.deps);
    const t = (await s.db.query<{ state: string; wait_reason: string }>("select state, wait_reason from public.tasks where id = 't_web_1'")).rows[0];
    expect(t).toMatchObject({ state: "BLOCKED", wait_reason: "failed" });
    expect(s.gh.state.calls.filter((c) => /^(createRef|createPull|merge)/.test(c))).toEqual([]);
    // т. 8.4: ПРОВАЛ → web push through the outbox (sent only by the worker)
    expect((await s.db.query<{ payload: unknown }>("select payload from public.outbox where kind = 'web_push'")).rows.map((r) => r.payload)).toEqual([{ task_id: "t_web_1", kind: "failed" }]);
  });
  it("contractForTask: allowed_paths/may_change_tests/risk_cap от политиката; непознат тип → грешка", async () => {
    const { parseMandatYml } = await import("@mandat/contract");
    const { readFileSync } = await import("node:fs");
    const p = parseMandatYml(readFileSync(path.join(repoRoot, "fixtures/demo-shop/.mandat.yml"), "utf8"));
    if (!p.ok) throw new Error(p.error);
    const c = contractForTask({ id: "t_x", type: "bugfix", text: "x", agent: "claude" }, p.policy, "a".repeat(40));
    expect(c).toMatchObject({ allowed_paths: ["src/**"], may_change_tests: false, risk_cap: 3, agent: "claude" });
    expect(() => contractForTask({ id: "t_x", type: "css", text: "x", agent: "claude" }, p.policy, "a".repeat(40))).toThrow(/task type/);
  });
  it("D-360: a free task without a policy entry → the whole repo, tests may change, the medium risk cap", async () => {
    const { parseMandatYml } = await import("@mandat/contract");
    const { readFileSync } = await import("node:fs");
    const p = parseMandatYml(readFileSync(path.join(repoRoot, "fixtures/demo-shop/.mandat.yml"), "utf8"));
    if (!p.ok) throw new Error(p.error);
    const c = contractForTask({ id: "t_x", type: "free", text: "x", agent: "claude" }, p.policy, "a".repeat(40));
    expect(c).toMatchObject({ type: "free", allowed_paths: ["**"], may_change_tests: true, risk_cap: p.policy.risk_classes.medium?.level_cap });
  });
});

const insertProfile = async (db: Awaited<ReturnType<typeof setup>>["db"], status: "proposed" | "approved") => {
  const { demoProfileLayers, sealProfile } = await import("@mandat/contract");
  const p = sealProfile({ version: 1, repo_id: DEMO_REPO_ID, layers: demoProfileLayers(), sources: {}, approved_by: null, approved_at: null });
  const r = await db.query<{ id: string }>("insert into public.harness_profiles (org_id, repo_id, version, layers, sources, profile_hash) values ($1, $2, 1, $3::jsonb, '{}', $4) returning id::text as id", [DEMO_ORG_ID, DEMO_REPO_ID, JSON.stringify(p.layers), p.profile_hash]);
  const id = r.rows[0]?.id as string;
  if (status === "approved") {
    await db.query("update public.harness_profiles set status = 'approved', approved_at = now() where id = $1", [id]);
    await db.query("update public.repos set profile_id = $2 where id = $1", [DEMO_REPO_ID, id]);
  }
  return p;
};
describe("daemon with harness profiles (E8б, AC-2.5/2.6)", () => {
  it("a repo with only a proposed profile → BLOCKED harness_unapproved, the agent never runs", async () => {
    const s = await setup(0);
    await insertProfile(s.db, "proposed");
    await runDaemonOnce(s.deps);
    const t = (await s.db.query<{ state: string; wait_reason: string }>("select state, wait_reason from public.tasks where id = 't_web_1'")).rows[0];
    expect(t).toEqual({ state: "BLOCKED", wait_reason: "harness_unapproved" });
    expect(s.runs).toHaveLength(0);
  });
  it("the approved profile goes to runTask (the control layer of the agent)", async () => {
    const s = await setup(0);
    const p = await insertProfile(s.db, "approved");
    await runDaemonOnce(s.deps);
    expect(s.runs[0]?.profile?.profile_hash).toBe(p.profile_hash);
  });
  it("a tampered approved profile (hash does not match the layers) → BLOCKED harness_unapproved", async () => {
    const s = await setup(0);
    await insertProfile(s.db, "approved");
    await s.db.query("alter table public.harness_profiles disable trigger harness_profiles_guard");
    await s.db.query("update public.harness_profiles set layers = jsonb_set(layers, '{g,mutants}', '9')");
    await runDaemonOnce(s.deps);
    expect((await s.db.query<{ wait_reason: string }>("select wait_reason from public.tasks where id = 't_web_1'")).rows[0]?.wait_reason).toBe("harness_unapproved");
  });
  it("E8g: the agent hit an ask rule → tool_asks rows, HELD tool_approval, no delivery, a push; once-grants go to the next attempt", async () => {
    const s = await setup(2);
    await insertProfile(s.db, "approved");
    const base = s.deps.run as NonNullable<typeof s.deps.run>;
    s.deps.run = async (i) => ({ ...(await base(i)), asks: [{ tool: "mcp:github.create_issue", reason: "a human decides on new issues" }] });
    await runDaemonOnce(s.deps);
    expect((await s.db.query<{ state: string; wait_reason: string }>("select state, wait_reason from public.tasks where id = 't_web_1'")).rows[0]).toEqual({ state: "HELD", wait_reason: "tool_approval" });
    expect((await s.db.query<{ tool: string; attempt: number; status: string }>("select tool, attempt, status from public.tool_asks")).rows).toEqual([{ tool: "mcp:github.create_issue", attempt: 1, status: "pending" }]);
    expect(s.gh.state.calls.filter((c) => /^(createRef|createPull|merge)/.test(c))).toEqual([]);
    expect((await s.db.query<{ payload: unknown }>("select payload from public.outbox where kind = 'web_push'")).rows.map((r) => r.payload)).toEqual([{ task_id: "t_web_1", kind: "waiting" }]);
    // a person said "allow once" (the web server does this): attempt 2 runs with the grant
    await s.db.query("update public.tool_asks set status = 'once', grant_attempt = 2");
    await s.db.query("update public.tasks set state = 'CREATED', attempt = 2, wait_reason = null where id = 't_web_1'");
    s.deps.run = base;
    await runDaemonOnce(s.deps);
    expect(s.runs.at(-1)?.grantOnce).toEqual(["mcp:github.create_issue"]);
  });
});

describe("daemon steering (E8g, AC-8.5)", () => {
  it("a steerable agent gets a steer hook: new steer rows once each (framed later by the adapter); tasks.steerable while it runs", async () => {
    const s = await setup(0);
    await s.db.query("update public.tasks set agent = 'fake:steer-echo' where id = 't_web_1'");
    await s.db.query("insert into public.task_activities (org_id, task_id, kind, text) values ($1, 't_web_1', 'steer', 'use cents')", [DEMO_ORG_ID]);
    const base = s.deps.run as NonNullable<typeof s.deps.run>;
    const got: unknown[] = [];
    let steerable: boolean | undefined;
    s.deps.run = async (i) => {
      steerable = (await s.db.query<{ steerable: boolean }>("select steerable from public.tasks where id = 't_web_1'")).rows[0]?.steerable;
      got.push(await i.hooks?.steer?.(), await i.hooks?.steer?.());
      return base(i);
    };
    await runDaemonOnce(s.deps);
    expect(steerable).toBe(true);
    expect(got).toEqual([[{ text: "use cents", author: "member" }], []]);
    expect((await s.db.query<{ steerable: boolean }>("select steerable from public.tasks where id = 't_web_1'")).rows[0]?.steerable).toBe(false);
  });
  it("Claude Code is steerable only with deps.steer (S2 live first); Codex never", async () => {
    const s = await setup(0);
    await s.db.query("update public.tasks set agent = 'fake:honest-fix' where id = 't_web_1'");
    await runDaemonOnce(s.deps);
    expect(s.runs[0]?.hooks?.steer).toBeUndefined();
  });
  it("steers from an earlier attempt go into the contract of the next one (framed)", async () => {
    const s = await setup(0);
    await s.db.query("update public.tasks set attempt = 2 where id = 't_web_1'");
    await s.db.query("insert into public.task_activities (org_id, task_id, kind, text) values ($1, 't_web_1', 'steer', 'round <down>')", [DEMO_ORG_ID]);
    await runDaemonOnce(s.deps);
    const { readFileSync } = await import("node:fs");
    const c = JSON.parse(readFileSync(s.runs[0]?.contractPath ?? "", "utf8")) as { text: string };
    expect(c.text).toContain('source="steer">round &lt;down&gt;</untrusted>');
  });
  // E9а (v5 5.1): a task of the night shift
  const nightShift = async (db: Awaited<ReturnType<typeof pgliteDb>>, rules: { min_level: number; max_lines: number; forbid: string[] }) => {
    const id = "50000000-0000-4000-8000-0000000000d1";
    await db.query(
      "insert into public.night_shifts (id, org_id, starts_at, ends_at, budget_usd, rules, status) values ($1, $2, now(), now() + interval '8 hours', 10, $3::jsonb, 'running')",
      [id, DEMO_ORG_ID, JSON.stringify({ auto_merge: { min_level: rules.min_level, max_lines: rules.max_lines }, on_fail: "retry_then_park", retries: 1, same_file: "wait", forbid_tools: rules.forbid })],
    );
    await db.query("update public.tasks set shift_id = $1 where id = 't_web_1'", [id]);
  };
  it("E9а: a shift task runs with the subject night and the night's forbidden tools denied; a night retry carries Mandat's note", async () => {
    const s = await setup(0);
    await insertProfile(s.db, "approved");
    await nightShift(s.db, { min_level: 2, max_lines: 200, forbid: ["bash:curl *"] });
    await s.db.query("update public.tasks set attempt = 2, retry_reason = 'night' where id = 't_web_1'");
    await s.db.query("insert into public.task_activities (org_id, task_id, kind, text) values ($1, 't_web_1', 'night', 'FAILED after 1 attempt(s): `MUST_PASS:not_passed:x`. Describe it better.')", [DEMO_ORG_ID]);
    await runDaemonOnce(s.deps);
    const r = s.runs[0];
    expect(r?.subjects).toContain("night");
    expect(r?.profile?.layers.c).toContainEqual({ subject: "night", tool: "bash:curl *", decision: "deny", reason: "forbidden by the night shift" });
    const { profileHash } = await import("@mandat/contract");
    expect(r?.profile?.profile_hash).toBe(profileHash(r?.profile?.layers as never));
    const c = JSON.parse(readFileSync(r?.contractPath ?? "", "utf8")) as { text: string };
    expect(c.text).toContain("Note from Mandat (night shift): FAILED after 1 attempt(s): `MUST_PASS:not_passed:x`. Describe it better.");
  });
  it("E9а: after the shift ended (an answered question the next morning) the task runs by day rules", async () => {
    const s = await setup(0);
    await insertProfile(s.db, "approved");
    await nightShift(s.db, { min_level: 2, max_lines: 200, forbid: ["bash:curl *"] });
    await s.db.query("update public.night_shifts set status = 'done'");
    await runDaemonOnce(s.deps);
    expect(s.runs[0]?.subjects ?? []).not.toContain("night");
    expect(s.runs[0]?.profile?.layers.c.some((r) => r.reason === "forbidden by the night shift")).toBe(false);
  });
  it("E9б (D5): the repo's latest hidden test set goes to runTask (tree B only); none → no hidden input", async () => {
    const s = await setup(0);
    await runDaemonOnce(s.deps);
    expect(s.runs[0]?.hidden ?? null).toBeNull();
    const s2 = await setup(0);
    await s2.db.query("select private.add_hidden_tests($1, $2::jsonb, $3, null, now())", [DEMO_REPO_ID, JSON.stringify([{ path: "old.spec.ts", data: Buffer.from("old").toString("base64") }]), `sha256:${"1".repeat(64)}`]);
    await s2.db.query("select private.add_hidden_tests($1, $2::jsonb, $3, null, now())", [DEMO_REPO_ID, JSON.stringify([{ path: "cart.spec.ts", data: Buffer.from("it('x')").toString("base64") }]), `sha256:${"2".repeat(64)}`]);
    await runDaemonOnce(s2.deps);
    const h = s2.runs[0]?.hidden;
    expect(h?.dir).toBe("tests/__hidden__");
    expect(h?.files.map((f) => [f.path, f.data.toString("utf8")])).toEqual([["cart.spec.ts", "it('x')"]]);
  }, 30_000);
  it("E9а: at night a level-2 change is not auto-merged when the shift's rule wants level 3 → HELD approval (waiting for a person)", async () => {
    const s = await setup(2);
    await nightShift(s.db, { min_level: 3, max_lines: 200, forbid: [] });
    await runDaemonOnce(s.deps);
    const t = (await s.db.query<{ state: string; wait_reason: string }>("select state, wait_reason from public.tasks where id = 't_web_1'")).rows[0];
    expect(t).toEqual({ state: "HELD", wait_reason: "approval" });
  });
});

describe("daemon and MCP sidecars (E8e, D-354)", () => {
  it("the declared secrets of each stdio server of the profile and its call budget go to runTask (only those names)", async () => {
    const s = await setup(0);
    const { demoProfileLayers, sealProfile } = await import("@mandat/contract");
    const l = demoProfileLayers();
    const ref = { name: "issues", transport: "stdio" as const, package: "@example/issues-mcp@1.3.0", url: null, version: "1.3.0", digest: null, tools_hash: `sha256:${"e".repeat(64)}`, enabled_tools: null, egress_hosts: [], secrets: ["ISSUES_TOKEN"] };
    const p = sealProfile({ version: 1, repo_id: DEMO_REPO_ID, layers: { ...l, e: { ...l.e, mcp: [ref] } }, sources: {}, approved_by: null, approved_at: null });
    const id = (await s.db.query<{ id: string }>("insert into public.harness_profiles (org_id, repo_id, version, layers, sources, profile_hash, status, approved_at) values ($1, $2, 1, $3::jsonb, '{}', $4, 'approved', now()) returning id::text as id", [DEMO_ORG_ID, DEMO_REPO_ID, JSON.stringify(p.layers), p.profile_hash])).rows[0]?.id;
    await s.db.query("update public.repos set profile_id = $2 where id = $1", [DEMO_REPO_ID, id]);
    await s.db.query("insert into public.mcp_servers (org_id, name, transport, version, budget_calls_min, vet_status) values ($1, 'issues', 'stdio', '1.3.0', 12, 'approved')", [DEMO_ORG_ID]);
    s.deps.mcpSecrets = (_org, name) => Promise.resolve(name === "issues" ? { ISSUES_TOKEN: "t0k", OTHER: "x" } : {});
    await runDaemonOnce(s.deps);
    expect(s.runs[0]?.mcpSecrets).toEqual({ issues: { ISSUES_TOKEN: "t0k" } });
    expect(s.runs[0]?.mcpBudgets).toEqual({ issues: 12 });
  });
});

describe("daemon and file conflicts (E8f, AC-4.2)", () => {
  it("same_file wait: the later task touching a file another live task touches is stopped and re-queued behind it", async () => {
    const s = await setup(0);
    const { createStreamCtx, streamEvent } = await import("@mandat/contract");
    await s.db.query("insert into public.tasks (id, org_id, repo_id, type, agent, text, state, created_at) values ('t_other', $1, $2, 'bugfix', 'fake:honest-fix', 'y', 'RUNNING', now() - interval '1 hour')", [DEMO_ORG_ID, DEMO_REPO_ID]);
    await s.db.query("insert into public.agent_sessions (id, org_id, task_id, agent, model, role, state, touching) values ('s_other', $1, 't_other', 'fake', 'fake', 'lead', 'running', '{src/cart.ts}')", [DEMO_ORG_ID]);
    const base = s.deps.run as NonNullable<typeof s.deps.run>;
    let stop: string | null = null;
    s.deps.run = async (i) => {
      const ctx = createStreamCtx("r_01JABCDEFGHJKMNPQRSTVWXYZ0");
      i.hooks?.onStream?.(streamEvent(ctx, { kind: "tool_call", tool: { kind: "builtin", name: "Edit", touching: ["src/cart.ts"], decision: null } }));
      for (let k = 0; k < 50 && stop === null; k++) {
        await new Promise((r) => setTimeout(r, 20));
        stop = i.hooks?.stopRequested?.() ?? null;
      }
      const out = await base(i);
      return { ...out, agentExit: null, stopped: "conflict" as const };
    };
    await runDaemonOnce(s.deps);
    expect(stop).toBe("conflict");
    expect((await s.db.query("select state, wait_for, retry_reason, attempt from public.tasks where id = 't_web_1'")).rows[0]).toEqual({ state: "CREATED", wait_for: "t_other", retry_reason: "conflict", attempt: 2 });
    expect((await s.db.query("select kind, text from public.task_activities where task_id = 't_web_1'")).rows).toEqual([{ kind: "conflict", text: "src/cart.ts · t_other" }]);
    expect((await s.db.query("select 1 from public.ladder_events")).rows).toHaveLength(0);
  });
});

describe("daemon and a moved base (E8f, AC-4.5)", () => {
  const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@x", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@x" };
  const recorded = () => readFileSync(path.join(repoRoot, "demo/recordings/scene1-task1.patch"));
  const work = (mirror: string) => {
    const w = path.join(mkdtempSync(path.join(os.tmpdir(), "mandat-w-")), "w");
    execFileSync("git", ["clone", "-q", mirror, w], { env });
    return w;
  };
  const agentPatch = (mirror: string) => {
    const w = work(mirror);
    execFileSync("git", ["apply"], { cwd: w, env, input: recorded() });
    return execFileSync("git", ["diff", "--binary"], { cwd: w, env });
  };
  const moveMain = (mirror: string, file: string, edit: (s: string) => string) => {
    const w = work(mirror);
    writeFileSync(path.join(w, file), edit(readFileSync(path.join(w, file), "utf8")));
    execFileSync("git", ["commit", "-qam", "someone else"], { cwd: w, env });
    execFileSync("git", ["push", "-q", "origin", "HEAD:main", "HEAD:master"], { cwd: w, env });
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: w, env, encoding: "utf8" }).trim();
  };
  const runWith = (s: Awaited<ReturnType<typeof setup>>, patch: Buffer, onRun?: () => void) => {
    s.deps.run = (i) => {
      s.runs.push(i);
      onRun?.();
      const c = JSON.parse(readFileSync(i.contractPath, "utf8")) as { base_commit: string };
      const runDir = path.join(s.deps.home, "runs", `r${s.runs.length}`);
      mkdirSync(path.join(runDir, "export"), { recursive: true });
      writeFileSync(path.join(runDir, "export", "diff.patch"), patch);
      return Promise.resolve({ verdict: verdict("VERIFIED", c.base_commit), exit: 0, runDir, ledger: { from: 1, to: 3 }, agentExit: 0 });
    };
  };
  it("main moved elsewhere during the run → no delivery; a rebase attempt with the rebased files; its own verdict → PR", async () => {
    const s = await setup(2);
    const patch = agentPatch(s.fx.mirror);
    let moved = "";
    runWith(s, patch, () => {
      if (!moved) moved = moveMain(s.fx.mirror, "README.md", (x) => x + "\nmore\n");
    });
    await runDaemonOnce(s.deps);
    expect((await s.db.query("select state, attempt, retry_reason from public.tasks where id = 't_web_1'")).rows[0]).toEqual({ state: "CREATED", attempt: 2, retry_reason: "rebase" });
    expect(s.gh.state.calls.filter((c) => /^(createRef|createPull)/.test(c))).toEqual([]);
    await runDaemonOnce(s.deps);
    const second = s.runs[1];
    expect(second?.applyFiles?.map((f) => f.path)).toEqual(["src/cart.ts"]);
    expect((JSON.parse(readFileSync(second?.contractPath ?? "", "utf8")) as { base_commit: string }).base_commit).toBe(moved);
    expect((await s.db.query<{ n: number }>("select count(*)::int as n from public.verdicts where task_id = 't_web_1'")).rows[0]?.n).toBe(2);
    expect(s.gh.state.calls.some((c) => /^createPull/.test(c))).toBe(true);
  });
  it("main changed the same line → HELD base_moved with the conflict; nothing delivered, never force", async () => {
    const s = await setup(2);
    const patch = agentPatch(s.fx.mirror);
    let moved = false;
    runWith(s, patch, () => {
      if (!moved) moved = Boolean(moveMain(s.fx.mirror, "src/cart.ts", (x) => x.replace("const DISCOUNT_THRESHOLD_CENTS = 50000;", "const DISCOUNT_THRESHOLD_CENTS = 40000;")));
    });
    await runDaemonOnce(s.deps);
    expect((await s.db.query("select state, wait_reason from public.tasks where id = 't_web_1'")).rows[0]).toEqual({ state: "HELD", wait_reason: "base_moved" });
    expect((await s.db.query("select kind, text from public.task_activities where task_id = 't_web_1'")).rows).toEqual([{ kind: "base_moved", text: "src/cart.ts" }]);
    expect(s.gh.state.calls.filter((c) => /^(createRef|createPull|merge|forcePush)/.test(c))).toEqual([]);
  });
});

// D-367: a verified safe change in a local project goes into main by itself; a person is asked only with a reason
const gitEnv = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@x", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@x" };
function realPatch(edit: (w: string) => void) {
  return (mirror: string): Buffer => {
    const w = path.join(mkdtempSync(path.join(os.tmpdir(), "mandat-agent-")), "w");
    execFileSync("git", ["clone", "-q", mirror, w], { env: gitEnv });
    edit(w);
    execFileSync("git", ["add", "-A"], { cwd: w, env: gitEnv });
    return execFileSync("git", ["diff", "--cached", "--binary"], { cwd: w, env: gitEnv });
  };
}
const fixPatch = realPatch((w) => execFileSync("git", ["apply"], { cwd: w, env: gitEnv, input: readFileSync(path.join(repoRoot, "demo/recordings/scene1-task1.patch")) }));

describe("daemon auto-apply (D-367)", () => {
  it("VERIFIED и безопасна промяна → main се мести напред сам, CLOSED, доставка merge, стълбата получава успех, без „чака те“", async () => {
    const s = await setup(0, "VERIFIED", fixPatch);
    await runDaemonOnce(s.deps);
    const t = (await s.db.query<{ state: string; outcome_decided: boolean }>("select state, outcome_decided from public.tasks where id = 't_web_1'")).rows[0];
    expect(t).toMatchObject({ state: "CLOSED", outcome_decided: true });
    const cs = (await s.db.query<{ approval_needed: boolean; requires_second_factor: boolean }>("select approval_needed, requires_second_factor from public.changesets")).rows[0];
    expect(cs).toEqual({ approval_needed: false, requires_second_factor: false });
    const main = execFileSync("git", ["--git-dir", s.fx.mirror, "rev-parse", "main"], { env: gitEnv, encoding: "utf8" }).trim();
    const branch = execFileSync("git", ["--git-dir", s.fx.mirror, "rev-parse", "mandat/t_web_1-a1"], { env: gitEnv, encoding: "utf8" }).trim();
    expect(main).toBe(branch);
    expect((await s.db.query<{ kind: string }>("select kind from public.deliveries order by created_at, id")).rows.map((r) => r.kind)).toEqual(["branch_only", "merge"]);
    expect((await s.db.query<{ input: string }>("select input from public.ladder_events")).rows).toEqual([{ input: "success" }]);
    expect((await s.db.query<{ kind: string; text: string }>("select kind, text from public.task_activities where kind in ('auto_applied', 'needs_you')")).rows).toEqual([{ kind: "auto_applied", text: `main ${s.fx.sha.slice(0, 12)} → ${main.slice(0, 12)}` }]);
    const pushes = (await s.db.query<{ payload: { kind: string } }>("select payload from public.outbox where kind = 'web_push'")).rows.map((r) => r.payload.kind);
    expect(pushes).toEqual(["merged"]);
  });
  it("рисков път (package.json) → HELD approval с причината; main не мърда", async () => {
    const s = await setup(0, "VERIFIED", realPatch((w) => writeFileSync(path.join(w, "package.json"), `${readFileSync(path.join(w, "package.json"), "utf8")}\n`)));
    await runDaemonOnce(s.deps);
    expect((await s.db.query<{ state: string; wait_reason: string }>("select state, wait_reason from public.tasks")).rows[0]).toEqual({ state: "HELD", wait_reason: "approval" });
    expect((await s.db.query<{ text: string }>("select text from public.task_activities where kind = 'needs_you'")).rows).toEqual([{ text: "sensitive:deps:package.json" }]);
    expect(execFileSync("git", ["--git-dir", s.fx.mirror, "rev-parse", "main"], { env: gitEnv, encoding: "utf8" }).trim()).toBe(s.fx.sha);
  });
  it("UNKNOWN → пита (not_verified); FAILED → нито пита, нито прилага", async () => {
    const u = await setup(0, "UNKNOWN", fixPatch);
    await runDaemonOnce(u.deps);
    expect((await u.db.query<{ text: string }>("select text from public.task_activities where kind = 'needs_you'")).rows).toEqual([{ text: "not_verified" }]);
    const f = await setup(0, "FAILED", fixPatch);
    await runDaemonOnce(f.deps);
    expect((await f.db.query("select 1 from public.task_activities where kind in ('needs_you', 'auto_applied')")).rows).toHaveLength(0);
    expect(execFileSync("git", ["--git-dir", f.fx.mirror, "rev-parse", "main"], { env: gitEnv, encoding: "utf8" }).trim()).toBe(f.fx.sha);
  });
  it("промяна, която не се прилага → обратно на човека (apply_failed), с „чака те“", async () => {
    const s = await setup(0, "VERIFIED");
    await runDaemonOnce(s.deps);
    const t = (await s.db.query<{ state: string; wait_reason: string }>("select state, wait_reason from public.tasks")).rows[0];
    expect(t).toEqual({ state: "HELD", wait_reason: "approval" });
    expect((await s.db.query<{ approval_needed: boolean }>("select approval_needed from public.changesets")).rows[0]?.approval_needed).toBe(true);
    expect((await s.db.query<{ text: string }>("select text from public.task_activities where kind = 'needs_you'")).rows[0]?.text).toMatch(/^apply_failed:/);
    expect((await s.db.query<{ payload: { kind: string } }>("select payload from public.outbox where kind = 'web_push'")).rows.map((r) => r.payload.kind)).toEqual(["waiting"]);
  });
});

describe("approval of a local task (D-367)", () => {
  it("одобрението на човек слива клона в main, затваря задачата и дава успех на стълбата; повторно — без ефект", async () => {
    const { approvalHandlers } = await import("./effects.js");
    const s = await setup(0, "VERIFIED", realPatch((w) => writeFileSync(path.join(w, "package.json"), `${readFileSync(path.join(w, "package.json"), "utf8")}\n`)));
    await runDaemonOnce(s.deps);
    const cs = (await s.db.query<{ id: string; head_sha: string }>("select id::text as id, head_sha from public.changesets")).rows[0];
    if (!cs) throw new Error("no changeset");
    const h = approvalHandlers(s.deps);
    const row = { id: 1, org_id: DEMO_ORG_ID, kind: "approval_check", idempotency_key: "k", attempts: 0, payload: { changeset_id: cs.id, head_sha: cs.head_sha } };
    await h.approval_check(row as never);
    const branch = execFileSync("git", ["--git-dir", s.fx.mirror, "rev-parse", "mandat/t_web_1-a1"], { env: gitEnv, encoding: "utf8" }).trim();
    expect(execFileSync("git", ["--git-dir", s.fx.mirror, "rev-parse", "main"], { env: gitEnv, encoding: "utf8" }).trim()).toBe(branch);
    expect((await s.db.query<{ state: string }>("select state from public.tasks")).rows[0]?.state).toBe("CLOSED");
    expect((await s.db.query<{ input: string }>("select input from public.ladder_events")).rows).toEqual([{ input: "success" }]);
    await h.approval_check(row as never);
    expect((await s.db.query("select 1 from public.ladder_events")).rows).toHaveLength(1);
  });
});

// D-388: a local project added on this computer (not the demo repo) — its GitHub side is the offline one under its own
// name, never the worker's one repo; the mirror is its delivery, so nothing is "merged" on a fake PR.
describe("daemon and an own local project (D-388)", () => {
  const own = async (level: number, patchOf?: (mirror: string) => Buffer) => {
    const s = await setup(level, "VERIFIED", patchOf);
    await s.db.query("update public.repos set full_name = 'local/shop' where id = $1", [DEMO_REPO_ID]);
    const localGh = fakeGitHub({ autoRepos: true });
    return { ...s, localGh, deps: { ...s.deps, localGh } };
  };
  it("level 0: the branch goes to the offline GitHub under local/shop; the worker's GitHub is not touched", async () => {
    const s = await own(0);
    await runDaemonOnce(s.deps);
    expect(s.localGh.state.calls.some((c) => c.startsWith("createRef") && c.includes("local/shop"))).toBe(true);
    expect(s.gh.state.calls).toEqual([]);
  });
  it("level 2 with a change that needs a person: no auto-merge of a fake PR — HELD approval, main does not move", async () => {
    const s = await own(2, realPatch((w) => writeFileSync(path.join(w, "package.json"), `${readFileSync(path.join(w, "package.json"), "utf8")}\n`)));
    await runDaemonOnce(s.deps);
    expect((await s.db.query<{ state: string; wait_reason: string }>("select state, wait_reason from public.tasks")).rows[0]).toEqual({ state: "HELD", wait_reason: "approval" });
    expect(s.localGh.state.calls.some((c) => c.startsWith("merge"))).toBe(false);
    expect(execFileSync("git", ["--git-dir", s.fx.mirror, "rev-parse", "main"], { env: gitEnv, encoding: "utf8" }).trim()).toBe(s.fx.sha);
  });
});
