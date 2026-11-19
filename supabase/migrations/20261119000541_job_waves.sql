-- D-541 (М2 Х5/Х6): a team only where the work divides. A job runs its units one at a time ('single', М1) or in waves
-- ('waves': every unit whose dependencies passed starts at once, each in its own task and copy). A unit that no longer
-- applies onto the moved branch is built again on the new head; relands counts that.

alter table public.jobs add column if not exists mode text not null default 'single' check (mode in ('single', 'waves'));
alter table public.job_units add column if not exists relands int not null default 0 check (relands >= 0);
