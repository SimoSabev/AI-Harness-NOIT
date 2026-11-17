-- D-535 (М1 Х6/Х7 minimum): a job. "Start work" on an approved spec with an approved oracle makes a job; a planner
-- splits it into units; each unit is a task of its own (a fresh agent context) on the job's branch in Mandat's mirror;
-- the last task checks the branch head against the full oracle; the job ends in a seal one person approves before the
-- branch goes into main. Members read; only the server writes.

create table if not exists public.jobs (
  id text primary key check (id ~ '^j_[a-z0-9]{1,40}$'),
  org_id uuid not null references public.orgs (id) on delete cascade,
  repo_id uuid not null references public.repos (id) on delete cascade,
  conversation_id text not null references public.conversations (id) on delete cascade,
  spec_hash text not null check (spec_hash ~ '^sha256:[0-9a-f]{64}$'),
  oracle_hash text not null check (oracle_hash ~ '^sha256:[0-9a-f]{64}$'),
  type text not null,
  agent text not null,
  model text,
  status text not null default 'planning' check (status in ('planning', 'running', 'converging', 'parked', 'sealed', 'approved', 'delivered', 'failed')),
  plan_hash text check (plan_hash is null or plan_hash ~ '^sha256:[0-9a-f]{64}$'),
  plan_rounds int not null default 0,
  problems jsonb not null default '[]'::jsonb check (jsonb_typeof(problems) = 'array' and pg_column_size(problems) <= 65536),
  -- main of the mirror when the job started, and the head of its branch mandat/job-<id>
  base_sha text check (base_sha is null or base_sha ~ '^[0-9a-f]{40}$'),
  head_sha text check (head_sha is null or head_sha ~ '^[0-9a-f]{40}$'),
  converge_round int not null default 0,
  final_task_id text references public.tasks (id) on delete set null,
  -- a question to a person when the job parks (criterion ids and reasons, never a test)
  question text check (question is null or length(question) <= 2000),
  seal jsonb check (seal is null or jsonb_typeof(seal) = 'object'),
  seal_hash text check (seal_hash is null or seal_hash ~ '^sha256:[0-9a-f]{64}$'),
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  merged_sha text check (merged_sha is null or merged_sha ~ '^[0-9a-f]{40}$'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status not in ('sealed', 'approved', 'delivered') or (seal is not null and seal_hash is not null)),
  check (status not in ('approved', 'delivered') or approved_at is not null)
);
create index if not exists jobs_conversation on public.jobs (conversation_id, created_at desc);
create index if not exists jobs_status on public.jobs (status) where status in ('planning', 'running', 'converging', 'approved');

create table if not exists public.job_units (
  job_id text not null references public.jobs (id) on delete cascade,
  unit_id text not null check (unit_id ~ '^[a-z0-9][a-z0-9_.-]{0,63}$'),
  org_id uuid not null references public.orgs (id) on delete cascade,
  ord int not null,
  title text not null check (length(title) between 1 and 200),
  criteria jsonb not null check (jsonb_typeof(criteria) = 'array'),
  depends_on jsonb not null default '[]'::jsonb check (jsonb_typeof(depends_on) = 'array'),
  status text not null default 'pending' check (status in ('pending', 'running', 'passed', 'failed', 'blocked')),
  round int not null default 0,
  task_id text references public.tasks (id) on delete set null,
  result text check (result is null or result in ('VERIFIED', 'FAILED', 'UNKNOWN')),
  reasons jsonb not null default '[]'::jsonb check (jsonb_typeof(reasons) = 'array'),
  -- the criterion ids whose hidden checks failed in the last attempt (never a test name)
  failing jsonb not null default '[]'::jsonb check (jsonb_typeof(failing) = 'array'),
  handoff jsonb check (handoff is null or (jsonb_typeof(handoff) = 'object' and pg_column_size(handoff) <= 16384)),
  commit_sha text check (commit_sha is null or commit_sha ~ '^[0-9a-f]{40}$'),
  updated_at timestamptz not null default now(),
  primary key (job_id, unit_id),
  unique (job_id, ord)
);

alter table public.tasks add column if not exists job_id text references public.jobs (id) on delete set null;
alter table public.tasks add column if not exists unit_id text;
alter table public.tasks add column if not exists job_role text check (job_role is null or job_role in ('unit', 'final'));
create index if not exists tasks_job on public.tasks (job_id) where job_id is not null;
alter table public.conversations add column if not exists job_id text references public.jobs (id) on delete set null;

do $$
declare t text;
begin
  foreach t in array array['jobs', 'job_units'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select private.authorize(''viewer'', org_id)))', t || '_read', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
    execute format('drop policy if exists %I on public.%I', t || '_service', t);
    execute format('create policy %I on public.%I for all to service_role using (true) with check (true)', t || '_service', t);
  end loop;
end $$;
