-- D-542 (М2 Х6): a unit that stopped after its normal attempts is rescued once: a model's advice and RESCUE_TRIES fresh
-- tries at the same time (tries = their task ids). When they all fail the unit is 'parked' with its own question; the
-- rest of the job goes on, and the job parks only when nothing else can move.

alter table public.job_units add column if not exists rescues int not null default 0 check (rescues >= 0);
alter table public.job_units add column if not exists tries jsonb not null default '[]'::jsonb check (jsonb_typeof(tries) = 'array');
alter table public.job_units add column if not exists question text check (question is null or length(question) <= 2000);
alter table public.job_units drop constraint if exists job_units_status_check;
alter table public.job_units add constraint job_units_status_check check (status in ('pending', 'running', 'passed', 'failed', 'blocked', 'parked'));
