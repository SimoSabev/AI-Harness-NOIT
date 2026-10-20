import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Verdict } from "@mandat/contract";
import { readLedgerOnline, verifyOnlineRows } from "@mandat/ledger";
import { fakeGitHub } from "@mandat/gate-github";
import { buildFixture } from "../fixtures.js";
import { repoRoot } from "../testing.js";
import { DEMO_ORG_ID, DEMO_REPO_ID, seedMinimal } from "./seed.js";
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

async function setup(level: number, result: "VERIFIED" | "FAILED" | "UNKNOWN" = "VERIFIED") {
  const home = mkdtempSync(path.join(os.tmpdir(), "mandat-daemon-"));
  const fx = buildFixture({ repoRoot, mandatHome: home, force: false, name: "demo-shop" });
  const db = await pgliteDb();
  await seedMinimal(db, { remoteUrl: `file://${fx.mirror}` });
  await db.query("update public.repos set ruleset_strict = true where id = $1", [DEMO_REPO_ID]);
  if (level > 0) await db.query("insert into public.ladder_state (org_id, repo_id, task_type, agent, level) values ($1, $2, 'bugfix', 'fake:honest-fix', $3)", [DEMO_ORG_ID, DEMO_REPO_ID, level]);
  await db.query("insert into public.tasks (id, org_id, repo_id, type, agent, text) values ('t_web_1', $1, $2, 'bugfix', 'fake:honest-fix', 'Fix the discount')", [DEMO_ORG_ID, DEMO_REPO_ID]);
  const gh = fakeGitHub({ repos: { "mandat-demo/shop": {} } });
  const events: { topic: string; payload: Record<string, unknown> }[] = [];
  const runs: RunTaskInput[] = [];
  const deps: DaemonDeps = {
    db, home, gh, ghRepo: "mandat-demo/shop",
    broadcast: (topic, _e, payload) => Promise.resolve(void events.push({ topic, payload })),
    run: (i) => {
      runs.push(i);
      const runDir = path.join(home, "runs", "r1");
      mkdirSync(path.join(runDir, "export"), { recursive: true });
      writeFileSync(path.join(runDir, "export", "diff.patch"), "diff --git a/src/cart.ts b/src/cart.ts\n");
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
    const rows = await readLedgerOnline(s.db, DEMO_ORG_ID);
    expect(rows.map((r) => r.kind)).toEqual(["demo_reset", "task_created", "verdict", "gated"]);
    expect(verifyOnlineRows(rows, DEMO_ORG_ID).ok).toBe(true);
    expect(s.events.map((e) => e.topic)).toContain(`org:${DEMO_ORG_ID}:board`);
    expect(s.events.map((e) => e.topic)).toContain("task:t_web_1");
    for (const e of s.events) expect(JSON.stringify(e.payload).length).toBeLessThanOrEqual(1024);
    expect(await runDaemonOnce(s.deps)).toBe(null);
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
  });
  it("FAILED → BLOCKED „failed“ без доставка", async () => {
    const s = await setup(2, "FAILED");
    await runDaemonOnce(s.deps);
    const t = (await s.db.query<{ state: string; wait_reason: string }>("select state, wait_reason from public.tasks where id = 't_web_1'")).rows[0];
    expect(t).toMatchObject({ state: "BLOCKED", wait_reason: "failed" });
    expect(s.gh.state.calls.filter((c) => /^(createRef|createPull|merge)/.test(c))).toEqual([]);
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
});
