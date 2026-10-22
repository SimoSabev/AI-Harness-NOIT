import { StreamEventKind } from "@mandat/contract";
import { AgentBeat, AgentEnd, AgentSessionWrite, McpServerWrite, NightPlan, NightQueueWrite, OpenWindowWrite, PermissionWrite, PluginWrite, ResearchClaimWrite, ResearchQuestionWrite, ResearchSourceWrite, SkillWrite, ToolCallWrite } from "@mandat/contract";
import type { AgentSessionInput, McpServerInput, NightPlanInput, NightQueueInput, OpenWindowInput, PermissionInput, PluginInput, ResearchClaimInput, ResearchQuestionInput, ResearchSourceInput, SkillInput, ToolCallInput } from "@mandat/contract";
import type { SqlClient } from "@mandat/ledger";

// D-307: the one place that writes the workbench tables (service role). Every input goes through the contract's zod
// schemas first, so a bad record never reaches the database and summaries are always redacted.
export function workbench(db: SqlClient, org: string) {
  return {
    async session(input: AgentSessionInput, repoId: string | null): Promise<void> {
      const s = AgentSessionWrite.parse(input);
      await db.query(
        `insert into public.agent_sessions (id, org_id, task_id, parent_id, repo_id, agent, model, account, role, state, step, context_pct, usd, touching)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         on conflict (id) do update set state = excluded.state, step = excluded.step, context_pct = excluded.context_pct, usd = excluded.usd, touching = excluded.touching, last_beat_at = now()`,
        [s.id, org, s.task_id, s.parent_id, repoId, s.agent, s.model, s.account, s.role, s.state, s.step, s.context_pct, s.usd, s.touching],
      );
    },
    async beat(id: string, b: { step?: string; context_pct?: number; usd?: number; touching?: string[] }): Promise<void> {
      const p = AgentBeat.parse(b);
      await db.query(
        "update public.agent_sessions set step = coalesce($3, step), context_pct = coalesce($4, context_pct), usd = coalesce($5, usd), touching = coalesce($6, touching), last_beat_at = now() where id = $1 and org_id = $2",
        [id, org, p.step ?? null, p.context_pct ?? null, p.usd ?? null, p.touching ?? null],
      );
    },
    async end(id: string, state: "done" | "failed" | "idle"): Promise<void> {
      await db.query("update public.agent_sessions set state = $3, ended_at = now(), last_beat_at = now() where id = $1 and org_id = $2", [id, org, AgentEnd.parse(state)]);
    },
    async toolCall(input: ToolCallInput): Promise<void> {
      const c = ToolCallWrite.parse(input);
      await db.query("insert into public.tool_calls (org_id, session_id, kind, tool, summary, decision, duration_ms) values ($1, $2, $3, $4, $5, $6, $7)", [org, c.session_id, c.kind, c.tool, c.summary, c.decision, c.duration_ms]);
    },
    /** E7д: stream lines of one session (already redacted by the stream builder); seq is unique per session */
    async lines(sessionId: string, rows: { seq: number; kind: StreamEventKind; text: string }[]): Promise<void> {
      if (rows.length === 0) return;
      const r = rows.map((x) => ({ seq: x.seq, kind: StreamEventKind.parse(x.kind), text: x.text.slice(0, 4000) }));
      await db.query(
        "insert into public.session_lines (org_id, session_id, seq, kind, text) select $1, $2, x.seq, x.kind, x.text from jsonb_to_recordset($3::jsonb) as x(seq int, kind text, text text) on conflict do nothing",
        [org, sessionId, JSON.stringify(r)],
      );
    },
    async mcp(input: McpServerInput): Promise<void> {
      const m = McpServerWrite.parse(input);
      await db.query(
        `insert into public.mcp_servers (org_id, name, transport, tools, status, latency_ms, egress_hosts, repo_ids) values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (org_id, name) do update set transport = excluded.transport, tools = excluded.tools, status = excluded.status, latency_ms = excluded.latency_ms, egress_hosts = excluded.egress_hosts, repo_ids = excluded.repo_ids, updated_at = now()`,
        [org, m.name, m.transport, m.tools, m.status, m.latency_ms, m.egress_hosts, m.repo_ids],
      );
    },
    async skill(input: SkillInput): Promise<void> {
      const s = SkillWrite.parse(input);
      await db.query("insert into public.skills (org_id, name, description, source, version) values ($1, $2, $3, $4, $5) on conflict (org_id, name) do update set description = excluded.description, source = excluded.source, version = excluded.version", [org, s.name, s.description, s.source, s.version]);
    },
    async plugin(input: PluginInput): Promise<void> {
      const p = PluginWrite.parse(input);
      await db.query("insert into public.plugins (org_id, name, description, kind, enabled) values ($1, $2, $3, $4, $5) on conflict (org_id, name) do update set description = excluded.description, kind = excluded.kind, enabled = excluded.enabled", [org, p.name, p.description, p.kind, p.enabled]);
    },
    async permission(input: PermissionInput): Promise<void> {
      const p = PermissionWrite.parse(input);
      await db.query("insert into public.tool_permissions (org_id, subject, tool, decision) values ($1, $2, $3, $4) on conflict (org_id, subject, tool) do update set decision = excluded.decision", [org, p.subject, p.tool, p.decision]);
    },
    async window(input: OpenWindowInput, at: { session_id?: string; repo_id?: string } = {}): Promise<string> {
      const w = OpenWindowWrite.parse(input);
      const r = await db.query<{ id: string }>("insert into public.open_windows (org_id, session_id, repo_id, kind, title, url) values ($1, $2, $3, $4, $5, $6) returning id::text as id", [org, at.session_id ?? null, at.repo_id ?? null, w.kind, w.title, w.url]);
      return r.rows[0]?.id as string;
    },
    async closeWindow(id: string): Promise<void> {
      await db.query("delete from public.open_windows where id = $1::uuid and org_id = $2", [id, org]);
    },
    async planNight(input: NightPlanInput): Promise<string> {
      const p = NightPlan.parse(input);
      const r = await db.query<{ id: string }>("insert into public.night_shifts (org_id, starts_at, ends_at, budget_usd, rules) values ($1, $2, $3, $4, $5::jsonb) returning id::text as id", [org, p.starts_at, p.ends_at, p.budget_usd, JSON.stringify(p.rules)]);
      return r.rows[0]?.id as string;
    },
    async queueNight(shift: string, input: NightQueueInput): Promise<void> {
      const q = NightQueueWrite.parse(input);
      await db.query(
        "insert into public.night_queue (org_id, shift_id, repo_id, position, text, risk, est_minutes, est_usd) values ($1, $2::uuid, $3, (select coalesce(max(position) + 1, 0) from public.night_queue where shift_id = $2::uuid), $4, $5, $6, $7)",
        [org, shift, q.repo_id, q.text, q.risk, q.est_minutes, q.est_usd],
      );
    },
    async research(question: ResearchQuestionInput, sources: ResearchSourceInput[], claims: ResearchClaimInput[]): Promise<void> {
      const q = ResearchQuestionWrite.parse(question);
      const ss = sources.map((s) => ResearchSourceWrite.parse(s));
      const cs = claims.map((c) => ResearchClaimWrite.parse(c));
      await db.query("insert into public.research_questions (id, org_id, repo_id, question) values ($1, $2, $3, $4) on conflict (id) do nothing", [q.id, org, q.repo_id, q.question]);
      for (const s of ss) await db.query("insert into public.research_sources (org_id, question_id, n, title, url, state) values ($1, $2, $3, $4, $5, $6) on conflict (question_id, n) do update set state = excluded.state", [org, q.id, s.n, s.title, s.url, s.state]);
      for (const c of cs) await db.query("insert into public.research_claims (org_id, question_id, text, verdict, source_ns) values ($1, $2, $3, $4, $5)", [org, q.id, c.text, c.verdict, c.source_ns]);
    },
  };
}
export type Workbench = ReturnType<typeof workbench>;
