-- D-360 (Simo, 23.10.2026): the task type "free" — no scope limits (the whole repo, tests may change). The judge still runs.
alter table public.tasks drop constraint if exists tasks_type_check;
alter table public.tasks add constraint tasks_type_check check (type in ('bugfix', 'feature', 'css', 'docs', 'free'));
alter table public.task_types drop constraint if exists task_types_name_check;
alter table public.task_types add constraint task_types_name_check check (name in ('bugfix', 'feature', 'css', 'docs', 'free'));
alter table public.night_queue drop constraint if exists night_queue_type_check;
alter table public.night_queue add constraint night_queue_type_check check (type in ('bugfix', 'feature', 'css', 'docs', 'free'));
