-- E8f (v5 p. 4.6, AC-4.2/4.5, D-355): a task that waits for another (same file), and the retry reasons conflict / rebase.
alter table public.tasks add column if not exists wait_for text references public.tasks (id) on delete set null;
alter table public.tasks drop constraint if exists tasks_retry_reason_check;
alter table public.tasks add constraint tasks_retry_reason_check check (retry_reason in ('channel', 'auto', 'human', 'conflict', 'rebase'));
create index if not exists tasks_repo_state on public.tasks (repo_id, state);
