import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ORACLE_DIR, ORACLE_MIN_KILL, OracleManifest, Verdict, oracleHash, sha256Tag, specHash } from "@mandat/contract";
import type { Spec } from "@mandat/contract";
import { fakeGitHub } from "@mandat/gate-github";
import { buildFixture } from "../fixtures.js";
import { repoRoot } from "../testing.js";
import { DEMO_ORG_ID, DEMO_REPO_ID, seedMinimal } from "./seed.js";
import { runDaemonOnce } from "./daemon.js";
import type { DaemonDeps } from "./daemon.js";
import { pgliteDb } from "./pglite-db.test-helper.js";
import type { RunTaskInput, RunTaskOutput } from "../run.js";

// D-534 (М1 Х3): the oracle task in the worker (fake agent, PGlite, no Docker). Its tests become the oracle of the spec
// and are stored privately; they never reach the mirror, a changeset or the writer's own tree; the writer's task gets
// them for tree B only through an approved oracle, checked file by file against its manifest.
const spec: Spec = {
  goal: "Discount over 50",
  product: "",
  criteria: [{ id: "AC-1", when: "the subtotal is over 50", shall: "apply 10%", proof: "tests" }],
  unchanged: ["no discount under 50"],
  out_of_scope: [],
  profile: "feature",
};
const SPEC = specHash(spec);
const TEST_A = Buffer.from(`it("AC-1: applies 10% over 50", () => { expect(discountCents(10000)).toBe(1000); });\n`);
const TEST_U = Buffer.from(`it("U-1: none under 50", () => { expect(discountCents(4999)).toBe(0); });\n`);
const verdict = (base: string) =>
  Verdict.parse({
    run_id: "r_01JABCDEFGHJKMNPQRSTVWXYZ0", task_id: "t_or_1", attempt: 1, agent: "fake:honest-fix", result: "FAILED", reasons: [],
    evidence: [{ detector: "D1.base_tests", phase: 1, status: "pass", summary: "20/20", data: {}, source: "sandbox:verify", agent_visible: true }],
    contract_hash: `sha256:${"a".repeat(64)}`, base_sha: base, tree_sha: "b".repeat(40), diff_hash: `sha256:${"c".repeat(64)}`, integrity: "ok",
    usage: { usd: 0.2, input_tokens: 1, output_tokens: 1, requests: 1 }, timings_ms: { provision: 0, install: 0, agent: 0, export: 0, verify: 0, verdict: 0, total: 0 }, created_at: "2026-11-17T00:00:00.000Z",
  });
const ok = (statusA: "failed" | "passed", statusU: "failed" | "passed"): RunTaskOutput["oracle"] => ({
  ok: true, tests: [{ path: "cart.spec.ts", data: TEST_A }, { path: "u.spec.ts", data: TEST_U }], problems: [],
  base: { timedOut: false, results: [{ id: `${ORACLE_DIR}/cart.spec.ts > AC-1: applies 10% over 50`, status: statusA }, { id: `${ORACLE_DIR}/u.spec.ts > U-1: none under 50`, status: statusU }] },
});

async function setup(oracle: RunTaskOutput["oracle"]) {
  const home = mkdtempSync(path.join(os.tmpdir(), "mandat-oracle-"));
  const fx = buildFixture({ repoRoot, mandatHome: home, force: false, name: "demo-shop" });
  const db = await pgliteDb();
  await seedMinimal(db, { remoteUrl: `file://${fx.mirror}` });
  await db.query(
    "insert into public.conversations (id, org_id, repo_id, agent, budget_usd, expires_at, status, spec, spec_hash, spec_ready, approved_spec, approved_spec_hash, approved_at) values ('c_or1', $1, $2, 'fake:honest-fix', 0.5, now() + interval '1 hour', 'idle', $3::jsonb, $4, true, $3::jsonb, $4, now())",
    [DEMO_ORG_ID, DEMO_REPO_ID, JSON.stringify(spec), SPEC],
  );
  await db.query("insert into public.tasks (id, org_id, repo_id, type, agent, text, kind, spec_hash) values ('t_or_1', $1, $2, 'bugfix', 'fake:honest-fix', 'write the oracle', 'oracle', $3)", [DEMO_ORG_ID, DEMO_REPO_ID, SPEC]);
  await db.query("insert into public.oracles (id, org_id, repo_id, conversation_id, spec_hash, task_id) values ('o_or1', $1, $2, 'c_or1', $3, 't_or_1')", [DEMO_ORG_ID, DEMO_REPO_ID, SPEC]);
  const runs: RunTaskInput[] = [];
  const deps: DaemonDeps = {
    db, home, gh: fakeGitHub({ repos: { "mandat-demo/shop": {} } }), ghRepo: "mandat-demo/shop",
    run: (i) => {
      runs.push(i);
      const runDir = path.join(home, "runs", `r${runs.length}`);
      mkdirSync(path.join(runDir, "export"), { recursive: true });
      writeFileSync(path.join(runDir, "export", "diff.patch"), `diff --git a/${ORACLE_DIR}/cart.spec.ts b/${ORACLE_DIR}/cart.spec.ts\n`);
      return Promise.resolve({ verdict: verdict(fx.sha), exit: 20, runDir, ledger: { from: 1, to: 3 }, agentExit: 0, ...(runs.length === 1 && oracle ? { oracle } : {}) });
    },
  };
  return { db, deps, runs, fx, home };
}
const mainOf = (mirror: string) => execFileSync("git", ["--git-dir", mirror, "rev-parse", "main"], { encoding: "utf8" }).trim();
type OracleRowT = { status: string; problems: { kind: string; id: string }[]; red_on_base: unknown; manifest: unknown; oracle_hash: string | null; hidden_version: number | null };
const oracleRow = async (db: Awaited<ReturnType<typeof pgliteDb>>) => (await db.query<OracleRowT>("select status, problems, red_on_base, manifest, oracle_hash, hidden_version from public.oracles where id = 'o_or1'")).rows[0]!;

describe("the oracle task (D-534)", () => {
  it("runs like a task, may write only tests under the oracle directory, and gets no hidden tests itself", async () => {
    const s = await setup(ok("failed", "passed"));
    await runDaemonOnce(s.deps);
    expect(s.runs).toHaveLength(1);
    expect(s.runs[0]?.oracle).toEqual({ dir: ORACLE_DIR });
    expect(s.runs[0]?.hidden ?? null).toBeNull();
    const c = JSON.parse(readFileSync(s.runs[0]!.contractPath, "utf8")) as { allowed_paths: string[]; may_change_tests: boolean; spec_hash: string };
    expect(c).toMatchObject({ allowed_paths: [`${ORACLE_DIR}/**`], may_change_tests: true, spec_hash: SPEC });
  });
  it("criteria red and unchanged green → ready: manifest with each file's sha256, oracle_hash, the tests stored by spec, nothing delivered", async () => {
    const s = await setup(ok("failed", "passed"));
    await runDaemonOnce(s.deps);
    const o = await oracleRow(s.db);
    expect(o.status).toBe("ready");
    const m = OracleManifest.parse(o.manifest);
    expect(m).toEqual({ spec_hash: SPEC, hidden_tests: [{ path: "cart.spec.ts", sha256: sha256Tag(TEST_A) }, { path: "u.spec.ts", sha256: sha256Tag(TEST_U) }], red_on_base: [{ criterion_id: "AC-1", red: true }] });
    expect(o.oracle_hash).toBe(oracleHash(m));
    const stored = (await s.db.query<{ spec_hash: string; files: { path: string; data: string }[] }>("select spec_hash, files from private.hidden_tests where repo_id = $1 and version = $2", [DEMO_REPO_ID, o.hidden_version])).rows[0];
    expect(stored?.spec_hash).toBe(SPEC);
    expect(stored?.files.map((f) => [f.path, Buffer.from(f.data, "base64").toString("utf8")])).toEqual([["cart.spec.ts", TEST_A.toString("utf8")], ["u.spec.ts", TEST_U.toString("utf8")]]);
    // never into the mirror, a changeset, a diff row or a delivery; the run's copy of the diff is gone
    expect(mainOf(s.fx.mirror)).toBe(s.fx.sha);
    for (const table of ["changesets", "changeset_diffs", "deliveries"]) expect((await s.db.query(`select 1 from public.${table}`)).rows).toEqual([]);
    expect(existsSync(path.join(s.home, "runs", "r1", "export", "diff.patch"))).toBe(false);
    expect((await s.db.query<{ state: string }>("select state from public.tasks where id = 't_or_1'")).rows[0]?.state).toBe("CLOSED");
    // the ledger: hashes and counts, no test name or content
    const l = (await s.db.query<{ payload_jcs: string }>("select payload_jcs from public.ledger where kind = 'oracle_built'")).rows;
    expect(l).toHaveLength(1);
    expect(JSON.parse(l[0]!.payload_jcs)).toMatchObject({ oracle: "o_or1", spec_hash: SPEC, oracle_hash: o.oracle_hash, status: "ready", tests: 2, problems: 0 });
    expect(l[0]!.payload_jcs).not.toContain("applies 10%");
  });
  it("a new-behavior test already green on base → not ready with the reason; nothing stored", async () => {
    const s = await setup(ok("passed", "passed"));
    await runDaemonOnce(s.deps);
    const o = await oracleRow(s.db);
    expect(o).toMatchObject({ status: "not_ready", problems: [{ kind: "green_on_base", id: "AC-1" }], hidden_version: null });
    expect((await s.db.query("select 1 from private.hidden_tests where spec_hash is not null")).rows).toEqual([]);
  });
  it("a change outside the tests → not ready (non_test_change); no output at all → failed", async () => {
    const s = await setup({ ok: true, tests: [], problems: [{ kind: "non_test_change", id: "src/cart.ts" }, { kind: "no_tests", id: "-" }], base: null });
    await runDaemonOnce(s.deps);
    expect(await oracleRow(s.db)).toMatchObject({ status: "not_ready", problems: [{ kind: "non_test_change", id: "src/cart.ts" }, { kind: "no_tests", id: "-" }] });
    const f = await setup(undefined);
    await runDaemonOnce(f.deps);
    expect(await oracleRow(f.db)).toMatchObject({ status: "failed", problems: [{ kind: "not_run", id: "no_output" }] });
  });
});

describe("the writer's task with an approved oracle (D-534)", () => {
  async function approved() {
    const s = await setup(ok("failed", "passed"));
    await runDaemonOnce(s.deps);
    const o = await oracleRow(s.db);
    await s.db.query("update public.oracles set status = 'approved', approved_at = now() where id = 'o_or1'");
    // a repo-wide hidden set exists too; it is not the oracle's
    await s.db.query("select private.add_hidden_tests($1, $2::jsonb, $3, null, now())", [DEMO_REPO_ID, JSON.stringify([{ path: "repo.spec.ts", data: Buffer.from("repo").toString("base64") }]), `sha256:${"9".repeat(64)}`]);
    return { ...s, hash: o.oracle_hash! };
  }
  it("gets exactly the oracle's tests for tree B, the mutation grade, and oracle_hash sealed next to spec_hash", async () => {
    const s = await approved();
    await s.db.query("insert into public.tasks (id, org_id, repo_id, type, agent, text, spec_hash, oracle_hash) values ('t_wr_1', $1, $2, 'bugfix', 'fake:honest-fix', 'Discount over 50', $3, $4)", [DEMO_ORG_ID, DEMO_REPO_ID, SPEC, s.hash]);
    await runDaemonOnce(s.deps);
    const w = s.runs[1]!;
    expect(w.oracle).toBeUndefined();
    expect(w.hidden?.files.map((f) => [f.path, f.data.toString("utf8")])).toEqual([["cart.spec.ts", TEST_A.toString("utf8")], ["u.spec.ts", TEST_U.toString("utf8")]]);
    expect(w.oracleGrade).toEqual({ threshold: ORACLE_MIN_KILL });
    const c = JSON.parse(readFileSync(w.contractPath, "utf8")) as { spec_hash: string; oracle_hash: string; text: string };
    expect(c).toMatchObject({ spec_hash: SPEC, oracle_hash: s.hash });
    // the writer's contract (what its agent reads) has no test of the oracle
    expect(JSON.stringify(c)).not.toContain("applies 10% over 50\", ()");
  });
  it("a task without an oracle keeps the repo-wide set, never an oracle's", async () => {
    const s = await approved();
    await s.db.query("insert into public.tasks (id, org_id, repo_id, type, agent, text) values ('t_wr_2', $1, $2, 'bugfix', 'fake:honest-fix', 'other')", [DEMO_ORG_ID, DEMO_REPO_ID]);
    await runDaemonOnce(s.deps);
    expect(s.runs[1]?.hidden?.files.map((f) => f.path)).toEqual(["repo.spec.ts"]);
    expect(s.runs[1]?.oracleGrade).toBeUndefined();
  });
  it("a stored oracle file that no longer matches its approved sha256 → BLOCKED oracle_tampered, the agent never runs", async () => {
    const s = await approved();
    await s.db.query("update private.hidden_tests set files = jsonb_set(files, '{0,data}', to_jsonb($1::text)) where spec_hash = $2", [Buffer.from("it('AC-1: x', () => {})").toString("base64"), SPEC]);
    await s.db.query("insert into public.tasks (id, org_id, repo_id, type, agent, text, spec_hash, oracle_hash) values ('t_wr_3', $1, $2, 'bugfix', 'fake:honest-fix', 'x', $3, $4)", [DEMO_ORG_ID, DEMO_REPO_ID, SPEC, s.hash]);
    await runDaemonOnce(s.deps);
    expect(s.runs).toHaveLength(1);
    expect((await s.db.query<{ state: string; wait_reason: string }>("select state, wait_reason from public.tasks where id = 't_wr_3'")).rows[0]).toEqual({ state: "BLOCKED", wait_reason: "oracle_tampered" });
  });
  it("an oracle hash that is not approved → BLOCKED oracle_unapproved", async () => {
    const s = await setup(ok("failed", "passed"));
    await runDaemonOnce(s.deps);
    const o = await oracleRow(s.db);
    await s.db.query("insert into public.tasks (id, org_id, repo_id, type, agent, text, spec_hash, oracle_hash) values ('t_wr_4', $1, $2, 'bugfix', 'fake:honest-fix', 'x', $3, $4)", [DEMO_ORG_ID, DEMO_REPO_ID, SPEC, o.oracle_hash]);
    await runDaemonOnce(s.deps);
    expect((await s.db.query<{ state: string; wait_reason: string }>("select state, wait_reason from public.tasks where id = 't_wr_4'")).rows[0]).toEqual({ state: "BLOCKED", wait_reason: "oracle_unapproved" });
  });
});
