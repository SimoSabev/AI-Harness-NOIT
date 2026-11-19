-- D-552 (М3 Х9): an "Other" profile kept with a name after a delivered job. One per org and axes key (size aside); the
-- conversation names it when a new task has the same axes. Only the server writes; the org's members read.
create table if not exists public.saved_profiles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  axes_key text not null check (length(axes_key) <= 300),
  name text not null check (length(name) between 1 and 80),
  axes jsonb not null check (jsonb_typeof(axes) = 'object'),
  plan jsonb not null check (jsonb_typeof(plan) = 'object' and length(plan::text) <= 4000),
  from_job text not null,
  created_at timestamptz not null default now(),
  unique (org_id, axes_key)
);
alter table public.saved_profiles enable row level security;
alter table public.saved_profiles force row level security;
revoke all on public.saved_profiles from anon, authenticated;
grant select on public.saved_profiles to authenticated;
create policy saved_profiles_read on public.saved_profiles for select to authenticated using ((select private.authorize('viewer', org_id)));
grant select, insert, update, delete on public.saved_profiles to service_role;
create policy saved_profiles_service on public.saved_profiles for all to service_role using (true) with check (true);
