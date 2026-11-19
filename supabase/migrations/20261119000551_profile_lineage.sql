-- D-551 (М3 Х9): the archive with lineage. Every version of a project's harness profile names the version it came from,
-- how (a person, a change Mandat accepted, a roll back, a removal trial) and the trial behind it. Old versions stay
-- (superseded), so the chain from the first version to the current one can always be read back.
alter table public.harness_profiles add column if not exists parent_id uuid references public.harness_profiles (id) on delete set null;
alter table public.harness_profiles add column if not exists origin text check (origin is null or origin in ('person', 'evolve', 'evolve_rollback', 'ablation'));
alter table public.harness_profiles add column if not exists trial_id uuid references public.profile_trials (id) on delete set null;
