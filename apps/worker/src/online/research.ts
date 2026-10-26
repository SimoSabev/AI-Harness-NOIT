import type { ResearchReport, ResearchRequest, TraceEvent } from "@mandat/contract";
import { ResearchRequest as RequestSchema } from "@mandat/contract";
import type { SqlClient } from "@mandat/ledger";
import type { Fetcher, ModelClient, RoleRoute, RouterChannel, SearchProvider } from "@mandat/research";
import { routeRoles, runResearch } from "@mandat/research";
import type { Db } from "./db.js";

// E9г (D-398): the research queue of the worker. A question queued by a person (web), an agent (research MCP) or a task
// is claimed (≤ 2 running per org, SKIP LOCKED), run by the engine with every event written at once (the live panel
// polls research_events), stopped when someone presses Stop, and finished with sources, claims and the report.

export const MAX_RUNNING_PER_ORG = 2;

/** what one run needs from the host: the org's models and the search/fetch side */
export interface ResearchEnv {
  channels: RouterChannel[];
  clientOf: (c: RouterChannel) => ModelClient;
  providers: SearchProvider[];
  fetcher: Fetcher;
  /** called once when the run ends (revoke tokens, stop containers) */
  close?: () => Promise<void>;
}
export interface ResearchDeps {
  db: Db;
  envFor: (org: string, req: ResearchRequest, questionId: string) => Promise<ResearchEnv>;
  log?: (line: string) => void;
  now?: () => number;
  /** how often the run checks for Stop, ms */
  stopPollMs?: number;
}

/** the oldest queued question of an org that runs fewer than MAX_RUNNING_PER_ORG */
export async function claimResearch(db: SqlClient): Promise<{ id: string; org: string; request: unknown } | null> {
  const r = await db.query<{ id: string; org: string; request: unknown }>(
    `update public.research_questions q set status = 'running', started_at = now(), heartbeat_at = now()
      where q.id = (select x.id from public.research_questions x
                     where x.status = 'queued'
                       and (select count(*) from public.research_questions y where y.org_id = x.org_id and y.status = 'running') < $1
                     order by x.created_at limit 1 for update skip locked)
      returning q.id, q.org_id::text as org, q.request`,
    [MAX_RUNNING_PER_ORG],
  );
  return r.rows[0] ?? null;
}

const eventRow = (e: TraceEvent) => {
  const { seq, at, lane, kind, ...data } = e;
  return { seq, at, lane, kind, data };
};

async function finish(db: SqlClient, id: string, org: string, r: ResearchReport): Promise<void> {
  for (const s of r.sources) {
    await db.query(
      `insert into public.research_sources (org_id, question_id, n, title, url, state, domain, final_url, content_hash, published, tier, lane, fetched_at)
       values ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::timestamptz) on conflict (question_id, n) do nothing`,
      [org, id, s.n, s.title.slice(0, 300) || s.domain, s.url, s.state, s.domain, s.final_url, s.content_hash, s.published, s.tier, s.lane, s.fetched_at],
    );
  }
  for (const c of r.claims) {
    await db.query("insert into public.research_claims (org_id, question_id, text, verdict, source_ns, lane, as_of) values ($1::uuid, $2, $3, $4, $5::int[], $6, $7)", [org, id, c.text, c.verdict, c.source_ns, c.lane, c.as_of]);
  }
  await db.query(
    `update public.research_questions set status = $2, partial = $3, finished_at = now(), usd = $4, draft = $5, report = $6::jsonb where id = $1`,
    [id, r.partial === "stopped" ? "stopped" : r.status, r.partial, r.stats.usd, r.summary.slice(0, 20_000), JSON.stringify(r)],
  );
}

/** run one claimed question to the end; never throws (a failure is written on the question) */
export async function processResearch(d: ResearchDeps, q: { id: string; org: string; request: unknown }): Promise<ResearchReport | null> {
  const parsed = RequestSchema.safeParse(q.request);
  if (!parsed.success) {
    await d.db.query("update public.research_questions set status = 'failed', error = 'the request does not match the schema', finished_at = now() where id = $1", [q.id]);
    return null;
  }
  const req = parsed.data;
  const stop = new AbortController();
  let env: ResearchEnv | null = null;
  const writes: Promise<unknown>[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;
  try {
    env = await d.envFor(q.org, req, q.id);
    const routes = routeRoles(env.channels, req.goal, req.routing);
    if (!routes.ok) {
      await d.db.query("update public.research_questions set status = 'failed', error = $2, finished_at = now() where id = $1", [q.id, routes.why.slice(0, 300)]);
      return null;
    }
    timer = setInterval(() => {
      void d.db
        .query<{ stop: boolean }>("update public.research_questions set heartbeat_at = now() where id = $1 returning stop_requested as stop", [q.id])
        .then((r) => {
          if (r.rows[0]?.stop) stop.abort();
        })
        .catch(() => undefined);
    }, d.stopPollMs ?? 2000);
    const report = await runResearch(req, {
      id: q.id,
      routes: routes.routes as RoleRoute[],
      clientOf: env.clientOf,
      providers: env.providers,
      fetcher: env.fetcher,
      signal: stop.signal,
      ...(d.now ? { now: d.now } : {}),
      emit: (e) => {
        const row = eventRow(e);
        writes.push(d.db.query("insert into public.research_events (org_id, question_id, seq, at, lane, kind, data) values ($1::uuid, $2, $3, $4::timestamptz, $5, $6, $7::jsonb) on conflict do nothing", [q.org, q.id, row.seq, row.at, row.lane, row.kind, JSON.stringify(row.data)]).catch(() => undefined));
      },
    });
    await Promise.all(writes);
    await finish(d.db, q.id, q.org, report);
    d.log?.(`[research] ${q.id} ${report.status}${report.partial ? ` (${report.partial})` : ""}: ${report.stats.pages_read} pages, ${report.stats.claims} claims, $${report.stats.usd}`);
    return report;
  } catch (e) {
    await Promise.all(writes);
    const msg = e instanceof Error ? e.message.slice(0, 300) : "research failed";
    await d.db.query("update public.research_questions set status = 'failed', error = $2, finished_at = now() where id = $1", [q.id, msg]);
    d.log?.(`[research] ${q.id} failed: ${msg}`);
    return null;
  } finally {
    if (timer) clearInterval(timer);
    await env?.close?.().catch(() => undefined);
  }
}

export async function runResearchOnce(d: ResearchDeps): Promise<string | null> {
  const q = await claimResearch(d.db);
  if (!q) return null;
  await processResearch(d, q);
  return q.id;
}

/** a run whose worker died (no heartbeat for 2 minutes) goes back to failed, so the org's slots free up */
export async function reapStaleResearch(db: SqlClient): Promise<string[]> {
  const r = await db.query<{ id: string }>("update public.research_questions set status = 'failed', error = 'the worker stopped', finished_at = now() where status = 'running' and heartbeat_at < now() - interval '2 minutes' returning id");
  return r.rows.map((x) => x.id);
}
