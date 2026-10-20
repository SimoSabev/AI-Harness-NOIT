import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { effectiveLevel, hashJcs, parseMandatYml, repoConfigFromPolicy, sealContract } from "@mandat/contract";
import type { Contract, MandatPolicy, TaskType, Verdict } from "@mandat/contract";
import { decideDelivery, ladderStepFor } from "@mandat/core";
import type { LadderState } from "@mandat/core";
import { appendLedgerOnline } from "@mandat/ledger";
import type { SqlClient } from "@mandat/ledger";
import { autoMerge, deliver } from "@mandat/gate-github";
import type { GitHubPort } from "@mandat/gate-github";
import { readAtBase } from "@mandat/verify";
import { runTask } from "../run.js";
import type { RunTaskInput, RunTaskOutput } from "../run.js";
import { inTransaction } from "./db.js";
import type { Db } from "./db.js";

// Демо промпт т. 5.8 + 8.1 (D-275, D-280): the online worker. One task at a time per process; every state change +
// ledger row (+ outbox row) in one transaction. Effects on GitHub go through the GitHubPort (fakeGitHub offline).

export interface DaemonDeps {
  db: Db;
  home: string;
  gh: GitHubPort;
  /** GitHub repo name for the demo (fakeGitHub offline) */
  ghRepo: string;
  broadcast?: (topic: string, event: string, payload: Record<string, unknown>) => Promise<void>;
  run?: (i: RunTaskInput) => Promise<RunTaskOutput>;
  runInternals?: RunTaskInput["internals"];
  docker?: RunTaskInput["docker"];
  now?: () => Date;
  log?: (line: string) => void;
}

interface TaskRow {
  id: string;
  org_id: string;
  repo_id: string;
  type: TaskType;
  agent: string;
  text: string;
  state: string;
  attempt: number;
  remote_url: string;
  full_name: string;
  ruleset_strict: boolean;
  is_demo: boolean;
}

/** Contract from the policy on the trusted base (К-1). Pure. */
export function contractForTask(t: { id: string; type: TaskType; text: string; agent: string }, policy: MandatPolicy, baseSha: string): Contract {
  const rc = repoConfigFromPolicy(policy);
  if (!rc.ok) throw new Error(`unsupported runner ${rc.detail}`);
  const tt = policy.task_types[t.type];
  if (!tt) throw new Error(`task type ${t.type} not in the policy`);
  return sealContract({
    task_id: t.id, type: t.type, agent: t.agent === "codex" || t.agent.startsWith("fake-codex:") ? "codex" : "claude", text: t.text, base_commit: baseSha, scan_facts_hash: null,
    allowed_paths: tt.allowed_paths, may_change_tests: tt.may_change_tests, must_pass: [], hidden_tests: null, risk_cap: policy.risk_classes[tt.risk_class]?.level_cap ?? 1,
    memory_hash: null, channel: { label: "anthropic-key-main", kind: "api_key", model: "claude-sonnet-5-5" }, security: { max_file_mb: policy.security.max_file_mb, max_diff_mb: policy.security.max_diff_mb, max_files: policy.security.max_files },
    repo_config: rc.config,
  });
}

const boardPayload = (t: { id: string; seq: number; state: string; result: string | null; level: number | null; wait_reason: string | null; usd: number; minutes: number }) => ({
  task_id: t.id, seq: t.seq, state: t.state, verdict: t.result, level: t.level, wait_reason: t.wait_reason, usd: t.usd, minutes: t.minutes,
});

async function setState(tx: SqlClient, t: TaskRow, state: string, extra: Record<string, unknown> = {}): Promise<number> {
  const cols = Object.keys(extra);
  const sets = cols.map((c, k) => `${c} = $${k + 3}`).join(", ");
  const r = await tx.query<{ seq: string }>(`update public.tasks set state = $2, state_entered_at = now(), updated_at = now(), seq = seq + 1${sets ? `, ${sets}` : ""} where id = $1 returning seq`, [t.id, state, ...cols.map((c) => extra[c])]);
  return Number(r.rows[0]?.seq ?? 0);
}

/** Runs one CREATED task to its gate decision. */
export async function processTask(d: DaemonDeps, taskId: string): Promise<{ state: string; verdict: Verdict | null }> {
  const log = d.log ?? (() => undefined);
  const now = d.now ?? (() => new Date());
  const q = await d.db.query<TaskRow>(
    `select t.id, t.org_id::text as org_id, t.repo_id::text as repo_id, t.type, t.agent, t.text, t.state, t.attempt, r.remote_url, r.full_name, r.ruleset_strict, o.is_demo
       from public.tasks t join public.repos r on r.id = t.repo_id join public.orgs o on o.id = t.org_id where t.id = $1`,
    [taskId],
  );
  const t = q.rows[0];
  if (!t) throw new Error(`no task ${taskId}`);
  const bc = async (state: string, seq: number, extra: { result?: string | null; level?: number | null; wait_reason?: string | null; usd?: number; minutes?: number } = {}) => {
    const p = boardPayload({ id: t.id, seq, state, result: extra.result ?? null, level: extra.level ?? null, wait_reason: extra.wait_reason ?? null, usd: extra.usd ?? 0, minutes: extra.minutes ?? 0 });
    await d.broadcast?.(`org:${t.org_id}:board`, "task", p).catch(() => undefined);
    await d.broadcast?.(`task:${t.id}`, "state", p).catch(() => undefined);
  };
  // CONTRACTED: the policy and the base come from Mandat's mirror (the trusted remote of the repo)
  const mirror = t.remote_url.replace(/^file:\/\//, "");
  const tmpHome = os.tmpdir();
  const baseSha = (await (await import("@mandat/export")).cleanGit({ tmpHome }).run(["rev-parse", "--verify", "--end-of-options", "HEAD^{commit}"], { cwd: mirror })).stdout.toString("utf8").trim();
  const yml = await readAtBase({ mirror, baseSha, file: ".mandat.yml", tmpHome });
  const parsed = yml ? parseMandatYml(yml.toString("utf8")) : null;
  if (!parsed?.ok) {
    const seq = await inTransaction(d.db, async (tx) => {
      const s = await setState(tx, t, "BLOCKED", { wait_reason: "policy_missing" });
      await appendLedgerOnline(tx, { org_id: t.org_id, kind: "task_stopped", task_id: t.id, payload: { reason: "policy_missing" } });
      return s;
    });
    await bc("BLOCKED", seq, { wait_reason: "policy_missing" });
    return { state: "BLOCKED", verdict: null };
  }
  const contract = contractForTask(t, parsed.policy, baseSha);
  const dir = path.join(d.home, "contracts");
  mkdirSync(dir, { recursive: true });
  const cfile = path.join(dir, `${t.id}-a${t.attempt}.json`);
  writeFileSync(cfile, JSON.stringify(contract, null, 2) + "\n");
  let seq = await inTransaction(d.db, async (tx) => {
    const s = await setState(tx, t, "RUNNING");
    await appendLedgerOnline(tx, { org_id: t.org_id, kind: "task_created", task_id: t.id, payload: { task_id: t.id, contract_hash: contract.contract_hash, agent: t.agent } });
    return s;
  });
  await bc("RUNNING", seq);
  log(`[daemon] ${t.id}: running ${t.agent}`);
  const t0 = now().getTime();
  const out = await (d.run ?? runTask)({
    home: d.home, contractPath: cfile, agent: t.agent as RunTaskInput["agent"], keep: false, json: true, mirror: path.basename(mirror, ".git"),
    ...(d.docker ? { docker: d.docker } : {}), ...(d.runInternals ? { internals: d.runInternals } : {}),
  });
  const minutes = Math.round(((now().getTime() - t0) / 60000) * 100) / 100;
  const v = out.verdict;
  if (!v) {
    seq = await inTransaction(d.db, async (tx) => {
      const s = await setState(tx, t, "BLOCKED", { wait_reason: `infra:${out.error?.code ?? "error"}`, minutes });
      await appendLedgerOnline(tx, { org_id: t.org_id, kind: "task_stopped", task_id: t.id, payload: { reason: out.error?.code ?? "error" } });
      return s;
    });
    await bc("BLOCKED", seq, { wait_reason: `infra:${out.error?.code ?? "error"}` });
    return { state: "BLOCKED", verdict: null };
  }
  // level: ladder (repo, type, agent) × risk cap × our harness cap 3 × ruleset × D7 assumed pass after VERIFY_1 (т. 3.3)
  const lad = await d.db.query<{ level: number; s_up: number; s_down: number; pinned: boolean }>("select level, s_up, s_down, pinned from public.ladder_state where repo_id = $1 and task_type = $2 and agent = $3", [t.repo_id, t.type, t.agent]);
  const ladder: LadderState = lad.rows[0] ? { level: lad.rows[0].level as 0 | 1 | 2 | 3, s_up: Number(lad.rows[0].s_up), s_down: Number(lad.rows[0].s_down), pinned: lad.rows[0].pinned } : { level: 0, s_up: 0, s_down: 0, pinned: false };
  const lvl = effectiveLevel({ ladder: ladder.level, riskCap: contract.risk_cap, result: v.result, mode: "full", levelCap: 3, rulesetStrict: t.ruleset_strict, d7: "pass" });
  const action = decideDelivery({ result: v.result, effectiveLevel: lvl.level, mode: "full", origin: "mandat" });
  const diffFile = out.runDir ? path.join(out.runDir, "export", "diff.patch") : null;
  const diffPatch = diffFile && existsSync(diffFile) ? readFileSync(diffFile) : Buffer.alloc(0);
  const usd = v.usage.usd;
  const needsHuman = v.result !== "FAILED" && (action.kind === "draft_pr" || action.kind === "hold" || action.kind === "branch_only");
  const requires2fa = v.result === "VERIFIED" && lvl.level === 1;
  const changesetId = await inTransaction(d.db, async (tx) => {
    const cs = await tx.query<{ id: string }>(
      "insert into public.changesets (org_id, task_id, attempt, base_sha, tree_sha, diff_hash, mode, integrity, effective_level, requires_second_factor, approval_needed, risk_class) values ($1::uuid, $2, $3, $4, $5, $6, 'full', $7, $8, $9, $10, $11) returning id::text as id",
      [t.org_id, t.id, t.attempt, v.base_sha, v.tree_sha, v.diff_hash, v.integrity, lvl.level, requires2fa, needsHuman, parsed.policy.task_types[t.type]?.risk_class ?? null],
    );
    const csId = cs.rows[0]?.id as string;
    // E3а: the diff for the card (approver+ by RLS); only the non-redacted patch, which exists only without a secret hit
    if (diffPatch.length > 0 && diffPatch.length <= 1048576) await tx.query("insert into public.changeset_diffs (changeset_id, org_id, diff) values ($1::uuid, $2::uuid, $3)", [csId, t.org_id, diffPatch.toString("utf8")]);
    const vr = await tx.query<{ id: string }>(
      "insert into public.verdicts (org_id, task_id, changeset_id, run_id, attempt, mode, agent, result, reasons, base_sha, tree_sha, config_hash, verdict_hash) values ($1::uuid, $2, $3::uuid, $4, $5, 'full', $6, $7, $8::jsonb, $9, $10, $11, $12) returning id::text as id",
      [t.org_id, t.id, csId, v.run_id, t.attempt, t.agent, v.result, JSON.stringify(v.reasons), v.base_sha, v.tree_sha, contract.config_hash, hashJcs(v)],
    );
    for (const e of v.evidence) {
      await tx.query("insert into public.evidence (org_id, verdict_id, detector, phase, status, summary, data, source, signature) values ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::jsonb, $8, $9)", [t.org_id, vr.rows[0]?.id, e.detector, e.phase, e.status, e.summary, JSON.stringify(e.data), e.source, e.signature ?? null]);
    }
    await appendLedgerOnline(tx, { org_id: t.org_id, kind: "verdict", task_id: t.id, payload: { run_id: v.run_id, result: v.result, reasons: v.reasons, verdict_hash: hashJcs(v) } });
    await appendLedgerOnline(tx, { org_id: t.org_id, kind: "gated", task_id: t.id, payload: { action: action.kind, level: lvl.level, reasons: lvl.reasons } });
    const state = v.result === "FAILED" ? "BLOCKED" : action.kind === "pr_then_auto_merge" ? "GATED" : "HELD";
    const wait = v.result === "FAILED" ? "failed" : action.kind === "hold" ? action.wait_reason : action.kind === "pr_then_auto_merge" ? null : "approval";
    seq = await setState(tx, t, state, { wait_reason: wait, usd, minutes, effective_level: lvl.level, last_result: v.result });
    return csId;
  });
  const after = (await d.db.query<{ state: string; wait_reason: string | null }>("select state, wait_reason from public.tasks where id = $1", [t.id])).rows[0];
  await bc(after?.state ?? "?", seq, { result: v.result, level: lvl.level, wait_reason: after?.wait_reason ?? null, usd, minutes });
  log(`[daemon] ${t.id}: ${v.result} · level ${lvl.level} · ${action.kind}`);
  // Delivery through the gate (fakeGitHub offline; Writer App online)
  const delivered = await deliver(d.gh, { repo: d.ghRepo, base: "main", task_id: t.id, attempt: t.attempt, base_sha: v.base_sha, tree_sha: v.tree_sha ?? "", diffPatch, verdict: v, effectiveLevel: lvl.level, levelReasons: lvl.reasons, ledgerSeq: out.ledger?.to ?? null, mode: "full" }, action);
  if (delivered.kind === "pr" || delivered.kind === "branch") {
    await d.db.query("update public.changesets set head_sha = $2 where id = $1::uuid", [changesetId, delivered.head_sha]);
  }
  if (delivered.kind === "pr" && delivered.auto_merge && (lvl.level === 2 || lvl.level === 3)) {
    const m = await autoMerge(d.gh, { repo: d.ghRepo, base: "main", number: delivered.number, head_sha: delivered.head_sha, base_sha: (await d.gh.getPull(d.ghRepo, delivered.number)).base_sha, tree_sha_expected: "", task_id: t.id, level: lvl.level, verdictSeq: out.ledger?.to ?? null, redact: (s) => s });
    if (m.kind === "merged") {
      await finishOutcome(d, t, ladder, "success", changesetId, delivered.number, m.merge_commit_sha);
      return { state: "CLOSED", verdict: v };
    }
    seq = await inTransaction(d.db, (tx) => setState(tx, t, m.kind === "mixed" ? "VERIFY_1" : "HELD", { wait_reason: m.kind === "held" ? m.wait_reason : "head_moved" }));
    await bc("HELD", seq, { result: v.result, level: lvl.level, wait_reason: m.kind === "held" ? m.wait_reason : "head_moved" });
    return { state: "HELD", verdict: v };
  }
  return { state: after?.state ?? "?", verdict: v };
}

/** OUTCOME (спец. т. 7): in a demo org the window is 0 min (D-217) → ladder step right away, then CLOSED. */
export async function finishOutcome(d: DaemonDeps, t: { id: string; org_id: string; repo_id: string; type: string; agent: string; is_demo: boolean }, ladder: LadderState, result: "success" | "failure" | "hard_fail" | "neutral", changesetId: string, prNumber: number, mergeSha: string): Promise<void> {
  const step = ladderStepFor(t.agent, ladder, result);
  const seq = await inTransaction(d.db, async (tx) => {
    await tx.query("insert into public.deliveries (org_id, changeset_id, level, kind, pr_number, head_sha) values ($1::uuid, $2::uuid, $3, 'merge', $4, $5)", [t.org_id, changesetId, step.next.level, prNumber, mergeSha]);
    await appendLedgerOnline(tx, { org_id: t.org_id, kind: "delivered", task_id: t.id, payload: { pr: prNumber, merge_sha: mergeSha } });
    await tx.query("insert into public.outcomes (org_id, changeset_id, result, window_minutes, tree_match) values ($1::uuid, $2::uuid, $3, $4, null)", [t.org_id, changesetId, result, t.is_demo ? 0 : 7 * 24 * 60]);
    await appendLedgerOnline(tx, { org_id: t.org_id, kind: "outcome", task_id: t.id, payload: { result, window_minutes: t.is_demo ? 0 : 10080 } });
    await tx.query(
      `insert into public.ladder_state (org_id, repo_id, task_type, agent, level, s_up, s_down, pinned) values ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8)
         on conflict (repo_id, task_type, agent) do update set level = excluded.level, s_up = excluded.s_up, s_down = excluded.s_down, pinned = excluded.pinned, updated_at = now()`,
      [t.org_id, t.repo_id, t.type, t.agent, step.next.level, step.next.s_up, step.next.s_down, step.next.pinned],
    );
    await tx.query("insert into public.ladder_events (org_id, repo_id, task_type, agent, input, level_before, level_after, s_up, s_down, task_id) values ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10)", [t.org_id, t.repo_id, t.type, t.agent, result, ladder.level, step.next.level, step.next.s_up, step.next.s_down, t.id]);
    if (step.delta !== 0) await appendLedgerOnline(tx, { org_id: t.org_id, kind: "ladder_change", task_id: t.id, payload: { agent: t.agent, task_type: t.type, from: ladder.level, to: step.next.level } });
    return setState(tx, t as TaskRow, "CLOSED", { outcome_decided: true, effective_level: step.next.level });
  });
  await d.broadcast?.(`org:${t.org_id}:board`, "task", { task_id: t.id, seq, state: "CLOSED", level: step.next.level }).catch(() => undefined);
}

/** Supabase Realtime REST broadcast (private channel; service role only in the worker). */
export function realtimeBroadcaster(o: { url: string; serviceKey: string }): (topic: string, event: string, payload: Record<string, unknown>) => Promise<void> {
  return async (topic, event, payload) => {
    const body = JSON.stringify({ messages: [{ topic, event, payload, private: true }] });
    if (body.length > 2048) throw new Error("broadcast payload too large");
    const r = await fetch(`${o.url.replace(/\/+$/, "")}/realtime/v1/api/broadcast`, { method: "POST", headers: { "content-type": "application/json", apikey: o.serviceKey, authorization: `Bearer ${o.serviceKey}` }, body, signal: AbortSignal.timeout(5000) });
    if (r.status >= 300) throw new Error(`broadcast ${r.status}`);
  };
}

/** Демо промпт т. 8 „Общо за E3“: SUPABASE_SERVICE_ROLE_KEY is read only in apps/worker (and verify, web admin.ts). */
export function broadcasterFromEnv(env: Record<string, string | undefined>): ((topic: string, event: string, payload: Record<string, unknown>) => Promise<void>) | undefined {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? realtimeBroadcaster({ url, serviceKey: key }) : undefined;
}

/** The loop: take the oldest CREATED task (row lock, SKIP LOCKED), process it; repeat. */
export async function runDaemonOnce(d: DaemonDeps): Promise<string | null> {
  const c = await d.db.connect();
  let id: string | null;
  try {
    await c.query("begin");
    const r = await c.query<{ id: string }>("select id from public.tasks where state = 'CREATED' order by created_at limit 1 for update skip locked");
    id = r.rows[0]?.id ?? null;
    if (id) await c.query("update public.tasks set state = 'CONTRACTED', state_entered_at = now(), seq = seq + 1 where id = $1", [id]);
    await c.query("commit");
  } catch (e) {
    await c.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
  if (id) await processTask(d, id);
  return id;
}
