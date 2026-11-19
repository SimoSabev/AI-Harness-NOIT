-- D-545 (М2 Х5): a pilot on large work. The first units (closed under their dependencies) are the pilot; the rest waits
-- until the pilot passed and its lessons are written down as a playbook that every later unit gets.

alter table public.job_units add column if not exists pilot boolean not null default false;
alter table public.jobs add column if not exists pilot_state text not null default 'none' check (pilot_state in ('none', 'running', 'tuned'));
alter table public.jobs add column if not exists playbook text check (playbook is null or length(playbook) <= 4000);
