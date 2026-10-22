-- E7д (v5 т. 3.5): the agent's stream as lines (after redaction) — the read-only terminal of the card. The worker writes
-- (service role, at most 50 000 lines per session); members of the org read.
create table if not exists public.session_lines (
  org_id uuid not null references public.orgs (id) on delete cascade,
  session_id text not null references public.agent_sessions (id) on delete cascade,
  seq int not null check (seq between 0 and 49999),
  at timestamptz not null default now(),
  kind text not null check (kind in ('init', 'text', 'step', 'tool_call', 'tool_result', 'permission', 'subagent_start', 'subagent_stop', 'usage', 'result', 'unparsed')),
  text text not null default '' check (length(text) <= 4000),
  primary key (session_id, seq)
);
alter table public.session_lines enable row level security;
alter table public.session_lines force row level security;
revoke all on public.session_lines from anon, authenticated;
grant select on public.session_lines to authenticated;
create policy session_lines_read on public.session_lines for select to authenticated using ((select private.authorize('viewer', org_id)));
