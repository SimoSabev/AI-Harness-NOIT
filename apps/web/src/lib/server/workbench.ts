import type { TerminalLine, FleetRow, HomeExtras, McpRow, NightView, PermissionCell, PluginRow, ResearchView, SkillRow, ToolCallRow, WindowRow } from "../workbench";
import { conflicts, terminalLines, tree } from "../workbench";
import { asUser } from "./sql";
import type { Db } from "./sql";

// D-307: the workbench reads, all under RLS as the signed-in user (viewer+ of the org).
const TS = (c: string) => `to_char(${c} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;
const FLEET = `
select s.id, s.parent_id, s.task_id, r.full_name as repo, s.agent, s.model, s.account, s.role, s.state, s.step, s.context_pct::float8 as context_pct, s.usd::float8 as usd,
       coalesce((select array_agg(distinct split_part(c.tool, '.', 1)) from public.tool_calls c where c.session_id = s.id and c.at > now() - interval '1 hour'), '{}') as tools,
       ${TS("s.started_at")} as started_at, s.touching
  from public.agent_sessions s left join public.repos r on r.id = s.repo_id
 where s.org_id = $1::uuid`;

export async function fleet(db: Db, uid: string, org: string): Promise<FleetRow[]> {
  return asUser(db, uid, async (sql) => tree((await sql.query<FleetRow>(`${FLEET} and (s.ended_at is null or s.ended_at > now() - interval '1 hour') order by r.full_name nulls last, s.started_at limit 500`, [org])).rows));
}

export async function tools(db: Db, uid: string, org: string): Promise<{ mcp: McpRow[]; skills: SkillRow[]; plugins: PluginRow[]; permissions: PermissionCell[]; calls: ToolCallRow[] }> {
  return asUser(db, uid, async (sql) => {
    const mcp = (await sql.query<McpRow>(
      `select m.name, m.transport, m.tools, m.status, m.latency_ms, m.egress_hosts,
              case when m.repo_ids is null then null else (select coalesce(array_agg(r.full_name order by r.full_name), '{}') from public.repos r where r.id = any (m.repo_ids)) end as repos,
              (select count(*)::int from public.tool_calls c where c.org_id = m.org_id and c.kind = 'mcp' and split_part(c.tool, '.', 1) = m.name and c.at > now() - interval '1 hour') as calls_hour
         from public.mcp_servers m where m.org_id = $1::uuid order by calls_hour desc, m.name`, [org])).rows;
    const skills = (await sql.query<SkillRow>(
      `select k.name, k.description, k.source, k.version, k.blocked_reason, (select count(distinct c.session_id)::int from public.tool_calls c where c.org_id = k.org_id and c.kind = 'skill' and c.tool = k.name and c.at > now() - interval '7 days') as used_by
         from public.skills k where k.org_id = $1::uuid order by used_by desc, k.name`, [org])).rows;
    const plugins = (await sql.query<PluginRow>("select name, description, kind, enabled from public.plugins where org_id = $1::uuid order by name", [org])).rows;
    const permissions = (await sql.query<PermissionCell>("select subject, tool, decision from public.tool_permissions where org_id = $1::uuid order by subject, tool", [org])).rows;
    return { mcp, skills, plugins, permissions, calls: await recentCalls(sql, org, null, 50) };
  });
}

async function recentCalls(sql: { query: Db["query"] }, org: string, task: string | null, limit: number): Promise<ToolCallRow[]> {
  return (await sql.query<ToolCallRow>(
    `select ${TS("c.at")} as at, c.session_id, s.agent, c.kind, c.tool, c.summary, c.decision, c.duration_ms
       from public.tool_calls c join public.agent_sessions s on s.id = c.session_id
      where c.org_id = $1::uuid and ($2::text is null or s.task_id = $2) order by c.at ${task ? "asc" : "desc"} limit ${limit}`, [org, task])).rows;
}

async function windowsOf(sql: { query: Db["query"] }, org: string, task: string | null): Promise<WindowRow[]> {
  return (await sql.query<WindowRow>(
    `select w.id::text as id, w.kind, w.title, w.url, w.status, r.full_name as repo, ${TS("w.last_seen_at")} as last_seen_at
       from public.open_windows w left join public.repos r on r.id = w.repo_id left join public.agent_sessions s on s.id = w.session_id
      where w.org_id = $1::uuid and ($2::text is null or s.task_id = $2) order by w.kind, w.last_seen_at desc limit 100`, [org, task])).rows;
}

export async function sessionOf(db: Db, uid: string, org: string, task: string): Promise<{ sessions: (FleetRow & { depth: number })[]; calls: ToolCallRow[]; windows: WindowRow[]; lines: TerminalLine[] }> {
  return asUser(db, uid, async (sql) => ({
    sessions: tree((await sql.query<FleetRow>(`${FLEET} and s.task_id = $2 order by s.started_at`, [org, task])).rows),
    calls: await recentCalls(sql, org, task, 200),
    windows: await windowsOf(sql, org, task),
    // E7e: the terminal = the lines of the latest leader session of the task (RLS: members of the org)
    lines: terminalLines(
      (await sql.query<{ seq: number; kind: string; text: string }>(
        `select l.seq, l.kind, l.text from public.session_lines l
          where l.session_id = (select id from public.agent_sessions where org_id = $1::uuid and task_id = $2 and role = 'lead' order by started_at desc limit 1)
          order by l.seq limit 50000`,
        [org, task],
      )).rows,
    ),
  }));
}

export async function homeExtras(db: Db, uid: string, org: string): Promise<HomeExtras> {
  return asUser(db, uid, async (sql) => {
    const n = (await sql.query<{ mcp10: number; denied: number; cost: number }>(
      `select (select count(*)::int from public.tool_calls where org_id = $1::uuid and kind = 'mcp' and at > now() - interval '10 minutes') as mcp10,
              (select count(*)::int from public.tool_calls where org_id = $1::uuid and decision = 'denied' and at > now() - interval '24 hours') as denied,
              (select coalesce(sum(usd), 0)::float8 from public.agent_sessions where org_id = $1::uuid and started_at >= date_trunc('day', now())) as cost`, [org])).rows[0] ?? { mcp10: 0, denied: 0, cost: 0 };
    const live = (await sql.query<{ repo: string | null; state: FleetRow["state"]; touching: string[] }>("select r.full_name as repo, s.state, s.touching from public.agent_sessions s left join public.repos r on r.id = s.repo_id where s.org_id = $1::uuid and s.state in ('running', 'waiting')", [org])).rows;
    return { mcpPerMin: Math.round(n.mcp10 / 10), denied24h: n.denied, costToday: n.cost, conflicts: conflicts(live), windows: await windowsOf(sql, org, null) };
  });
}

export async function nightView(db: Db, uid: string, org: string): Promise<NightView> {
  return asUser(db, uid, async (sql) => {
    const shift = (await sql.query<NonNullable<NightView["shift"]>>(`select id::text as id, ${TS("starts_at")} as starts_at, ${TS("ends_at")} as ends_at, budget_usd::float8 as budget_usd, spent_usd::float8 as spent_usd, status, rules from public.night_shifts where org_id = $1::uuid and status in ('planned', 'running') order by starts_at limit 1`, [org])).rows[0] ?? null;
    const queue = shift ? (await sql.query<NightView["queue"][number]>("select q.position, r.full_name as repo, q.text, q.risk, q.est_minutes, q.est_usd::float8 as est_usd, q.status from public.night_queue q join public.repos r on r.id = q.repo_id where q.shift_id = $1::uuid order by q.position", [shift.id])).rows : [];
    const lastRow = (await sql.query<{ id: string; starts_at: string; spent_usd: number; budget_usd: number }>(`select id::text as id, ${TS("starts_at")} as starts_at, spent_usd::float8 as spent_usd, budget_usd::float8 as budget_usd from public.night_shifts where org_id = $1::uuid and status = 'done' order by starts_at desc limit 1`, [org])).rows[0];
    let last: NightView["last"] = null;
    if (lastRow) {
      const items = (await sql.query<{ text: string; repo: string; status: string }>("select q.text, r.full_name as repo, q.status from public.night_queue q join public.repos r on r.id = q.repo_id where q.shift_id = $1::uuid order by q.position", [lastRow.id])).rows;
      last = { starts_at: lastRow.starts_at, spent_usd: lastRow.spent_usd, budget_usd: lastRow.budget_usd, merged: items.filter((i) => i.status === "merged").length, waiting: items.filter((i) => i.status === "waiting").length, failed: items.filter((i) => i.status === "failed").length, items };
    }
    return { shift, queue, last };
  });
}

export async function researchView(db: Db, uid: string, org: string, id?: string): Promise<ResearchView> {
  return asUser(db, uid, async (sql) => {
    const questions = (await sql.query<ResearchView["questions"][number]>(`select q.id, q.question, q.status, ${TS("q.created_at")} as created_at, (select count(*)::int from public.research_claims c where c.question_id = q.id) as claims from public.research_questions q where q.org_id = $1::uuid order by q.created_at desc limit 50`, [org])).rows;
    const pick = questions.find((q) => q.id === id) ?? questions[0];
    if (!pick) return { questions, current: null };
    const q = (await sql.query<{ draft: string | null }>("select draft from public.research_questions where id = $1", [pick.id])).rows[0];
    const sources = (await sql.query<NonNullable<ResearchView["current"]>["sources"][number]>("select n, title, url, state from public.research_sources where question_id = $1 order by n", [pick.id])).rows;
    const claims = (await sql.query<NonNullable<ResearchView["current"]>["claims"][number]>("select text, verdict, source_ns from public.research_claims where question_id = $1 order by id", [pick.id])).rows;
    return { questions, current: { id: pick.id, question: pick.question, status: pick.status, draft: q?.draft ?? null, sources, claims } };
  });
}
