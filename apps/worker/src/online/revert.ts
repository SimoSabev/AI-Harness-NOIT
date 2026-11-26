import type { ForgePush } from "@mandat/contract";
import { ladderStepFor } from "@mandat/core";
import type { LadderState } from "@mandat/core";
import { REVERT_WINDOW_MS, findReverts, prTitle } from "@mandat/gate-github";
import type { MergedChange, RevertMatch } from "@mandat/gate-github";
import { appendLedgerOnline } from "@mandat/ledger";
import { writeLadderStep } from "./daemon.js";
import type { DaemonDeps } from "./daemon.js";
import { inTransaction } from "./db.js";
import { enqueueOutbox } from "./pg-outbox.js";

// E9f (v5 5.6, AC-9.5, D-660): the Observer's push → was a change Mandat merged reverted within 7 days? Then that change's
// real outcome is a failure: one `outcomes` row (reason 'revert'), one failure step on the ladder of its (repo, type,
// agent), a ledger row, an activity on the card and a push „reverted“. Idempotent per changeset (unique index): a webhook
// redelivered or the same revert seen twice changes nothing. The commit messages are untrusted and never stored.

/** The pushes the Observer sees for one repo → the reverts it recorded now (already known ones are not returned). */
export async function observePush(d: Pick<DaemonDeps, "db" | "broadcast">, push: ForgePush, now: Date = new Date()): Promise<RevertMatch[]> {
  const repos = (await d.db.query<{ id: string; org_id: string; default_branch: string }>("select id::text as id, org_id::text as org_id, default_branch from public.repos where full_name = $1 and provider = $2", [push.repo, push.forge])).rows;
  const out: RevertMatch[] = [];
  for (const r of repos) {
    const since = new Date(now.getTime() - REVERT_WINDOW_MS).toISOString();
    const rows = (await d.db.query<{ changeset_id: string; merge_sha: string; pr_number: number | null; type: string; text: string; merged_at: Date | string }>(
      `select c.id::text as changeset_id, dl.head_sha as merge_sha, dl.pr_number, t.type, t.text, o.decided_at as merged_at
         from public.deliveries dl
         join public.changesets c on c.id = dl.changeset_id
         join public.tasks t on t.id = c.task_id
         join public.outcomes o on o.changeset_id = c.id and o.reason = 'merge' and o.result = 'success'
        where t.repo_id = $1::uuid and dl.kind = 'merge' and dl.head_sha is not null and o.decided_at >= $2::timestamptz
          and not exists (select 1 from public.outcomes x where x.changeset_id = c.id and x.reason = 'revert')`,
      [r.id, since],
    )).rows;
    const merged: MergedChange[] = rows.map((m) => ({ changeset_id: m.changeset_id, merge_sha: m.merge_sha, pr_number: m.pr_number, title: prTitle({ type: m.type, text: m.text }), merged_at: new Date(m.merged_at).toISOString() }));
    for (const hit of findReverts(push, merged, { now, defaultBranch: r.default_branch, repo: push.repo })) {
      if (await recordRevert(d, hit)) out.push(hit);
    }
  }
  return out;
}

async function recordRevert(d: Pick<DaemonDeps, "db" | "broadcast">, hit: RevertMatch): Promise<boolean> {
  const done = await inTransaction(d.db, async (tx) => {
    const t = (await tx.query<{ id: string; org_id: string; repo_id: string; type: string; agent: string; channel_kind: string | null }>(
      "select t.id, t.org_id::text as org_id, t.repo_id::text as repo_id, t.type, t.agent, t.channel_kind from public.changesets c join public.tasks t on t.id = c.task_id where c.id = $1::uuid",
      [hit.changeset_id],
    )).rows[0];
    if (!t) return null;
    const ins = await tx.query<{ id: string }>(
      "insert into public.outcomes (org_id, changeset_id, result, window_minutes, tree_match, reason, revert_sha) values ($1::uuid, $2::uuid, 'failure', $3, null, 'revert', $4) on conflict do nothing returning id::text as id",
      [t.org_id, hit.changeset_id, 7 * 24 * 60, hit.revert_sha],
    );
    if (ins.rows.length === 0) return null;
    const l = (await tx.query<{ level: number; s_up: number; s_down: number; pinned: boolean }>("select level, s_up, s_down, pinned from public.ladder_state where repo_id = $1::uuid and task_type = $2 and agent = $3 for update", [t.repo_id, t.type, t.agent])).rows[0];
    const ladder: LadderState = l ? { level: l.level as 0 | 1 | 2 | 3, s_up: Number(l.s_up), s_down: Number(l.s_down), pinned: l.pinned } : { level: 0, s_up: 0, s_down: 0, pinned: false };
    const step = ladderStepFor(t.agent, ladder, "failure", t.channel_kind === "local" ? { kind: "local" } : undefined);
    await appendLedgerOnline(tx, { org_id: t.org_id, kind: "outcome", task_id: t.id, payload: { result: "failure", reason: "revert", revert_sha: hit.revert_sha, signal: hit.signal, window_minutes: 10080 } });
    await writeLadderStep(tx, t, ladder, step, "failure");
    await tx.query("insert into public.task_activities (org_id, task_id, kind, text) values ($1::uuid, $2, 'reverted', $3)", [t.org_id, t.id, `${hit.signal} ${hit.revert_sha.slice(0, 12)}`]);
    await enqueueOutbox(tx, { org_id: t.org_id, kind: "web_push", idempotency_key: `push:${t.id}:reverted`, payload: { task_id: t.id, kind: "reverted" } });
    return { org: t.org_id, task: t.id, level: step.next.level };
  });
  if (!done) return false;
  await d.broadcast?.(`org:${done.org}:board`, "task", { task_id: done.task, state: "CLOSED", level: done.level, reverted: true }).catch(() => undefined);
  return true;
}
