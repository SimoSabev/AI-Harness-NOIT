import { randomBytes } from "node:crypto";
import { ResearchReport, ResearchRequest, TraceEvent } from "@mandat/contract";
import type { Result } from "./actions";
import { hasCap } from "./roles";
import { asService, asUser } from "./sql";
import type { Db } from "./sql";
import type { ResearchChannel, ResearchFeed, ResearchQuestionRow } from "../research-types";

export type { ResearchChannel, ResearchFeed, ResearchQuestionRow };

// E9d (D-398): research from the web. A person with research.ask queues a question (the worker runs it); the page
// follows its events (SSE) and offers the report for download. Reads go through RLS as the person; the queue row is
// written by the server (service role), like a task.

const err = (status: number, error: string): Result => ({ status, body: { error } });
const TS = (c: string) => `to_char(${c} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
const COLS = `q.id, q.question, q.status, q.depth, q.goal, q.partial, q.error, q.usd::float8 as usd, ${TS("q.created_at")} as created_at, ${TS("q.started_at")} as started_at, ${TS("q.finished_at")} as finished_at, q.stop_requested, (q.report is not null) as has_report`;

export async function createResearch(db: Db, o: { uid: string; org: string; body: unknown }): Promise<Result> {
  if (!(await hasCap(db, o.uid, o.org, "research.ask"))) return err(403, "not_allowed");
  const b = ResearchRequest.safeParse(o.body);
  if (!b.success) return err(400, "bad_body");
  const routed = Object.values(b.data.routing);
  if (routed.length > 0) {
    const known = await asUser(db, o.uid, (sql) => sql.query<{ id: string }>("select id::text as id from public.model_channels where org_id = $1::uuid and id::text = any($2::text[])", [o.org, routed]));
    if (known.rows.length !== new Set(routed).size) return err(400, "unknown_channel");
  }
  const id = `q_${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
  await asService(db, (sql) =>
    sql.query("insert into public.research_questions (id, org_id, question, request, depth, goal, requested_by, created_by) values ($1, $2::uuid, $3, $4::jsonb, $5, $6, 'human', $7::uuid)", [id, o.org, b.data.question, JSON.stringify(b.data), b.data.depth, b.data.goal, o.uid]),
  );
  return { status: 201, body: { id } };
}

export async function stopResearch(db: Db, o: { uid: string; org: string; id: string }): Promise<Result> {
  if (!(await hasCap(db, o.uid, o.org, "research.ask"))) return err(403, "not_allowed");
  const r = await asService(db, (sql) =>
    sql.query<{ status: string }>(
      "update public.research_questions set stop_requested = true, status = case when status = 'queued' then 'stopped' else status end, finished_at = case when status = 'queued' then now() else finished_at end where id = $1 and org_id = $2::uuid and status in ('queued', 'running') returning status",
      [o.id, o.org],
    ),
  );
  if (r.rows.length === 0) return err(409, "not_running");
  return { status: 200, body: { status: r.rows[0]?.status } };
}

export async function researchQuestions(db: Db, uid: string, org: string): Promise<ResearchQuestionRow[]> {
  return asUser(db, uid, async (sql) => (await sql.query<ResearchQuestionRow>(`select ${COLS} from public.research_questions q where q.org_id = $1::uuid order by q.created_at desc limit 60`, [org])).rows);
}

/** the question, its events after `after` (≤ 400 a time) and, once finished, the report */
export async function researchFeed(db: Db, uid: string, org: string, id: string, after: number, withReport = true): Promise<ResearchFeed | null> {
  return asUser(db, uid, async (sql) => {
    const q = (await sql.query<ResearchQuestionRow>(`select ${COLS} from public.research_questions q where q.id = $1 and q.org_id = $2::uuid`, [id, org])).rows[0];
    if (!q) return null;
    const rows = (await sql.query<{ seq: number; at: string; lane: string | null; kind: string; data: Record<string, unknown> }>(`select seq, ${TS("at")} as at, lane, kind, data from public.research_events where question_id = $1 and seq > $2 order by seq limit 400`, [id, after])).rows;
    const events = rows.flatMap((r) => {
      const e = TraceEvent.safeParse({ ...r.data, seq: r.seq, at: r.at, lane: r.lane, kind: r.kind });
      return e.success ? [e.data] : [];
    });
    let report: ResearchReport | null = null;
    if (withReport && q.has_report) {
      const raw = (await sql.query<{ report: unknown }>("select report from public.research_questions where id = $1", [id])).rows[0]?.report;
      const p = ResearchReport.safeParse(raw);
      report = p.success ? p.data : null;
    }
    return { question: q, events, report };
  });
}

export async function researchReport(db: Db, uid: string, org: string, id: string): Promise<ResearchReport | null> {
  return asUser(db, uid, async (sql) => {
    const raw = (await sql.query<{ report: unknown }>("select report from public.research_questions where id = $1 and org_id = $2::uuid", [id, org])).rows[0]?.report;
    const p = ResearchReport.safeParse(raw);
    return p.success ? p.data : null;
  });
}

export async function researchChannels(db: Db, uid: string, org: string): Promise<ResearchChannel[]> {
  return asUser(db, uid, async (sql) => (await sql.query<ResearchChannel>("select id::text as id, label, kind, model, health, enabled from public.model_channels where org_id = $1::uuid order by label", [org])).rows);
}
