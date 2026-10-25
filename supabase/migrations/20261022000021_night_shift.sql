-- E9а (v5 5.1, D-320): the night shift. A task belongs to at most one shift; a night item can be parked (the branch with
-- the partial work stays, a question explains it) or skipped with a note (e.g. budget); a parked task gets a question:
-- what stopped it in human words, the attempts, a deterministic proposal. Written by the service (worker, web server);
-- members read. A night retry has its own reason.
alter table public.tasks add column if not exists shift_id uuid references public.night_shifts (id) on delete set null;
create index if not exists tasks_shift on public.tasks (shift_id) where shift_id is not null;

alter table public.night_queue drop constraint if exists night_queue_status_check;
alter table public.night_queue add constraint night_queue_status_check check (status in ('queued', 'running', 'merged', 'waiting', 'failed', 'skipped', 'parked'));
alter table public.night_queue add column if not exists note text check (note is null or length(note) <= 200);
alter table public.night_queue add column if not exists type text not null default 'bugfix' check (type in ('bugfix', 'feature', 'css', 'docs'));

alter table public.tasks drop constraint if exists tasks_retry_reason_check;
alter table public.tasks add constraint tasks_retry_reason_check check (retry_reason in ('channel', 'auto', 'human', 'conflict', 'rebase', 'ci', 'night'));

create table if not exists public.night_questions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  shift_id uuid not null references public.night_shifts (id) on delete cascade,
  task_id text not null references public.tasks (id) on delete cascade,
  what_stopped text not null check (length(what_stopped) <= 1000),
  tried jsonb not null default '[]' check (jsonb_typeof(tried) = 'array' and jsonb_array_length(tried) <= 10),
  proposal text not null check (length(proposal) <= 2000),
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  answer text check (answer is null or length(answer) <= 2000),
  answered_by uuid references auth.users (id),
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (shift_id, task_id)
);
create index if not exists night_questions_shift on public.night_questions (shift_id, created_at);
alter table public.night_questions enable row level security;
alter table public.night_questions force row level security;
revoke all on public.night_questions from anon, authenticated;
grant select on public.night_questions to authenticated;
create policy night_questions_read on public.night_questions for select to authenticated using ((select private.authorize('viewer', org_id)));
