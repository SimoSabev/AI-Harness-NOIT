-- E3а (демо промпт т. 8.1): the diff of a changeset and the task activities are approver+ (rls-web: viewer does not
-- see them); the dev login of MANDAT_DEMO_DEV_AUTH=1 (D-285) checks auth.users.encrypted_password and a TOTP secret.

create table if not exists public.changeset_diffs (
  changeset_id uuid primary key references public.changesets (id) on delete cascade,
  org_id uuid not null references public.orgs (id) on delete cascade,
  diff text not null check (octet_length(diff) <= 1048576),
  created_at timestamptz not null default now()
);
alter table public.changeset_diffs enable row level security;
alter table public.changeset_diffs force row level security;
revoke all on public.changeset_diffs from anon, authenticated;
grant select on public.changeset_diffs to authenticated;
create policy changeset_diffs_read on public.changeset_diffs for select to authenticated using ((select private.authorize('approver', org_id)));

drop policy if exists task_activities_read on public.task_activities;
create policy task_activities_read on public.task_activities for select to authenticated using ((select private.authorize('approver', org_id)));

-- D-285: only for the local demo (dev login + TOTP without GoTrue MFA). No grants: the server reads it as postgres.
create table if not exists private.dev_totp (
  user_id uuid primary key references auth.users (id) on delete cascade,
  secret_b32 text not null check (secret_b32 ~ '^[A-Z2-7]{32}$'),
  created_at timestamptz not null default now()
);
revoke all on private.dev_totp from public, anon, authenticated;

-- Only service_role (the web's Route Handlers) may call these; the password check runs inside the database.
create or replace function private.dev_login(p_email text, p_password text) returns uuid
  language sql stable security definer set search_path = '' as $$
  select u.id from auth.users u
   where lower(u.email) = lower(p_email) and u.encrypted_password is not null
     and u.encrypted_password = extensions.crypt(p_password, u.encrypted_password)
   limit 1
$$;
create or replace function private.dev_totp_secret(p_user uuid) returns text
  language sql stable security definer set search_path = '' as $$
  select secret_b32 from private.dev_totp where user_id = p_user
$$;
revoke execute on function private.dev_login(text, text) from public, anon, authenticated;
revoke execute on function private.dev_totp_secret(uuid) from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.dev_login(text, text) to service_role;
grant execute on function private.dev_totp_secret(uuid) to service_role;
