import { pushFromGitHub } from "@mandat/contract";
import type { DaemonDeps } from "./daemon.js";
import { observePush } from "./revert.js";
import type { WebhookDeps } from "./webhook.js";

// E9f (D-660; demo prompt 6.5, D-215): what the webhook server does with a signed delivery. Only the Observer's `push`
// to a project Mandat knows is kept: one sync_events row per X-GitHub-Delivery (the unique index dedupes redeliveries)
// with the ref, the new head and the commit count — never the commit messages (untrusted text). A fresh push runs the
// revert observer. Everything else is accepted (202) and ignored: GitHub must not retry it.
export function observerRecorder(d: Pick<DaemonDeps, "db" | "broadcast"> & { log?: (l: string) => void }): WebhookDeps["record"] {
  return async (e) => {
    if (e.app !== "observer" || e.event !== "push") return true;
    const push = pushFromGitHub(e.payload);
    if (!push) return true;
    const repos = (await d.db.query<{ id: string; org_id: string }>("select id::text as id, org_id::text as org_id from public.repos where full_name = $1 and provider = 'github'", [push.repo])).rows;
    if (repos.length === 0) return true;
    let fresh = false;
    for (const r of repos) {
      const ins = await d.db.query<{ id: string }>(
        "insert into public.sync_events (org_id, repo_id, source, delivery_id, event, payload) values ($1::uuid, $2::uuid, 'webhook', $3, 'push', $4::jsonb) on conflict (delivery_id) do nothing returning id::text as id",
        [r.org_id, r.id, repos.length === 1 ? e.delivery : `${e.delivery}:${r.id}`, JSON.stringify({ ref: `refs/heads/${push.branch}`, after: push.after, commits: push.commits.length })],
      );
      fresh ||= ins.rows.length > 0;
    }
    if (!fresh) return false;
    for (const hit of await observePush(d, push)) {
      const t = (await d.db.query<{ task_id: string }>("select task_id from public.changesets where id = $1::uuid", [hit.changeset_id])).rows[0]?.task_id ?? "?";
      d.log?.(`[observer] revert of ${t} (${hit.signal}) → outcome failure`);
    }
    return true;
  };
}
