-- D-307: the workbench behind the screens H1–H6: agent sessions (with subagents), tool calls, MCP servers, skills,
-- plugins, tool permissions, open windows, the night shift and research. The worker writes (service role, bypasses
-- RLS); members read their org (viewer+). Summaries are redacted by the writer (packages/contract/src/workbench.ts).

create table public.agent_sessions (
  id text primary key check (id ~ '^s_[a-z0-9_]{1,40}$'),
  org_id uuid not null references public.orgs (id) on delete cascade,
  task_id text references public.tasks (id) on delete cascade,
  parent_id text references public.agent_sessions (id) on delete cascade,
  repo_id uuid references public.repos (id) on delete cascade,
  agent text not null check (length(agent) between 1 and 64),
  model text not null check (length(model) between 1 and 64),
  account text check (length(account) <= 64),
  role text not null check (role in ('lead', 'subagent', 'judge', 'research')),
  state text not null check (state in ('running', 'waiting', 'done', 'failed', 'idle')),
  step text not null default '' check (length(step) <= 120),
  context_pct numeric(5, 2) check (context_pct between 0 and 100),
  usd numeric(10, 4) not null default 0 check (usd >= 0),
  touching text[] not null default '{}',
  started_at timestamptz not null default now(),
  last_beat_at timestamptz not null default now(),
  ended_at timestamptz,
  check ((role = 'subagent') = (parent_id is not null))
);
create index agent_sessions_org_state on public.agent_sessions (org_id, state);
create index agent_sessions_task on public.agent_sessions (task_id);

create table public.tool_calls (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.orgs (id) on delete cascade,
  session_id text not null references public.agent_sessions (id) on delete cascade,
  at timestamptz not null default now(),
  kind text not null check (kind in ('mcp', 'skill', 'builtin', 'bash', 'mandat')),
  tool text not null check (length(tool) between 1 and 120),
  summary text not null default '' check (length(summary) <= 300),
  decision text not null check (decision in ('allowed', 'asked', 'denied', 'slow', 'error')),
  duration_ms int check (duration_ms >= 0)
);
create index tool_calls_org_at on public.tool_calls (org_id, at desc);
create index tool_calls_session on public.tool_calls (session_id, at);

create table public.mcp_servers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  name text not null check (name ~ '^[a-z0-9][a-z0-9_.-]{0,63}$'),
  transport text not null check (transport in ('stdio', 'http')),
  tools int not null default 0 check (tools between 0 and 1000),
  status text not null default 'up' check (status in ('up', 'slow', 'down', 'off')),
  latency_ms int check (latency_ms >= 0),
  egress_hosts text[] not null default '{}',
  repo_ids uuid[],
  updated_at timestamptz not null default now(),
  unique (org_id, name)
);
create table public.skills (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  name text not null check (length(name) between 1 and 64),
  description text not null default '' check (length(description) <= 200),
  source text not null check (source in ('repo', 'user', 'team', 'builtin')),
  version text check (length(version) <= 32),
  unique (org_id, name)
);
create table public.plugins (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  description text not null default '' check (length(description) <= 200),
  kind text not null check (kind in ('hook', 'command', 'check', 'notify')),
  enabled boolean not null default true,
  unique (org_id, name)
);
create table public.tool_permissions (
  org_id uuid not null references public.orgs (id) on delete cascade,
  subject text not null check (length(subject) between 1 and 64),
  tool text not null check (length(tool) between 1 and 120),
  decision text not null check (decision in ('allow', 'ask', 'deny')),
  primary key (org_id, subject, tool)
);
create table public.open_windows (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  session_id text references public.agent_sessions (id) on delete cascade,
  repo_id uuid references public.repos (id) on delete cascade,
  kind text not null check (kind in ('terminal', 'preview', 'server', 'log')),
  title text not null check (length(title) between 1 and 120),
  url text check (url ~ '^https?://(localhost|127\.0\.0\.1)(:[0-9]{1,5})?(/.*)?$'),
  status text not null default 'live' check (status in ('live', 'slow', 'idle')),
  opened_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index open_windows_org on public.open_windows (org_id, last_seen_at desc);

create table public.night_shifts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  budget_usd numeric(10, 2) not null check (budget_usd > 0),
  spent_usd numeric(10, 2) not null default 0 check (spent_usd >= 0),
  status text not null default 'planned' check (status in ('planned', 'running', 'done', 'cancelled')),
  rules jsonb not null,
  report jsonb,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index night_shifts_org on public.night_shifts (org_id, starts_at desc);
create table public.night_queue (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.orgs (id) on delete cascade,
  shift_id uuid not null references public.night_shifts (id) on delete cascade,
  repo_id uuid not null references public.repos (id) on delete cascade,
  position int not null check (position >= 0),
  text text not null check (length(text) between 1 and 4000),
  risk text not null check (risk in ('low', 'medium', 'high')),
  est_minutes int not null check (est_minutes between 1 and 1440),
  est_usd numeric(10, 2) not null check (est_usd >= 0),
  status text not null default 'queued' check (status in ('queued', 'running', 'merged', 'waiting', 'failed', 'skipped')),
  task_id text references public.tasks (id) on delete set null
);
create index night_queue_shift on public.night_queue (shift_id, position);

create table public.research_questions (
  id text primary key check (id ~ '^q_[a-z0-9_]{1,40}$'),
  org_id uuid not null references public.orgs (id) on delete cascade,
  repo_id uuid references public.repos (id) on delete set null,
  question text not null check (length(question) between 1 and 2000),
  status text not null default 'running' check (status in ('running', 'done', 'failed')),
  draft text check (length(draft) <= 20000),
  created_at timestamptz not null default now()
);
create table public.research_sources (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.orgs (id) on delete cascade,
  question_id text not null references public.research_questions (id) on delete cascade,
  n int not null check (n between 1 and 999),
  title text not null check (length(title) between 1 and 300),
  url text not null check (url ~ '^https?://' and length(url) <= 2000),
  state text not null check (state in ('read', 'weak', 'failed')),
  unique (question_id, n)
);
create table public.research_claims (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.orgs (id) on delete cascade,
  question_id text not null references public.research_questions (id) on delete cascade,
  text text not null check (length(text) between 1 and 2000),
  verdict text not null check (verdict in ('confirmed', 'single', 'conflict', 'unchecked')),
  source_ns int[] not null default '{}'
);

do $$
declare t text;
begin
  foreach t in array array['agent_sessions', 'tool_calls', 'mcp_servers', 'skills', 'plugins', 'tool_permissions', 'open_windows',
    'night_shifts', 'night_queue', 'research_questions', 'research_sources', 'research_claims']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select private.authorize(''viewer'', org_id)))', t || '_read', t);
  end loop;
end $$;
