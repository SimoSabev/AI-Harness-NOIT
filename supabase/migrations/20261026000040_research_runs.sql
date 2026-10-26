-- E9г (PRD 6.13, D-409): research runs. A question is queued by a person (or an agent through the research MCP), the
-- worker runs it, every step is an event (the live panel reads them in order), and the finished report is stored as
-- JSON (the downloadable HTML/Markdown is rendered from it). The worker writes (service role); members of the org read.

alter table public.research_questions drop constraint if exists research_questions_status_check;
alter table public.research_questions
  add constraint research_questions_status_check check (status in ('queued', 'running', 'done', 'partial', 'failed', 'stopped')),
  add column if not exists request jsonb,
  add column if not exists depth text check (depth in ('quick', 'standard', 'deep')),
  add column if not exists goal text check (goal in ('economy', 'balanced', 'quality')),
  add column if not exists requested_by text not null default 'human' check (requested_by in ('human', 'agent', 'task')),
  add column if not exists created_by uuid references auth.users (id) on delete set null,
  add column if not exists task_id text references public.tasks (id) on delete set null,
  add column if not exists started_at timestamptz,
  add column if not exists finished_at timestamptz,
  add column if not exists heartbeat_at timestamptz,
  add column if not exists stop_requested boolean not null default false,
  add column if not exists usd numeric(10, 4) not null default 0 check (usd >= 0),
  add column if not exists partial text check (partial in ('budget', 'timeout', 'providers_down', 'models_down', 'stopped')),
  add column if not exists error text check (length(error) <= 300),
  -- the ResearchReport (packages/contract/src/research-run.ts), ≤ 8 MB
  add column if not exists report jsonb check (report is null or pg_column_size(report) <= 8388608);
alter table public.research_questions alter column status set default 'queued';
create index if not exists research_questions_queue on public.research_questions (status, created_at) where status in ('queued', 'running');

alter table public.research_sources drop constraint if exists research_sources_state_check;
alter table public.research_sources
  add constraint research_sources_state_check check (state in ('read', 'weak', 'failed', 'too_large', 'blocked')),
  add column if not exists domain text check (length(domain) <= 253),
  add column if not exists final_url text check (final_url ~ '^https?://' and length(final_url) <= 2000),
  add column if not exists content_hash text check (content_hash ~ '^sha256:[0-9a-f]{64}$'),
  add column if not exists published text check (length(published) <= 40),
  add column if not exists tier text check (tier in ('http', 'browser', 'archive', 'provider')),
  add column if not exists lane text check (lane ~ '^(main|l[0-9]{1,2})$'),
  add column if not exists fetched_at timestamptz;

alter table public.research_claims drop constraint if exists research_claims_verdict_check;
alter table public.research_claims
  add constraint research_claims_verdict_check check (verdict in ('confirmed', 'single', 'conflict', 'unchecked', 'quote_missing')),
  add column if not exists lane text check (lane ~ '^(main|l[0-9]{1,2})$'),
  add column if not exists as_of text check (length(as_of) <= 40);

-- the live trace: TraceEvent rows in order (seq), the payload is the event without seq/at/lane/kind
create table public.research_events (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.orgs (id) on delete cascade,
  question_id text not null references public.research_questions (id) on delete cascade,
  seq int not null check (seq >= 0),
  at timestamptz not null,
  lane text check (lane ~ '^(main|l[0-9]{1,2})$'),
  kind text not null check (kind in ('run_started', 'plan', 'model_call', 'query', 'results', 'fetch', 'read', 'reflect', 'claim', 'section', 'budget', 'note', 'run_finished')),
  data jsonb not null check (pg_column_size(data) <= 65536),
  unique (question_id, seq)
);
create index research_events_question on public.research_events (question_id, seq);

alter table public.research_events enable row level security;
alter table public.research_events force row level security;
revoke all on public.research_events from anon, authenticated;
grant select on public.research_events to authenticated;
create policy research_events_read on public.research_events for select to authenticated using ((select private.authorize('viewer', org_id)));
