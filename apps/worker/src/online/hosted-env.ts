import type { Db } from "./db.js";
import type { HostedHandlers } from "./hosted-server.js";
import { runnerApi } from "./runner-api.js";
import { runnerJwtSecret } from "./runner-jwt.js";
import { observerRecorder } from "./observer.js";
import { webhookHandler } from "./webhook.js";

// E10 hosted (v5 т. 6.1, D-700): what `mandat worker` serves on MANDAT_WEBHOOK_PORT when MANDAT_HOSTED=1. Settings come
// from env only (D-496 pattern); a part without its secret is off and says so, without printing the value.

export type WorkerRole = "all" | "api";

/** all = task slots + effects + the HTTP port; api = only the HTTP port (a hosted front for remote runners) */
export function workerRole(env: Record<string, string | undefined>): WorkerRole {
  const v = env.MANDAT_WORKER_ROLE ?? "all";
  if (v !== "all" && v !== "api") throw new Error(`MANDAT_WORKER_ROLE must be all or api, not ${v.slice(0, 20)}`);
  return v;
}

export function hostedFromEnv(env: Record<string, string | undefined>, db: Db, readFile: (path: string) => string, log: (line: string) => void = () => undefined): HostedHandlers | null {
  if (env.MANDAT_HOSTED !== "1") return null;
  const out: HostedHandlers = {};
  const key = runnerJwtSecret(env, readFile);
  if (key) out.runner = runnerApi({ db, jwtKey: key, log });
  else log("[hosted] runner protocol off: MANDAT_RUNNER_JWT_SECRET (≥ 32 characters) or MANDAT_RUNNER_JWT_SECRET_FILE is not set");
  const observer = env.GITHUB_OBSERVER_WEBHOOK_SECRET ?? null;
  const writer = env.GITHUB_WRITER_WEBHOOK_SECRET ?? null;
  if (observer || writer) {
    const observe = observerRecorder({ db, log });
    out.webhook = webhookHandler({
      secrets: { observer, writer },
      // the delivery is stored for the org of its repository; an unknown repository is accepted and dropped
      record: async (e) => {
        // E9f (D-660): the Observer's push goes through the revert observer, which stores it without the commit messages
        if (e.app === "observer" && e.event === "push") return observe(e);
        const name = (e.payload as { repository?: { full_name?: unknown } } | null)?.repository?.full_name;
        const repo = typeof name === "string" ? (await db.query<{ id: string; org_id: string }>("select id::text as id, org_id::text as org_id from public.repos where full_name = $1 order by created_at limit 1", [name])).rows[0] : undefined;
        if (!repo) return true;
        const r = await db.query("insert into public.sync_events (org_id, repo_id, source, delivery_id, event, payload) values ($1::uuid, $2::uuid, 'webhook', $3, $4, $5::jsonb) on conflict (delivery_id) do nothing returning id", [repo.org_id, repo.id, e.delivery, e.event, JSON.stringify(e.payload)]);
        return r.rows.length > 0;
      },
      security: (kind, detail) => log(`[hosted] ${kind} ${detail.app ?? ""} ${detail.event ?? ""}`),
    });
  } else log("[hosted] GitHub webhooks off: no GITHUB_*_WEBHOOK_SECRET");
  return out;
}
