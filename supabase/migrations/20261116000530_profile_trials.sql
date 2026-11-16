-- D-530 „профилът се развива с доказателства“ (approved by Simo 16.11.2026). A trial of one narrowing change of a
-- project's harness profile: the manifest (the change, the evidence, a prediction), the version it starts from and the
-- version it made, the bench before/after, and where it stands. Only the server writes; the org's members read.
create table if not exists public.profile_trials (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  repo_id uuid not null references public.repos (id) on delete cascade,
  change_key text not null check (length(change_key) <= 300),
  manifest jsonb not null check (jsonb_typeof(manifest) = 'object' and length(manifest::text) <= 8000),
  from_profile uuid not null references public.harness_profiles (id) on delete cascade,
  to_profile uuid references public.harness_profiles (id) on delete set null,
  status text not null default 'proposed' check (status in ('proposed', 'benched', 'accepted', 'refused', 'rolled_back')),
  bench jsonb,
  why text check (length(why) <= 500),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
-- one open trial per change of a project; a refused or rolled back change is not proposed again
create unique index if not exists profile_trials_one on public.profile_trials (repo_id, change_key);
alter table public.profile_trials enable row level security;
alter table public.profile_trials force row level security;
revoke all on public.profile_trials from anon, authenticated;
grant select on public.profile_trials to authenticated;
create policy profile_trials_read on public.profile_trials for select to authenticated using ((select private.authorize('viewer', org_id)));
grant select, insert, update, delete on public.profile_trials to service_role;
create policy profile_trials_service on public.profile_trials for all to service_role using (true) with check (true);
