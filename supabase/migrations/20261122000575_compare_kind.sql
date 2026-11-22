-- D-575 (live test 22.11.2026): the M4 single-agent arm is a task of its own kind. It is verified and judged like any
-- task but never delivered: run 1's arm was merged into the local project's main and every later run started on it.
alter table public.tasks drop constraint if exists tasks_kind_check;
alter table public.tasks add constraint tasks_kind_check check (kind in ('work', 'oracle', 'compare'));
