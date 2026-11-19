-- D-547 (М3 Х8): the green branch. When main moved between the seal and the merge, the job's change is built again on
-- the new main and checked again; restacks counts how often (capped by the worker).
alter table public.jobs add column if not exists restacks integer not null default 0 check (restacks between 0 and 20);
