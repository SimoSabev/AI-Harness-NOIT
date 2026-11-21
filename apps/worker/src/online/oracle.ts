import { OracleManifest, Spec, jcs, oracleHash, parseOracleApi, sha256Tag } from "@mandat/contract";
import type { OracleProblem, Sha256 } from "@mandat/contract";
import { classifyRedOnBase } from "@mandat/core";
import { appendLedgerOnline } from "@mandat/ledger";
import type { SqlClient } from "@mandat/ledger";
import type { HiddenTests } from "@mandat/verify";
import type { RunTaskOutput } from "../run.js";
import { inTransaction } from "./db.js";
import { apiGaps } from "./oracle-api.js";
import type { Db } from "./db.js";

// D-534 (М1 Х3): the worker's side of the oracle. An oracle task runs like any task; afterwards its exported tests are
// stored as a hidden test set of the spec (D-362 storage, private), never delivered: no changeset, no diff row, no
// branch, nothing in the mirror. The writer's task later gets exactly those files, checked against the approved manifest.

export interface OracleRow { id: string; conversation_id: string; spec_hash: string }

/** the oracle row of an oracle task and the approved spec it was built for */
export async function oracleOfTask(db: Db, taskId: string): Promise<{ oracle: OracleRow; spec: Spec } | null> {
  const r = (await db.query<OracleRow & { approved_spec: unknown; approved_spec_hash: string | null }>(
    "select o.id, o.conversation_id, o.spec_hash, c.approved_spec, c.approved_spec_hash from public.oracles o join public.conversations c on c.id = o.conversation_id where o.task_id = $1",
    [taskId],
  )).rows[0];
  if (!r) return null;
  const spec = Spec.safeParse(r.approved_spec);
  if (!spec.success || r.approved_spec_hash !== r.spec_hash) return null;
  return { oracle: { id: r.id, conversation_id: r.conversation_id, spec_hash: r.spec_hash }, spec: spec.data };
}

export interface OracleOutcome { status: "ready" | "not_ready" | "failed"; oracle_hash: Sha256 | null; problems: OracleProblem[] }

/** the oracle task's run → the oracle (ready / not ready with reasons / failed); its tests stored only when ready */
export async function finishOracle(db: Db, o: { org: string; repo: string; taskId: string; out: RunTaskOutput }): Promise<OracleOutcome> {
  const of = await oracleOfTask(db, o.taskId);
  if (!of) return { status: "failed", oracle_hash: null, problems: [{ kind: "not_run", id: "spec" }] };
  const r = o.out.oracle;
  let outcome: OracleOutcome;
  let manifest: OracleManifest | null = null;
  let files: { path: string; data: string }[] = [];
  // live test 18.11.2026: a run that stopped before the oracle names why (its error code, its stop, the agent's exit)
  const why = (): string => {
    if (o.out.error) return o.out.error.code;
    if (o.out.stopped) return o.out.stopped;
    if (o.out.agentExit !== null && o.out.agentExit !== 0) return `agent_exit_${o.out.agentExit}`;
    const first = o.out.verdict && o.out.verdict.result !== "VERIFIED" ? o.out.verdict.reasons[0] : undefined;
    return first ?? "no_output";
  };
  if (!r || !r.ok) outcome = { status: "failed", oracle_hash: null, problems: [{ kind: "not_run", id: (r && !r.ok ? r.code : why()).slice(0, 100) }] };
  else if (r.problems.length > 0 || r.base === null) outcome = { status: "not_ready", oracle_hash: null, problems: r.problems };
  // D-566: the oracle must fix the public API it tests (its API.md), so writers build to it instead of a guess
  else if (parseOracleApi(r.api ?? "").length === 0) outcome = { status: "not_ready", oracle_hash: null, problems: [{ kind: "no_api", id: "API.md" }] };
  // D-571: every member a test calls on new code must be in API.md, or no writer can build to it
  else if (apiGaps(r.tests, parseOracleApi(r.api ?? ""), r.baseFiles ?? []).length > 0) outcome = { status: "not_ready", oracle_hash: null, problems: apiGaps(r.tests, parseOracleApi(r.api ?? ""), r.baseFiles ?? []).slice(0, 50).map((id) => ({ kind: "no_api" as const, id: id.slice(0, 300) })) };
  else {
    const c = classifyRedOnBase({ spec: of.spec, results: r.base.timedOut ? null : r.base.results });
    files = [...r.tests].sort((a, b) => (a.path < b.path ? -1 : 1)).map((f) => ({ path: f.path, data: f.data.toString("base64") }));
    manifest = OracleManifest.parse({ spec_hash: of.oracle.spec_hash, api: parseOracleApi(r.api ?? ""), hidden_tests: [...r.tests].sort((a, b) => (a.path < b.path ? -1 : 1)).map((f) => ({ path: f.path, sha256: sha256Tag(f.data) })), red_on_base: c.red_on_base });
    outcome = { status: c.ready ? "ready" : "not_ready", oracle_hash: oracleHash(manifest), problems: c.problems };
  }
  await inTransaction(db, async (tx: SqlClient) => {
    let version: number | null = null;
    if (outcome.status === "ready") {
      version = (await tx.query<{ v: number }>("select private.add_oracle_tests($1::uuid, $2, $3::jsonb, $4) as v", [o.repo, of.oracle.spec_hash, JSON.stringify(files), sha256Tag(jcs(files))])).rows[0]?.v ?? null;
    }
    await tx.query(
      "update public.oracles set status = $2, problems = $3::jsonb, red_on_base = $4::jsonb, manifest = $5::jsonb, oracle_hash = $6, hidden_version = $7, updated_at = now() where id = $1",
      [of.oracle.id, outcome.status, JSON.stringify(outcome.problems.slice(0, 200)), JSON.stringify(manifest?.red_on_base ?? []), manifest ? JSON.stringify(manifest) : null, outcome.oracle_hash, version],
    );
    // the ledger keeps the hashes and the counts; never a test's name or content
    await appendLedgerOnline(tx, { org_id: o.org, kind: "oracle_built", task_id: o.taskId, payload: { oracle: of.oracle.id, conversation: of.oracle.conversation_id, spec_hash: of.oracle.spec_hash, oracle_hash: outcome.oracle_hash, status: outcome.status, tests: manifest?.hidden_tests.length ?? 0, problems: outcome.problems.length } });
  });
  return outcome;
}

export type OracleTests = { ok: true; hidden: HiddenTests; oracleHash: string } | { ok: false; reason: "oracle_unapproved" | "oracle_tampered" };

/**
 * The writer's hidden tests when its task carries an approved oracle's hash: the stored files of that oracle, each one
 * checked against the sha256 in the approved manifest (a changed file blocks the task instead of judging it).
 */
export async function oracleTestsFor(db: Db, o: { repo: string; specHash: string | null; oracleHash: string }): Promise<OracleTests> {
  const r = (await db.query<{ manifest: unknown; hidden_version: number | null; spec_hash: string }>(
    "select manifest, hidden_version, spec_hash from public.oracles where repo_id = $1::uuid and oracle_hash = $2 and status = 'approved' order by approved_at desc limit 1",
    [o.repo, o.oracleHash],
  )).rows[0];
  const m = r ? OracleManifest.safeParse(r.manifest) : null;
  if (!r || !m?.success || r.hidden_version === null || oracleHash(m.data) !== o.oracleHash || (o.specHash !== null && r.spec_hash !== o.specHash)) return { ok: false, reason: "oracle_unapproved" };
  const row = (await db.query<{ files: { path: string; data: string }[] }>("select files from private.hidden_tests where repo_id = $1::uuid and version = $2 and spec_hash = $3", [o.repo, r.hidden_version, r.spec_hash])).rows[0];
  const files = (row?.files ?? []).map((f) => ({ path: f.path, data: Buffer.from(f.data, "base64") }));
  const want = new Map(m.data.hidden_tests.map((h) => [h.path, h.sha256]));
  const same = files.length === want.size && files.every((f) => want.get(f.path) === sha256Tag(f.data));
  if (!same) return { ok: false, reason: "oracle_tampered" };
  // D-536: the stored paths are from the repo root (in __hidden__ folders at any depth), so the set has no dir
  return { ok: true, hidden: { dir: "", files }, oracleHash: o.oracleHash };
}
