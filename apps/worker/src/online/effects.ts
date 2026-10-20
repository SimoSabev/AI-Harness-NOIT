import type { GitHubPort } from "@mandat/gate-github";
import type { LadderState } from "@mandat/core";
import type { Db } from "./db.js";
import { finishOutcome } from "./daemon.js";
import type { DaemonDeps } from "./daemon.js";
import type { EffectHandler } from "./outbox.js";

// E3а/E4: the effects of an approval (private.approve_changeset writes them to the outbox): the draft PR becomes ready
// for review and „Мандат approval“ = success for that head_sha. Both idempotent (check run by external_id).
export function approvalHandlers(d: { db: Db; gh: GitHubPort; ghRepo: string }): { ready_for_review: EffectHandler; approval_check: EffectHandler } {
  const prOf = async (cs: string) =>
    (await d.db.query<{ pr_number: number | null }>("select pr_number from public.deliveries where changeset_id = $1::uuid and pr_number is not null order by created_at desc limit 1", [cs])).rows[0]?.pr_number ?? null;
  return {
    ready_for_review: async (row) => {
      const cs = String(row.payload.changeset_id ?? "");
      const pr = await prOf(cs);
      if (pr !== null) await d.gh.markReadyForReview(d.ghRepo, pr);
    },
    approval_check: async (row) => {
      const head = String(row.payload.head_sha ?? "");
      if (!/^[0-9a-f]{40}$/.test(head)) throw new Error("approval_check without head_sha");
      await d.gh.createOrUpdateCheckRun(d.ghRepo, { name: "Мандат approval", head_sha: head, external_id: `approval:${String(row.payload.changeset_id ?? "")}`, conclusion: "success", title: "approved by a human", summary: "Approved in Mandat (second factor when required)." });
    },
  };
}

/** т. 9.2 step 2–3: a human merged the PR → OUTCOME (window 0 min in the demo) → the ladder moves (ladder_change). */
export async function humanMerged(d: DaemonDeps, changesetId: string, mergeSha: string): Promise<{ from: number; to: number }> {
  const t = (await d.db.query<{ id: string; org_id: string; repo_id: string; type: string; agent: string; is_demo: boolean }>(
    "select t.id, t.org_id::text as org_id, t.repo_id::text as repo_id, t.type, t.agent, o.is_demo from public.changesets c join public.tasks t on t.id = c.task_id join public.orgs o on o.id = t.org_id where c.id = $1::uuid",
    [changesetId],
  )).rows[0];
  if (!t) throw new Error("unknown changeset");
  const l = (await d.db.query<{ level: number; s_up: number; s_down: number; pinned: boolean }>("select level, s_up, s_down, pinned from public.ladder_state where repo_id = $1::uuid and task_type = $2 and agent = $3", [t.repo_id, t.type, t.agent])).rows[0];
  const ladder: LadderState = l ? { level: l.level as 0 | 1 | 2 | 3, s_up: Number(l.s_up), s_down: Number(l.s_down), pinned: l.pinned } : { level: 0, s_up: 0, s_down: 0, pinned: false };
  const pr = (await d.db.query<{ pr_number: number | null }>("select pr_number from public.deliveries where changeset_id = $1::uuid and pr_number is not null order by created_at desc limit 1", [changesetId])).rows[0]?.pr_number ?? 0;
  await finishOutcome(d, t, ladder, "success", changesetId, pr, mergeSha);
  const after = (await d.db.query<{ level: number }>("select level from public.ladder_state where repo_id = $1::uuid and task_type = $2 and agent = $3", [t.repo_id, t.type, t.agent])).rows[0]?.level ?? ladder.level;
  return { from: ladder.level, to: after };
}
