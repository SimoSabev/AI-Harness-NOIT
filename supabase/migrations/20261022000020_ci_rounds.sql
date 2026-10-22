-- E8g (v5 p. 4.7 (3), AC-9.2, D-356): rounds of the project's CI on Mandat's PR, and the head already judged.
alter table public.tasks add column if not exists ci_rounds int not null default 0 check (ci_rounds >= 0);
alter table public.tasks add column if not exists ci_checked_sha text check (ci_checked_sha ~ '^[0-9a-f]{40}$');
alter table public.tasks drop constraint if exists tasks_retry_reason_check;
alter table public.tasks add constraint tasks_retry_reason_check check (retry_reason in ('channel', 'auto', 'human', 'conflict', 'rebase', 'ci'));
