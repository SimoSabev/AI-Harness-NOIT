import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ADVISOR_SYSTEM, OracleManifest, PLANNER_SYSTEM, PLAN_ROUNDS, SessionSeal, plannerSystem, Verdict, hashJcs, jcs, jobBranch, oracleHash, sha256Tag, specHash } from "@mandat/contract";
import type { Spec } from "@mandat/contract";
import { fakeGitHub } from "@mandat/gate-github";
import type { ModelClient } from "@mandat/research";
import { buildFixture } from "../fixtures.js";
import { repoRoot } from "../testing.js";
import { DEMO_ORG_ID, DEMO_REPO_ID, seedMinimal } from "./seed.js";
import { runDaemonOnce } from "./daemon.js";
import type { DaemonDeps } from "./daemon.js";
import { jobTick } from "./job.js";
import type { JobDeps } from "./job.js";
import { selfFinishTick } from "./self-finish.js";
import { pgliteDb } from "./pglite-db.test-helper.js";
import type { RunTaskInput, RunTaskOutput } from "../run.js";

// D-535 (М1 Х6/Х7 minimum): a job, unit by unit, with a fake planner and a fake agent on PGlite (no Docker). The tests
// prove: the plan is checked and fed back; units run in order on the job branch (main untouched); each unit's tree B
// has only the oracle files of the criteria done so far plus the unchanged ones; the writer never gets a hidden test;
// a failed unit is retried with criterion ids only and parks at the cap; the final check sees the whole oracle and adds
// units only for red criteria; the seal and its ledger row; main moves only after the seal and a person's approval.
const spec: Spec = {
  goal: "Discounts",
  product: "",
  criteria: [
    { id: "AC-1", when: "the subtotal is over 50", shall: "apply 10%", proof: "tests" },
    { id: "AC-2", when: "a coupon is given", shall: "apply it after the 10%", proof: "tests" },
  ],
  unchanged: ["no discount under 50"],
  out_of_scope: [],
  profile: "feature",
};
const SPEC = specHash(spec);
const SECRET_NAME = "applies ten percent over fifty";
const FILES = [
  { path: "packages/shop/test/__hidden__/a.spec.ts", data: Buffer.from(`it("AC-1: ${SECRET_NAME}", () => {});\n`) },
  { path: "packages/shop/test/__hidden__/b.spec.ts", data: Buffer.from(`it("AC-2: coupon after the ten", () => {});\n`) },
  { path: "tests/__hidden__/u.spec.ts", data: Buffer.from(`it("U-1: none under fifty", () => {});\n`) },
];
const MANIFEST = OracleManifest.parse({ spec_hash: SPEC, hidden_tests: FILES.map((f) => ({ path: f.path, sha256: sha256Tag(f.data) })), red_on_base: [{ criterion_id: "AC-1", red: true }, { criterion_id: "AC-2", red: true }] });
const ORACLE = oracleHash(MANIFEST);
const GOOD_PLAN = JSON.stringify({ units: [{ id: "u1", title: "the 10% rule", criteria: ["AC-1"], depends_on: [] }, { id: "u2", title: "coupons", criteria: ["AC-2"], depends_on: ["u1"] }] });

type Ev = { detector: string; phase: 1 | 2; status: "pass" | "fail" | "unknown" | "n/a"; summary: string; data: Record<string, unknown>; source: string; agent_visible: boolean };
const ev = (detector: string, status: Ev["status"], data: Record<string, unknown> = {}): Ev => ({ detector, phase: 2, status, summary: detector, data, source: "sandbox:verify", agent_visible: false });
const verdict = (o: { base: string; task: string; attempt: number; result: "VERIFIED" | "FAILED" | "UNKNOWN"; evidence?: Ev[] }) =>
  Verdict.parse({
    run_id: "r_01JABCDEFGHJKMNPQRSTVWXYZ0", task_id: o.task, attempt: o.attempt, agent: "fake:honest-fix", result: o.result, reasons: o.result === "FAILED" ? ["D5:hidden_fail:h00000000"] : [],
    evidence: [ev("D1.base_tests", "pass"), ...(o.evidence ?? [])],
    contract_hash: `sha256:${"a".repeat(64)}`, base_sha: o.base, tree_sha: "b".repeat(40), diff_hash: `sha256:${"c".repeat(64)}`, integrity: "ok",
    usage: { usd: 0.1, input_tokens: 1, output_tokens: 1, requests: 1 }, timings_ms: { provision: 0, install: 0, agent: 0, export: 0, verify: 0, verdict: 0, total: 0 }, created_at: "2026-11-17T00:00:00.000Z",
  });
const patchFor = (name: string, body = name) => `diff --git a/${name} b/${name}\nnew file mode 100644\n--- /dev/null\n+++ b/${name}\n@@ -0,0 +1 @@\n+${body}\n`;
type Contract = { task_id: string; base_commit: string; text: string; attempt?: number; oracle_hash?: string };
type Outcome = { result: "VERIFIED" | "FAILED" | "UNKNOWN"; evidence?: Ev[]; notes?: string; patch?: string; body?: string };

async function setup(o: { plans: string[]; outcome: (c: Contract, n: number) => Outcome; divisible?: "yes" | "no"; during?: (n: number) => Promise<void> }) {
  const home = mkdtempSync(path.join(os.tmpdir(), "mandat-job-"));
  const fx = buildFixture({ repoRoot, mandatHome: home, force: false, name: "demo-shop" });
  const db = await pgliteDb();
  await seedMinimal(db, { remoteUrl: `file://${fx.mirror}` });
  await db.query(
    "insert into public.conversations (id, org_id, repo_id, agent, budget_usd, expires_at, status, spec, spec_hash, spec_ready, approved_spec, approved_spec_hash, approved_at) values ('c_job1', $1, $2, 'fake:honest-fix', 0.5, now() + interval '1 hour', 'idle', $3::jsonb, $4, true, $3::jsonb, $4, now())",
    [DEMO_ORG_ID, DEMO_REPO_ID, JSON.stringify(spec), SPEC],
  );
  const files = FILES.map((f) => ({ path: f.path, data: f.data.toString("base64") }));
  const v = (await db.query<{ v: number }>("select private.add_oracle_tests($1::uuid, $2, $3::jsonb, $4) as v", [DEMO_REPO_ID, SPEC, JSON.stringify(files), sha256Tag(jcs(files))])).rows[0]?.v;
  await db.query("insert into public.oracles (id, org_id, repo_id, conversation_id, spec_hash, status, manifest, oracle_hash, hidden_version, approved_at) values ('o_job1', $1, $2, 'c_job1', $3, 'approved', $4::jsonb, $5, $6, now())", [DEMO_ORG_ID, DEMO_REPO_ID, SPEC, JSON.stringify(MANIFEST), ORACLE, v]);
  await db.query("insert into public.jobs (id, org_id, repo_id, conversation_id, spec_hash, oracle_hash, type, agent) values ('j_t1', $1, $2, 'c_job1', $3, $4, 'bugfix', 'fake:honest-fix')", [DEMO_ORG_ID, DEMO_REPO_ID, SPEC, ORACLE]);
  if (o.divisible) await db.query("update public.conversations set axes = $1::jsonb where id = 'c_job1'", [JSON.stringify({ code: "existing", reference: "none", divisible: o.divisible, proof: ["tests"], risk: { level: "low", outward: false }, size: "m" })]);
  const asked: string[] = [];
  const systems: string[] = [];
  const client: ModelClient = {
    channel: { id: "chat:fake", label: "fake", kind: "local", model: "demo", enabled: true, health: "ok", quality: 0.8, cost: 0.5 },
    complete: (r) => {
      asked.push(r.user);
      systems.push(r.system ?? "");
      return Promise.resolve({ text: o.plans[Math.min(asked.length - 1, o.plans.length - 1)] ?? "", inputTokens: 1, outputTokens: 1, usd: 0 });
    },
  };
  const jd: JobDeps = { db, modelFor: () => ({ ok: true, client }) };
  const runs: RunTaskInput[] = [];
  const contracts: Contract[] = [];
  const deps: DaemonDeps = {
    db, home, gh: fakeGitHub({ repos: { "mandat-demo/shop": {} } }), ghRepo: "mandat-demo/shop",
    run: async (i): Promise<RunTaskOutput> => {
      runs.push(i);
      const n = runs.length;
      const c = JSON.parse(readFileSync(i.contractPath, "utf8")) as Contract;
      contracts.push(c);
      const out = o.outcome(c, n);
      const runDir = path.join(home, "runs", `r${n}`);
      mkdirSync(path.join(runDir, "export"), { recursive: true });
      writeFileSync(path.join(runDir, "export", "diff.patch"), patchFor(out.patch ?? `unit-${n}.txt`, out.body));
      // a second task running while this one runs (two writers at once, each in its own copy)
      if (o.during) await o.during(n);
      if (out.notes) writeFileSync(path.join(runDir, "notes.txt"), out.notes);
      const attempt = Number(/-a(\d+)\.json$/.exec(i.contractPath)?.[1] ?? 1);
      return { verdict: verdict({ base: c.base_commit, task: c.task_id, attempt, result: out.result, ...(out.evidence ? { evidence: out.evidence } : {}) }), exit: 0, runDir, ledger: { from: 1, to: 3 }, agentExit: 0 };
    },
  };
  const git = (...a: string[]) => execFileSync("git", ["--git-dir", fx.mirror, ...a], { encoding: "utf8" }).trim();
  const job = async () => (await db.query<{ status: string; question: string | null; head_sha: string | null; base_sha: string | null; seal: unknown; seal_hash: string | null; plan_hash: string | null; converge_round: number; final_task_id: string | null }>("select status, question, head_sha, base_sha, seal, seal_hash, plan_hash, converge_round, final_task_id from public.jobs where id = 'j_t1'")).rows[0]!;
  const units = async () => (await db.query<{ unit_id: string; status: string; criteria: string[]; task_id: string | null; handoff: { done: string } | null; failing: string[]; relands: number; rescues: number }>("select unit_id, status, criteria, task_id, handoff, failing, relands, rescues from public.job_units where job_id = 'j_t1' order by ord")).rows;
  const ledger = async (kind: string) => (await db.query<{ payload_jcs: string }>("select payload_jcs from public.ledger where kind = $1 order by seq", [kind])).rows.map((r) => JSON.parse(r.payload_jcs) as Record<string, unknown>);
  return { db, deps, jd, runs, contracts, fx, git, job, units, ledger, asked, systems };
}
const handoff = (done: string) => `MEMORY: nothing\nHANDOFF: ${JSON.stringify({ done, risks: ["rounding"] })}\n`;
const d5fail = (...ids: string[]) => [ev("D5.hidden", "fail", { failed: ids.map((id) => `packages/shop/test/__hidden__/x.spec.ts > ${id}: ${SECRET_NAME}`) })];

describe("the planner (D-535)", () => {
  it("a refused plan comes back to the planner with its problems; the good one is stored with plan_built (hashes and counts)", async () => {
    const bad = JSON.stringify({ units: [{ id: "u1", title: "only one", criteria: ["AC-1"], depends_on: [] }] });
    const s = await setup({ plans: [bad, GOOD_PLAN], outcome: () => ({ result: "VERIFIED" }) });
    const r = await jobTick(s.jd);
    expect(r.planned).toEqual(["j_t1"]);
    expect(s.asked[1]).toContain("uncovered_criterion: AC-2");
    expect((await s.units()).map((u) => [u.unit_id, u.criteria])).toEqual([["u1", ["AC-1"]], ["u2", ["AC-2"]]]);
    const j = await s.job();
    expect(j.status).toBe("running");
    expect(s.git("rev-parse", `refs/heads/${jobBranch("j_t1")}`)).toBe(s.fx.sha);
    const [pb] = await s.ledger("plan_built");
    expect(pb).toEqual({ job: "j_t1", spec_hash: SPEC, oracle_hash: ORACLE, plan_hash: j.plan_hash, units: 2, rounds: 2, mode: "single", waves: 2 });
    expect(JSON.stringify(pb)).not.toContain("coupons");
  });
  it("no valid plan after the rounds → the job parks with a question", async () => {
    const s = await setup({ plans: ["not json at all"], outcome: () => ({ result: "VERIFIED" }) });
    expect((await jobTick(s.jd)).parked).toEqual(["j_t1"]);
    expect(s.asked).toHaveLength(PLAN_ROUNDS);
    const j = await s.job();
    expect(j.status).toBe("parked");
    expect(j.question).toContain("bad_schema");
  });
});

describe("units, final check, seal and delivery (D-535)", () => {
  it("runs units in order on the job branch with the allowed oracle files, seals, and merges only after approval", async () => {
    const s = await setup({ plans: [GOOD_PLAN], outcome: (c) => ({ result: "VERIFIED", notes: handoff(`did ${c.task_id}`) }) });
    await jobTick(s.jd); // plan
    await jobTick(s.jd); // u1's task
    expect((await s.units())[0]?.status).toBe("running");
    await runDaemonOnce(s.deps);
    // unit 1: base = branch head (= main now), tree B has AC-1 + U-1 only, the writer's text has no test
    expect(s.contracts[0]?.base_commit).toBe(s.fx.sha);
    expect(s.runs[0]?.hidden?.files.map((f) => f.path)).toEqual(["packages/shop/test/__hidden__/a.spec.ts", "tests/__hidden__/u.spec.ts"]);
    expect(s.runs[0]?.applyFiles).toBeUndefined();
    expect(s.runs[0]?.oracleGrade).toBeUndefined();
    expect(s.contracts[0]?.text).toContain("AC-1: WHEN the subtotal is over 50");
    expect(s.contracts[0]?.text).not.toContain(SECRET_NAME);
    expect(s.contracts[0]?.oracle_hash).toBe(ORACLE);
    const head1 = s.git("rev-parse", `refs/heads/${jobBranch("j_t1")}`);
    expect(head1).not.toBe(s.fx.sha);
    // D-540: the unit's commit is named after the unit, not after the first line of its instructions
    expect(s.git("log", "-1", "--format=%s", head1)).toBe("fix: the 10% rule");
    expect(s.git("rev-parse", "main")).toBe(s.fx.sha);
    let us = await s.units();
    expect(us[0]).toMatchObject({ status: "passed", handoff: { done: `did ${us[0]!.task_id}` } });
    for (const t of ["changesets", "deliveries"]) expect((await s.db.query(`select 1 from public.${t}`)).rows).toEqual([]);
    await jobTick(s.jd); // u2's task: a fresh task with u1's handoff
    await runDaemonOnce(s.deps);
    expect(s.contracts[1]?.base_commit).toBe(head1);
    expect(s.contracts[1]?.task_id).not.toBe(s.contracts[0]?.task_id);
    expect(s.contracts[1]?.text).toContain(`[u1] done: did ${us[0]!.task_id}`);
    expect(s.runs[1]?.hidden?.files.map((f) => f.path)).toEqual(["packages/shop/test/__hidden__/a.spec.ts", "packages/shop/test/__hidden__/b.spec.ts", "tests/__hidden__/u.spec.ts"]);
    us = await s.units();
    expect(us.map((u) => u.status)).toEqual(["passed", "passed"]);
    const head2 = s.git("rev-parse", `refs/heads/${jobBranch("j_t1")}`);
    await jobTick(s.jd); // the final check
    expect((await s.job()).status).toBe("converging");
    await runDaemonOnce(s.deps);
    expect(s.contracts[2]?.base_commit).toBe(s.fx.sha);
    expect(s.runs[2]?.applyFiles?.map((f) => f.path).sort()).toEqual(["unit-1.txt", "unit-2.txt"]);
    expect(s.runs[2]?.hidden?.files).toHaveLength(3);
    expect(s.runs[2]?.oracleGrade).toEqual({ threshold: 0.6 });
    // no writer ever got a hidden file in its own tree: hidden goes to tree B only, applyFiles only to the final check
    for (const r of s.runs.slice(0, 2)) expect(r.applyFiles).toBeUndefined();
    await jobTick(s.jd); // seal
    const j = await s.job();
    expect(j.status).toBe("sealed");
    const seal = SessionSeal.parse(j.seal);
    expect(seal).toMatchObject({ spec_hash: SPEC, oracle_hash: ORACLE, profile: "feature", verdict: "VERIFIED", result_ref: head2, unchecked: [] });
    expect(seal.ledger_head).toMatch(/^sha256:/);
    expect(j.seal_hash).toBe(hashJcs(seal));
    expect(await s.ledger("session_sealed")).toEqual([{ job: "j_t1", seal_hash: j.seal_hash, spec_hash: SPEC, oracle_hash: ORACLE, verdict: "VERIFIED", result_ref: head2, unchecked: 0 }]);
    // sealed is not enough: main moves only after a person approves
    await jobTick(s.jd);
    expect(s.git("rev-parse", "main")).toBe(s.fx.sha);
    await s.db.query("update public.jobs set status = 'approved', approved_at = now() where id = 'j_t1'");
    expect((await jobTick(s.jd)).merged).toEqual(["j_t1"]);
    expect(s.git("rev-parse", "main")).toBe(head2);
    expect((await s.job()).status).toBe("delivered");
    expect((await s.ledger("delivered")).at(-1)).toMatchObject({ job: "j_t1", merge_sha: head2 });
  });

  it("a failed unit is retried with the failing criterion ids only; at the cap the job parks with a question", async () => {
    const s = await setup({ plans: [GOOD_PLAN], outcome: () => ({ result: "FAILED", evidence: d5fail("AC-1", "U-1") }) });
    await jobTick(s.jd);
    await jobTick(s.jd);
    await runDaemonOnce(s.deps);
    expect((await s.units())[0]).toMatchObject({ status: "failed", failing: ["AC-1"] });
    expect(s.git("rev-parse", `refs/heads/${jobBranch("j_t1")}`)).toBe(s.fx.sha);
    expect((await jobTick(s.jd)).parked).toEqual([]); // self-finish will retry: the job waits
    for (let k = 0; k < 3; k++) {
      await selfFinishTick(s.db, { now: new Date() });
      await runDaemonOnce(s.deps);
    }
    const notes = (await s.db.query<{ text: string }>("select text from public.task_activities where kind = 'self' order by id")).rows.map((r) => r.text);
    expect(notes.length).toBe(2);
    for (const n of notes) {
      expect(n).toContain("AC-1");
      expect(n).not.toContain(SECRET_NAME);
      expect(n).not.toContain("U-1");
    }
    expect(s.contracts[1]?.text).toContain("Note from Mandat");
    expect(s.contracts[1]?.text).not.toContain(SECRET_NAME);
    expect(s.runs).toHaveLength(3);
    // D-542: at the cap a model advises (it never sees a test) and two fresh tries start at once, one attempt each
    expect((await jobTick(s.jd)).started).toEqual(["j_t1"]);
    expect(s.systems.at(-1)).toBe(ADVISOR_SYSTEM);
    expect(s.asked.at(-1)).toContain("Failing criteria: AC-1");
    expect(s.asked.at(-1)).not.toContain(SECRET_NAME);
    const tries = (await s.db.query<{ id: string; text: string; attempts_max: number }>("select id, text, attempts_max from public.tasks where job_id = 'j_t1' and unit_id = 'u1' order by id")).rows;
    expect(tries).toHaveLength(3);
    for (const t of tries.slice(1)) {
      expect(t.text).toContain("Advice from a reviewer");
      expect(t.attempts_max).toBe(1);
    }
    expect(tries.filter((t) => t.text.includes("different approach"))).toHaveLength(1);
    expect((await s.units())[0]).toMatchObject({ status: "running", rescues: 1 });
    expect((await s.ledger("unit_rescued"))[0]).toMatchObject({ job: "j_t1", unit: "u1", tries: 2, rescues: 1 });
    await runDaemonOnce(s.deps);
    await runDaemonOnce(s.deps);
    await selfFinishTick(s.db, { now: new Date() });
    await runDaemonOnce(s.deps);
    expect(s.runs).toHaveLength(5); // a rescue try is never retried by itself
    expect((await jobTick(s.jd)).parked).toEqual(["j_t1"]);
    expect((await s.units())[0]?.status).toBe("parked");
    const j = await s.job();
    expect(j.question).toContain("Unit u1");
    expect(j.question).toContain("AC-1");
    expect(j.question).not.toContain(SECRET_NAME);
  });

  it("a rescue try that passes lands; a second one that passes too does not land again (D-542)", async () => {
    const s = await setup({ plans: [GOOD_PLAN], outcome: (_c, n) => (n <= 3 ? { result: "FAILED", evidence: d5fail("AC-1") } : { result: "VERIFIED" }) });
    await jobTick(s.jd);
    await jobTick(s.jd);
    await runDaemonOnce(s.deps);
    for (let k = 0; k < 2; k++) {
      await selfFinishTick(s.db, { now: new Date() });
      await runDaemonOnce(s.deps);
    }
    await jobTick(s.jd); // rescue
    await runDaemonOnce(s.deps);
    await runDaemonOnce(s.deps);
    const head = s.git("rev-parse", `refs/heads/${jobBranch("j_t1")}`);
    expect(s.git("rev-list", "--count", `${s.fx.sha}..${head}`)).toBe("1");
    expect((await s.units())[0]?.status).toBe("passed");
    const loser = (await s.db.query<{ state: string; wait_reason: string | null }>("select state, wait_reason from public.tasks where job_id = 'j_t1' and unit_id = 'u1' order by id")).rows.at(-1);
    expect(loser).toEqual({ state: "CLOSED", wait_reason: "another_try_won" });
    expect((await jobTick(s.jd)).started).toEqual(["j_t1"]); // u2 goes on
  });
});

describe("a parked unit does not stop the rest of the work (D-542)", () => {
  it("in waves, work that does not need the parked unit goes on; the job parks only when nothing else can move", async () => {
    const plan = JSON.stringify({ units: [{ id: "u1", title: "the 10% rule", criteria: ["AC-1"], depends_on: [] }, { id: "u2", title: "coupons", criteria: ["AC-2"], depends_on: [] }, { id: "u3", title: "coupon texts", criteria: ["AC-2"], depends_on: ["u2"] }] });
    const s = await setup({ plans: [plan], divisible: "yes", outcome: (c) => (c.text.includes("This unit (u1)") ? { result: "FAILED", evidence: d5fail("AC-1") } : { result: "VERIFIED" }) });
    await jobTick(s.jd);
    await jobTick(s.jd); // u1 and u2
    await runDaemonOnce(s.deps); // u1 fails
    for (let k = 0; k < 2; k++) {
      await selfFinishTick(s.db, { now: new Date() });
      await runDaemonOnce(s.deps); // u1 again (the oldest task)
    }
    await jobTick(s.jd); // u1 rescued
    await runDaemonOnce(s.deps); // u2 passes
    await jobTick(s.jd); // u3 starts
    await runDaemonOnce(s.deps); // try a fails
    await runDaemonOnce(s.deps); // try b fails
    expect((await jobTick(s.jd)).parked).toEqual([]);
    expect((await s.units()).map((u) => [u.unit_id, u.status])).toEqual([["u1", "parked"], ["u2", "passed"], ["u3", "running"]]);
    expect((await s.job()).status).toBe("running");
    await runDaemonOnce(s.deps); // u3 passes
    expect((await jobTick(s.jd)).parked).toEqual(["j_t1"]);
    expect((await s.job()).question).toContain("Unit u1");
  });

  it("the final check adds units only for the criteria still red", async () => {
    const s = await setup({ plans: [GOOD_PLAN], outcome: (c) => (c.text.startsWith("Final check") ? { result: "FAILED", evidence: d5fail("AC-2") } : { result: "VERIFIED" }) });
    for (let k = 0; k < 2; k++) {
      await jobTick(s.jd);
      if (k === 0) await jobTick(s.jd);
      await runDaemonOnce(s.deps);
    }
    await jobTick(s.jd); // final task
    await runDaemonOnce(s.deps);
    expect((await jobTick(s.jd)).started).toEqual(["j_t1"]);
    const us = await s.units();
    expect(us.map((u) => [u.unit_id, u.criteria, u.status])).toEqual([["u1", ["AC-1"], "passed"], ["u2", ["AC-2"], "passed"], ["fix-1", ["AC-2"], "pending"]]);
    const j = await s.job();
    expect(j).toMatchObject({ status: "running", converge_round: 1, final_task_id: null });
  });
});

// D-541 (М2 Х5/Х6): a team only where the work divides
const PAR_PLAN = JSON.stringify({ units: [{ id: "u1", title: "the 10% rule", criteria: ["AC-1"], depends_on: [] }, { id: "u2", title: "coupons", criteria: ["AC-2"], depends_on: [] }] });
describe("waves: units that do not depend on each other run at once (D-541)", () => {
  it("work that does not divide keeps the one writer and the М1 planner", async () => {
    const s = await setup({ plans: [PAR_PLAN], divisible: "no", outcome: () => ({ result: "VERIFIED" }) });
    await jobTick(s.jd);
    expect(s.systems[0]).toBe(PLANNER_SYSTEM);
    expect((await s.db.query<{ mode: string }>("select mode from public.jobs where id = 'j_t1'")).rows[0]?.mode).toBe("single");
    await jobTick(s.jd);
    expect((await s.units()).map((u) => u.status)).toEqual(["running", "pending"]);
  });
  it("divisible work: both units start, run on the same base, and the later one lands on the moved branch", async () => {
    let s: Awaited<ReturnType<typeof setup>> | null = null;
    s = await setup({ plans: [PAR_PLAN], divisible: "yes", outcome: () => ({ result: "VERIFIED" }), during: async (n) => { if (n === 1 && s) await runDaemonOnce(s.deps); } });
    await jobTick(s.jd);
    expect(s.systems[0]).toBe(plannerSystem("waves"));
    expect((await s.ledger("plan_built"))[0]).toMatchObject({ mode: "waves", waves: 1 });
    expect((await jobTick(s.jd)).started).toEqual(["j_t1"]);
    expect((await s.units()).map((u) => u.status)).toEqual(["running", "running"]);
    await runDaemonOnce(s.deps); // runs u1, and u2 while u1 runs
    expect(s.contracts.map((c) => c.base_commit)).toEqual([s.fx.sha, s.fx.sha]);
    expect((await s.units()).map((u) => u.status)).toEqual(["passed", "passed"]);
    const head = s.git("rev-parse", `refs/heads/${jobBranch("j_t1")}`);
    expect(s.git("rev-list", "--count", `${s.fx.sha}..${head}`)).toBe("2");
    expect(s.git("ls-tree", "--name-only", head).split("\n")).toEqual(expect.arrayContaining(["unit-1.txt", "unit-2.txt"]));
    expect(s.git("rev-parse", "main")).toBe(s.fx.sha);
    await jobTick(s.jd);
    expect((await s.job()).status).toBe("converging");
  });
  it("two writers made the very same change: the later one is already there and passes without a second commit", async () => {
    let s: Awaited<ReturnType<typeof setup>> | null = null;
    s = await setup({ plans: [PAR_PLAN], divisible: "yes", outcome: () => ({ result: "VERIFIED", patch: "same.txt" }), during: async (n) => { if (n === 1 && s) await runDaemonOnce(s.deps); } });
    await jobTick(s.jd);
    await jobTick(s.jd);
    await runDaemonOnce(s.deps);
    expect((await s.units()).map((u) => u.status)).toEqual(["passed", "passed"]);
    const head = s.git("rev-parse", `refs/heads/${jobBranch("j_t1")}`);
    expect(s.git("rev-list", "--count", `${s.fx.sha}..${head}`)).toBe("1");
  });
  it("a unit that no longer applies onto the moved branch is built again on the new head, with a ledger row", async () => {
    let s: Awaited<ReturnType<typeof setup>> | null = null;
    s = await setup({ plans: [PAR_PLAN], divisible: "yes", outcome: (_c, n) => ({ result: "VERIFIED", patch: n <= 2 ? "same.txt" : `unit-${n}.txt`, body: `writer ${n}` }), during: async (n) => { if (n === 1 && s) await runDaemonOnce(s.deps); } });
    await jobTick(s.jd);
    await jobTick(s.jd);
    await runDaemonOnce(s.deps);
    let us = await s.units();
    expect(us.map((u) => u.status)).toEqual(["blocked", "passed"]);
    const moved = s.git("rev-parse", `refs/heads/${jobBranch("j_t1")}`);
    await jobTick(s.jd);
    us = await s.units();
    expect(us[0]).toMatchObject({ status: "running", relands: 1 });
    expect((await s.ledger("unit_relanded"))[0]).toMatchObject({ job: "j_t1", unit: "u1", relands: 1 });
    await runDaemonOnce(s.deps);
    expect(s.contracts[2]?.base_commit).toBe(moved);
    expect(s.contracts[2]?.task_id).not.toBe(s.contracts[0]?.task_id);
    expect((await s.units()).map((u) => u.status)).toEqual(["passed", "passed"]);
  });
});
