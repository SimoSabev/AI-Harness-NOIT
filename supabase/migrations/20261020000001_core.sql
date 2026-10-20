-- Мандат E1б (демо промпт т. 5.2): only the tables of the demo. Columns: D-266 (docs/spec т. 11 is not in the repo).
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'mandat_runner') then
    create role mandat_runner nologin nobypassrls;
  end if;
end $$;
grant usage on schema public to mandat_runner;

create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 100),
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.members (
  org_id uuid not null references public.orgs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'approver', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create table public.repos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  provider text not null check (provider in ('local', 'github')),
  full_name text not null,
  remote_url text not null,
  default_branch text not null default 'main',
  ruleset_strict boolean not null default false,
  created_at timestamptz not null default now(),
  unique (org_id, full_name)
);
create table public.task_types (
  org_id uuid not null references public.orgs (id) on delete cascade,
  repo_id uuid not null references public.repos (id) on delete cascade,
  name text not null check (name in ('bugfix', 'feature', 'css', 'docs')),
  risk_class text not null check (risk_class in ('low', 'medium', 'high')),
  primary key (repo_id, name)
);
create table public.tasks (
  id text primary key check (id ~ '^t_[a-z0-9_]{1,40}$'),
  org_id uuid not null references public.orgs (id) on delete cascade,
  repo_id uuid not null references public.repos (id) on delete cascade,
  type text not null check (type in ('bugfix', 'feature', 'css', 'docs')),
  agent text not null,
  text text not null check (length(text) between 1 and 4000),
  state text not null default 'CREATED' check (state in ('CREATED', 'CONTRACTED', 'PROVISIONING', 'RUNNING', 'EXPORTING', 'VERIFY_1', 'VERDICT', 'GATED', 'DELIVERED', 'HELD', 'BLOCKED', 'OUTCOME', 'CLOSED')),
  blocked_reason text,
  origin text not null default 'mandat' check (origin in ('mandat', 'external_pr', 'external_mcp')),
  attempt int not null default 1 check (attempt >= 1),
  state_entered_at timestamptz not null default now(),
  state_deadline_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index tasks_org_state on public.tasks (org_id, state);
create table public.task_steps (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.orgs (id) on delete cascade,
  task_id text not null references public.tasks (id) on delete cascade,
  attempt int not null check (attempt >= 1),
  kind text not null check (kind in ('provision', 'agent_run', 'export', 'baseline', 'verify', 'gate', 'deliver', 'outcome')),
  try int not null default 1 check (try >= 1),
  idempotency_key text not null unique,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  lease_owner text,
  lease_until timestamptz,
  pid int,
  container_label text,
  last_error text,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index task_steps_pending on public.task_steps (status, created_at) where status = 'pending';
create table public.changesets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  task_id text references public.tasks (id) on delete cascade,
  attempt int not null default 1 check (attempt >= 1),
  base_sha text not null check (base_sha ~ '^[0-9a-f]{40}$'),
  tree_sha text check (tree_sha ~ '^[0-9a-f]{40}$'),
  diff_hash text check (diff_hash ~ '^sha256:[0-9a-f]{64}$'),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'MERGED', 'WITHDRAWN', 'MIXED')),
  mode text not null default 'full' check (mode in ('full', 'external')),
  integrity text not null default 'pending' check (integrity in ('pending', 'ok', 'mismatch', 'n/a')),
  risk_class text check (risk_class in ('low', 'medium', 'high')),
  effective_level int check (effective_level between 0 and 3),
  requires_second_factor boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.verdicts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  task_id text not null,
  changeset_id uuid references public.changesets (id) on delete cascade,
  run_id text not null check (run_id ~ '^r_[0-9A-HJKMNP-TV-Z]{26}$'),
  attempt int not null check (attempt >= 1),
  mode text not null check (mode in ('full', 'external')),
  agent text not null,
  result text not null check (result in ('VERIFIED', 'FAILED', 'UNKNOWN')),
  reasons jsonb not null default '[]',
  base_sha text not null,
  tree_sha text,
  config_hash text,
  verdict_hash text not null,
  created_at timestamptz not null default now()
);
create index verdicts_key on public.verdicts (org_id, base_sha, tree_sha, config_hash);
create table public.evidence (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.orgs (id) on delete cascade,
  verdict_id uuid not null references public.verdicts (id) on delete cascade,
  detector text not null,
  phase int not null check (phase in (1, 2)),
  status text not null check (status in ('pass', 'fail', 'unknown', 'n/a')),
  summary text not null check (length(summary) <= 300),
  data jsonb not null default '{}',
  source text not null,
  signature text check (length(signature) <= 300)
);
create table public.failure_labels (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.orgs (id) on delete cascade,
  verdict_id uuid not null references public.verdicts (id) on delete cascade,
  layer text not null check (layer in ('agent', 'verification', 'infra', 'policy')),
  label text not null,
  by_user uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create table public.ladder_state (
  org_id uuid not null references public.orgs (id) on delete cascade,
  repo_id uuid not null references public.repos (id) on delete cascade,
  task_type text not null,
  agent text not null,
  level int not null default 0 check (level between 0 and 3),
  s_up double precision not null default 0 check (s_up >= 0),
  s_down double precision not null default 0 check (s_down >= 0),
  pinned boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (repo_id, task_type, agent)
);
create table public.ladder_events (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.orgs (id) on delete cascade,
  repo_id uuid not null,
  task_type text not null,
  agent text not null,
  input text not null check (input in ('success', 'failure', 'hard_fail', 'neutral', 'pin', 'unpin', 'seed')),
  level_before int not null,
  level_after int not null,
  s_up double precision not null,
  s_down double precision not null,
  task_id text,
  created_at timestamptz not null default now()
);
create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  changeset_id uuid not null references public.changesets (id) on delete cascade,
  level int not null check (level between 0 and 3),
  kind text not null check (kind in ('branch_only', 'draft_pr', 'pr', 'merge')),
  ref text,
  pr_number int,
  head_sha text,
  created_at timestamptz not null default now()
);
create table public.outcomes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  changeset_id uuid not null references public.changesets (id) on delete cascade,
  result text not null check (result in ('success', 'failure', 'hard_fail', 'neutral')),
  window_minutes int not null,
  tree_match boolean,
  decided_at timestamptz not null default now()
);
create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  changeset_id uuid not null references public.changesets (id) on delete cascade,
  user_id uuid not null references auth.users (id),
  decision text not null check (decision in ('approved', 'rejected')),
  method text not null check (method in ('tap', 'totp')),
  mfa_verified_at timestamptz,
  decided_at timestamptz not null default now()
);
create unique index approvals_one_approved on public.approvals (changeset_id) where decision = 'approved';
create table public.ledger (
  org_id uuid not null references public.orgs (id) on delete restrict,
  seq bigint not null check (seq >= 1),
  ts text not null,
  kind text not null,
  task_id text,
  payload_jcs text,
  payload jsonb,
  payload_hash text,
  prev_hash text,
  hash text not null,
  primary key (org_id, seq)
);
create table public.anchors (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.orgs (id) on delete cascade,
  seq_from bigint not null,
  seq_to bigint not null,
  root_hash text not null,
  tsa_url text not null,
  tsr bytea not null,
  gen_time timestamptz,
  created_at timestamptz not null default now()
);
create table public.budgets_usage (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.orgs (id) on delete cascade,
  task_id text not null,
  attempt int not null check (attempt >= 1),
  usd numeric(12, 6) not null default 0,
  day date not null default current_date
);
create table public.model_channels (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  label text not null,
  provider text not null check (provider in ('anthropic', 'openai')),
  kind text not null check (kind in ('api_key', 'cli_profile', 'local')),
  model text not null,
  enabled boolean not null default true,
  unique (org_id, label)
);
create table public.channel_usage (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.orgs (id) on delete cascade,
  channel_id uuid references public.model_channels (id) on delete set null,
  task_id text not null,
  attempt int not null check (attempt >= 1),
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  usd numeric(12, 6) not null default 0,
  created_at timestamptz not null default now()
);
create table public.routing_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  priority int not null,
  match jsonb not null default '{}',
  channel_id uuid not null references public.model_channels (id) on delete cascade
);
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);
create table public.repo_sync_state (
  repo_id uuid primary key references public.repos (id) on delete cascade,
  org_id uuid not null references public.orgs (id) on delete cascade,
  last_polled_at timestamptz,
  cursor text
);
create table public.sync_events (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.orgs (id) on delete cascade,
  repo_id uuid references public.repos (id) on delete cascade,
  source text not null check (source in ('webhook', 'poll')),
  delivery_id text unique,
  event text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create table public.security_events (
  id text primary key check (id ~ '^se_[0-9A-HJKMNP-TV-Z]{26}$'),
  org_id uuid not null references public.orgs (id) on delete cascade,
  task_id text,
  run_id text,
  attempt int check (attempt >= 1),
  kind text not null,
  severity text not null check (severity in ('info', 'warn', 'incident')),
  detail jsonb not null default '{}',
  source text not null,
  created_at timestamptz not null default now()
);
create table public.harness_proposals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  repo_id uuid not null references public.repos (id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'proposed', 'accepted', 'rejected')),
  policy_yaml text not null,
  created_at timestamptz not null default now()
);
create table public.task_activities (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.orgs (id) on delete cascade,
  task_id text not null references public.tasks (id) on delete cascade,
  kind text not null,
  text text not null check (length(text) <= 500),
  created_at timestamptz not null default now()
);
create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  settings jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
-- T3-2 (демо промпт т. 3.4): every external effect is a row here, in the same transaction as the decision.
create table public.outbox (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.orgs (id) on delete cascade,
  kind text not null check (kind in ('check_run', 'draft_pr', 'ready_for_review', 'approval_check', 'merge', 'push_branch', 'web_push')),
  idempotency_key text not null unique,
  payload jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index outbox_pending on public.outbox (created_at) where status = 'pending';

create view public.inbox_items with (security_invoker = true) as
  select c.org_id, c.id as changeset_id, c.task_id, t.type as task_type, t.agent, v.result, v.reasons, c.effective_level,
         c.requires_second_factor, c.created_at
    from public.changesets c
    join public.tasks t on t.id = c.task_id
    left join lateral (select result, reasons from public.verdicts where changeset_id = c.id order by created_at desc limit 1) v on true
   where t.state in ('GATED', 'HELD');
