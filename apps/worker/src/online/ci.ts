import { codeSpan, frameUntrusted } from "@mandat/contract";
import { appendLedgerOnline } from "@mandat/ledger";
import type { SqlClient } from "@mandat/ledger";
import type { Db } from "./db.js";
import { inTransaction } from "./db.js";
import { enqueueOutbox } from "./pg-outbox.js";
import { ghFor } from "./gh-target.js";
import type { GhDeps } from "./gh-target.js";

// E8g (v5 p. 4.7 (3), AC-9.2, D-356): the project's CI on Mandat's PR. Mandat's own checks never count. A red round →
// HELD ci_failed with the failing checks (names and conclusions, as code spans — never their text) and the round counted;
// "Fix CI" → a new attempt with that log in the contract (framed), at most ci_rounds (profile layer G, default 2) times.
const RED_RUN = new Set(["failure", "timed_out", "cancelled", "startup_failure"]);
const mine = (name: string, slug: string) => slug === "mandat-writer" || name.startsWith("Мандат");

export async function pollCi(d: GhDeps & { db: Db }): Promise<string[]> {
  const rows = (await d.db.query<{ id: string; org_id: string; attempt: number; head_sha: string; ci_rounds: number; provider: string; full_name: string }>(
    `select t.id, t.org_id::text as org_id, t.attempt, dl.head_sha, t.ci_rounds, r.provider, r.full_name from public.tasks t
       join public.repos r on r.id = t.repo_id
       join lateral (select c.id from public.changesets c where c.task_id = t.id and c.attempt = t.attempt order by c.created_at desc limit 1) c on true
       join lateral (select x.head_sha from public.deliveries x where x.changeset_id = c.id and x.kind in ('pr', 'draft_pr') order by x.created_at desc limit 1) dl on true
      where t.state in ('GATED', 'HELD') and coalesce(t.wait_reason, 'approval') = 'approval' and dl.head_sha ~ '^[0-9a-f]{40}$'
        and t.ci_checked_sha is distinct from dl.head_sha`,
  )).rows;
  const failed: string[] = [];
  for (const r of rows) {
    // D-388: the CI of the task's own project
    const g = ghFor(d, r);
    const runs = (await g.gh.listCheckRunsForRef(g.repo, r.head_sha)).filter((c) => !mine(c.name, c.app_slug));
    const statuses = (await g.gh.listCommitStatusesForRef(g.repo, r.head_sha)).filter((s) => !s.context.startsWith("Мандат"));
    const red = [
      ...runs.filter((c) => c.status === "completed" && c.conclusion !== null && RED_RUN.has(c.conclusion)).map((c) => `${codeSpan(c.name.slice(0, 80))}: ${c.conclusion ?? ""}`),
      ...statuses.filter((s) => s.state === "failure" || s.state === "error").map((s) => `${codeSpan(s.context.slice(0, 80))}: ${s.state}`),
    ];
    // checks arrive over time: a green or pending head is looked at again; only a red round marks the head as judged
    if (red.length === 0) continue;
    await inTransaction(d.db, async (tx) => {
      await tx.query("update public.tasks set ci_rounds = ci_rounds + 1, ci_checked_sha = $2, state = 'HELD', wait_reason = 'ci_failed', state_entered_at = now(), updated_at = now(), seq = seq + 1 where id = $1", [r.id, r.head_sha]);
      await tx.query("insert into public.task_activities (org_id, task_id, kind, text) values ($1::uuid, $2, 'ci_failed', $3)", [r.org_id, r.id, red.join("\n").slice(0, 500)]);
      await appendLedgerOnline(tx, { org_id: r.org_id, kind: "task_stopped", task_id: r.id, payload: { reason: "ci_failed", round: r.ci_rounds + 1, head_sha: r.head_sha } });
    });
    await enqueueOutbox(d.db, { org_id: r.org_id, kind: "web_push", idempotency_key: `push:${r.id}:${r.attempt}:ci`, payload: { task_id: r.id, kind: "waiting" } });
    failed.push(r.id);
  }
  return failed;
}

/** The last CI log of the task as a framed note for the next attempt's contract. */
export async function ciNote(db: SqlClient, taskId: string): Promise<string | null> {
  const r = (await db.query<{ text: string }>("select text from public.task_activities where task_id = $1 and kind = 'ci_failed' order by id desc limit 1", [taskId])).rows[0];
  return r ? `The project's CI failed on the previous attempt. The failing checks:\n${frameUntrusted({ author: "ci", association: "none", source: "webhook", text: r.text })}` : null;
}

export async function fixCi(db: Db, o: { taskId: string; by: string | null }): Promise<{ ok: true; attempt: number } | { ok: false; reason: "not_ci_failed" | "ci_rounds_exhausted" }> {
  const t = (await db.query<{ org_id: string; state: string; wait_reason: string | null; attempt: number; ci_rounds: number; cap: number | null }>(
    `select t.org_id::text as org_id, t.state, t.wait_reason, t.attempt, t.ci_rounds,
            (select (h.layers -> 'g' ->> 'ci_rounds')::int from public.repos r join public.harness_profiles h on h.id = r.profile_id and h.status = 'approved' where r.id = t.repo_id) as cap
       from public.tasks t where t.id = $1`,
    [o.taskId],
  )).rows[0];
  if (!t || t.state !== "HELD" || t.wait_reason !== "ci_failed") return { ok: false, reason: "not_ci_failed" };
  if (t.ci_rounds >= (t.cap ?? 2)) return { ok: false, reason: "ci_rounds_exhausted" };
  await inTransaction(db, async (tx) => {
    await tx.query("update public.tasks set state = 'CREATED', attempt = attempt + 1, retry_reason = 'ci', wait_reason = null, last_result = null, effective_level = null, state_entered_at = now(), updated_at = now(), seq = seq + 1 where id = $1", [o.taskId]);
    await appendLedgerOnline(tx, { org_id: t.org_id, kind: "task_retry", task_id: o.taskId, payload: { attempt: t.attempt + 1, reason: "ci", ...(o.by ? { by: o.by } : {}) } });
  });
  return { ok: true, attempt: t.attempt + 1 };
}
