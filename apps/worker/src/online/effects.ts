import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { cleanGit } from "@mandat/export";
import type { LadderState } from "@mandat/core";
import { finishOutcome } from "./daemon.js";
import { mergeLocal } from "./deliver-local.js";
import type { DaemonDeps } from "./daemon.js";
import type { EffectHandler } from "./outbox.js";

// E3а/E4: the effects of an approval (private.approve_changeset writes them to the outbox): the draft PR becomes ready
// for review and „Мандат approval“ = success for that head_sha. Both idempotent (check run by external_id).
export function approvalHandlers(d: Pick<DaemonDeps, "db" | "gh" | "ghRepo" | "broadcast">): { ready_for_review: EffectHandler; approval_check: EffectHandler } {
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
      await applyApprovedLocal(d, String(row.payload.changeset_id ?? ""));
    },
  };
}

/**
 * D-367: a person approved a change of a local project → it goes into main (fast-forward only, mergeLocal) and the task
 * closes with a success for the ladder, like an auto-merge. Idempotent: a task that is no longer waiting is left alone.
 */
export async function applyApprovedLocal(d: Pick<DaemonDeps, "db" | "broadcast">, changesetId: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/.test(changesetId)) return;
  const r = (await d.db.query<{ task_id: string; state: string; provider: string; remote_url: string; ref: string | null }>(
    `select t.id as task_id, t.state, r.provider, r.remote_url,
            (select a.text from public.task_activities a where a.task_id = t.id and a.kind = 'local_branch' order by a.id desc limit 1) as ref
       from public.changesets c join public.tasks t on t.id = c.task_id join public.repos r on r.id = t.repo_id where c.id = $1::uuid`,
    [changesetId],
  )).rows[0];
  if (!r || r.provider !== "local" || !r.ref || !/^mandat\/t_[a-z0-9_]{1,40}-a\d+$/.test(r.ref) || (r.state !== "HELD" && r.state !== "GATED")) return;
  const mirror = r.remote_url.replace(/^file:\/\//, "");
  const tmp = mkdtempSync(path.join(os.tmpdir(), "mandat-approve-"));
  const sha = await cleanGit({ tmpHome: tmp }).run(["rev-parse", "--verify", "--quiet", "--end-of-options", `refs/heads/${r.ref}`], { cwd: mirror }).then((x) => x.stdout.toString("utf8").trim()).finally(() => rmSync(tmp, { recursive: true, force: true }));
  const m = await mergeLocal({ mirror, sha });
  if (!m.ok) {
    await d.db.query("insert into public.task_activities (org_id, task_id, kind, text) select org_id, id, 'needs_you', $2 from public.tasks where id = $1", [r.task_id, `apply_failed:${m.reason}`]);
    return;
  }
  await d.db.query("insert into public.task_activities (org_id, task_id, kind, text) select org_id, id, 'applied', $2 from public.tasks where id = $1", [r.task_id, `main ${m.from.slice(0, 12)} → ${m.to.slice(0, 12)}`]);
  await humanMerged(d, changesetId, m.to);
}

/** т. 9.2 step 2–3: a human merged the PR → OUTCOME (window 0 min in the demo) → the ladder moves (ladder_change). */
export async function humanMerged(d: Pick<DaemonDeps, "db" | "broadcast">, changesetId: string, mergeSha: string): Promise<{ from: number; to: number }> {
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
