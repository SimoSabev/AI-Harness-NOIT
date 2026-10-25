-- v5 E9б (5.2, D-364): the D12 screenshots of a changeset (after = route-N.png, before = base-route-N.png) for the card.
-- approver+ like the diff (a screenshot of the app can show what the code shows); only the worker writes.
create table if not exists public.changeset_shots (
  changeset_id uuid not null references public.changesets (id) on delete cascade,
  org_id uuid not null references public.orgs (id) on delete cascade,
  name text not null check (name ~ '^(base-)?route-[0-4]\.png$'),
  png bytea not null check (octet_length(png) <= 5242880),
  created_at timestamptz not null default now(),
  primary key (changeset_id, name)
);
alter table public.changeset_shots enable row level security;
alter table public.changeset_shots force row level security;
revoke all on public.changeset_shots from anon, authenticated;
grant select on public.changeset_shots to authenticated;
create policy changeset_shots_read on public.changeset_shots for select to authenticated using ((select private.authorize('approver', org_id)));
grant select, insert on public.changeset_shots to service_role;
create policy changeset_shots_service on public.changeset_shots for all to service_role using (true) with check (true);
