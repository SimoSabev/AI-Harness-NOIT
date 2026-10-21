import { COLUMNS, PER_COLUMN, isInboxItem } from "../board";
import type { ColumnNo } from "../board";
import { inboxSummary } from "../inbox";
import type { Summary } from "../inbox";
import { asUser } from "./sql";
import type { Db, Sql } from "./sql";

// Демо промпт т. 8.1: GET /api/inbox, /api/board, /api/tasks/:id — all under RLS as the user.
export type Role = "owner" | "approver" | "viewer";
export interface TaskRow {
  id: string; type: string; agent: string; text: string; state: string; wait_reason: string | null; usd: number; minutes: number;
  effective_level: number | null; last_result: "VERIFIED" | "FAILED" | "UNKNOWN" | null; outcome_decided: boolean; seq: number;
  updated_at: string; state_entered_at: string; changeset_id: string | null; head_sha: string | null; approval_needed: boolean;
  requires_second_factor: boolean; verdict_id: string | null; reasons: string[]; decided_at: string | null; delivered: string | null;
  pr_number: number | null; approved_by_human: boolean; col: ColumnNo; repo_id: string;
  a_passed: number | null; a_total: number | null; inv_before: number | null; inv_after: number | null;
  ladder_level: number | null; ladder_s_up: number | null; ladder_pinned: boolean | null; ledger_seq: number | null;
}

const TASKS = `
select t.id, t.repo_id::text as repo_id, t.type, t.agent, t.text, t.state, t.wait_reason, t.usd::float8 as usd, t.minutes::float8 as minutes, t.effective_level,
       t.last_result, t.outcome_decided, t.seq::int as seq, to_char(t.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as updated_at,
       to_char(t.state_entered_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as state_entered_at,
       c.id::text as changeset_id, c.head_sha, coalesce(c.approval_needed, false) as approval_needed, coalesce(c.requires_second_factor, false) as requires_second_factor,
       v.id::text as verdict_id, coalesce(v.reasons, '[]'::jsonb) as reasons, to_char(v.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as decided_at,
       d.kind as delivered, d.pr_number,
       exists (select 1 from public.approvals a where a.changeset_id = c.id and a.decision = 'approved') as approved_by_human,
       public.board_column(t.state, t.last_result, t.wait_reason, coalesce(c.approval_needed, false), t.outcome_decided) as col,
       (e1.data ->> 'passed')::int as a_passed, (e1.data ->> 'total')::int as a_total, (e2.data ->> 'before')::int as inv_before, (e2.data ->> 'after')::int as inv_after,
       l.level as ladder_level, l.s_up::float8 as ladder_s_up, l.pinned as ladder_pinned,
       (select max(g.seq)::int from public.ledger g where g.org_id = t.org_id and g.task_id = t.id) as ledger_seq
  from public.tasks t
  left join lateral (select * from public.changesets x where x.task_id = t.id order by x.attempt desc, x.created_at desc limit 1) c on true
  left join lateral (select * from public.verdicts x where x.task_id = t.id order by x.attempt desc, x.created_at desc limit 1) v on true
  left join lateral (select * from public.deliveries x where x.changeset_id = c.id order by x.created_at desc limit 1) d on true
  left join lateral (select x.data from public.evidence x where x.verdict_id = v.id and x.detector = 'D1.base_tests' order by x.id limit 1) e1 on true
  left join lateral (select x.data from public.evidence x where x.verdict_id = v.id and x.detector = 'D2.inventory' order by x.id limit 1) e2 on true
  left join public.ladder_state l on l.repo_id = t.repo_id and l.task_type = t.type and l.agent = t.agent
 where t.org_id = $1::uuid`;

export async function membership(db: Db, uid: string): Promise<{ org_id: string; role: Role } | null> {
  return asUser(db, uid, async (sql) => (await sql.query<{ org_id: string; role: Role }>("select org_id::text as org_id, role from public.members where user_id = auth.uid() order by created_at, org_id limit 1")).rows[0] ?? null);
}

async function tasks(sql: Sql, org: string, extra = "", params: unknown[] = []): Promise<TaskRow[]> {
  return (await sql.query<TaskRow>(`${TASKS} ${extra}`, [org, ...params])).rows;
}

export interface Inbox { items: TaskRow[]; summary: Summary }
export async function inbox(db: Db, uid: string, org: string, now: Date = new Date()): Promise<Inbox> {
  return asUser(db, uid, async (sql) => {
    const all = await tasks(sql, org, "and (t.updated_at > now() - interval '24 hours' or t.state in ('HELD', 'GATED', 'BLOCKED')) order by t.state_entered_at asc, t.id limit 500");
    const items = all.filter((t) => isInboxItem(t));
    const summary = inboxSummary(all.map((t) => ({ result: t.last_result, delivered: t.delivered, approved_by_human: t.approved_by_human, decided_at: t.decided_at, waiting: isInboxItem(t) })), now);
    return { items, summary };
  });
}

export interface Board { columns: { n: ColumnNo; title: string; items: TaskRow[]; next: string | null }[]; since: string }
/** 20 per column + cursor (`before` = updated_at of the last card); column 7 keeps 7 days; `since` → only changed. */
export async function board(db: Db, uid: string, org: string, o: { since?: string; column?: ColumnNo; before?: string } = {}): Promise<Board> {
  return asUser(db, uid, async (sql) => {
    const params: unknown[] = [];
    let where = "";
    if (o.since) {
      params.push(o.since);
      where += ` and t.updated_at > $${params.length + 1}::timestamptz`;
    }
    const rows = await tasks(sql, org, `${where} order by t.updated_at desc, t.id desc limit 2000`, params);
    const stamp = (await sql.query<{ now: string }>(`select to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as now`)).rows[0]?.now ?? new Date().toISOString();
    const weekAgo = Date.now() - 7 * 24 * 3600_000;
    const columns = COLUMNS.filter((c) => o.column === undefined || c.n === o.column).map((c) => {
      let items = rows.filter((r) => r.col === c.n && (c.n !== 7 || Date.parse(r.updated_at) >= weekAgo));
      if (o.before) items = items.filter((r) => r.updated_at < (o.before as string));
      const page = items.slice(0, PER_COLUMN);
      return { n: c.n, title: c.title, items: page, next: items.length > PER_COLUMN ? (page[page.length - 1]?.updated_at ?? null) : null };
    });
    return { columns, since: stamp };
  });
}

export interface Evidence { detector: string; status: string; summary: string; data: Record<string, unknown>; signature: string | null }
export interface TaskDetail {
  task: TaskRow; role: Role; evidence: Evidence[]; ladder: { level: number; s_up: number; pinned: boolean } | null;
  ladderEvents: { input: string; level_before: number; level_after: number; created_at: string }[];
  ledger: { seq: number; kind: string; ts: string; hash: string }[]; diff: string | null; activities: { kind: string; text: string }[];
  approvals: { decision: string; method: string; decided_at: string }[]; label: { layer: string; label: string } | null;
}

export async function taskDetail(db: Db, uid: string, org: string, role: Role, id: string): Promise<TaskDetail | null> {
  if (!/^t_[a-z0-9_]{1,40}$/.test(id)) return null;
  return asUser(db, uid, async (sql) => {
    const task = (await tasks(sql, org, "and t.id = $2", [id]))[0];
    if (!task) return null;
    const evidence = task.verdict_id ? (await sql.query<Evidence>("select detector, status, summary, data, signature from public.evidence where verdict_id = $1::uuid order by id", [task.verdict_id])).rows : [];
    const ladder = (await sql.query<{ level: number; s_up: number; pinned: boolean }>("select level, s_up::float8 as s_up, pinned from public.ladder_state where repo_id = $1::uuid and task_type = $2 and agent = $3", [task.repo_id, task.type, task.agent])).rows[0] ?? null;
    const ladderEvents = (await sql.query<{ input: string; level_before: number; level_after: number; created_at: string }>("select input, level_before, level_after, to_char(created_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as created_at from public.ladder_events where repo_id = $1::uuid and task_type = $2 and agent = $3 order by id desc limit 20", [task.repo_id, task.type, task.agent])).rows;
    const ledger = (await sql.query<{ seq: number; kind: string; ts: string; hash: string }>("select seq::int as seq, kind, ts, hash from public.ledger where org_id = $1::uuid and task_id = $2 order by seq", [org, id])).rows;
    const diff = task.changeset_id ? ((await sql.query<{ diff: string }>("select diff from public.changeset_diffs where changeset_id = $1::uuid", [task.changeset_id])).rows[0]?.diff ?? null) : null;
    const activities = (await sql.query<{ kind: string; text: string }>("select kind, text from public.task_activities where task_id = $1 order by id limit 200", [id])).rows;
    const approvals = task.changeset_id ? (await sql.query<{ decision: string; method: string; decided_at: string }>("select decision, method, to_char(decided_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as decided_at from public.approvals where changeset_id = $1::uuid order by decided_at", [task.changeset_id])).rows : [];
    const label = task.verdict_id ? ((await sql.query<{ layer: string; label: string }>("select layer, label from public.failure_labels where verdict_id = $1::uuid order by id desc limit 1", [task.verdict_id])).rows[0] ?? null) : null;
    return { task, role, evidence, ladder, ladderEvents, ledger, diff, activities, approvals, label };
  });
}

/** D-292: the repository new tasks go to (createTask takes the org's first repo with that task type). */
export async function firstRepo(db: Db, uid: string, org: string): Promise<string | null> {
  return asUser(db, uid, async (sql) => (await sql.query<{ full_name: string }>("select full_name from public.repos where org_id = $1::uuid order by created_at limit 1", [org])).rows[0]?.full_name ?? null);
}

/** D-305: the org's repositories, for the projects on the start page and in the side bar. */
export async function repos(db: Db, uid: string, org: string): Promise<{ id: string; full_name: string }[]> {
  return asUser(db, uid, async (sql) => (await sql.query<{ id: string; full_name: string }>("select id::text as id, full_name from public.repos where org_id = $1::uuid order by full_name", [org])).rows);
}
