-- v5 E9б (5.2, D-362): D5 hidden tests — a person's tests the agent never sees. The files are in a private table that
-- only the service reads (the worker copies them into tree B at verification); members see the metadata. A new version
-- needs a TOTP from the last 2 minutes (the database checks the time, not the caller) and is a ledger row.
create table if not exists private.hidden_tests (
  repo_id uuid not null references public.repos (id) on delete cascade,
  version int not null check (version >= 1),
  files jsonb not null check (jsonb_typeof(files) = 'array'),
  primary key (repo_id, version)
);
revoke all on private.hidden_tests from public, anon, authenticated;

create table if not exists public.hidden_test_sets (
  org_id uuid not null references public.orgs (id) on delete cascade,
  repo_id uuid not null references public.repos (id) on delete cascade,
  version int not null check (version >= 1),
  hash text not null check (hash ~ '^sha256:[0-9a-f]{64}$'),
  files int not null check (files between 1 and 200),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  primary key (repo_id, version)
);
alter table public.hidden_test_sets enable row level security;
alter table public.hidden_test_sets force row level security;
revoke all on public.hidden_test_sets from anon, authenticated;
grant select on public.hidden_test_sets to authenticated;
create policy hidden_test_sets_read on public.hidden_test_sets for select to authenticated using ((select private.authorize('viewer', org_id)));

create or replace function private.add_hidden_tests(p_repo uuid, p_files jsonb, p_hash text, p_user uuid, p_mfa_verified_at timestamptz)
  returns int language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_next int;
  v_n int;
  v_payload text;
begin
  select org_id into v_org from public.repos where id = p_repo;
  if not found then raise exception 'unknown repo' using errcode = 'P0002'; end if;
  if p_mfa_verified_at is null or now() - p_mfa_verified_at > interval '2 minutes' or p_mfa_verified_at > now() + interval '5 seconds' then
    raise exception 'hidden tests need a TOTP code from the last 2 minutes' using errcode = '42501';
  end if;
  if p_hash !~ '^sha256:[0-9a-f]{64}$' or jsonb_typeof(p_files) <> 'array' then raise exception 'bad hidden tests' using errcode = '22023'; end if;
  v_n := jsonb_array_length(p_files);
  if v_n < 1 or v_n > 200 or length(p_files::text) > 7 * 1024 * 1024 then raise exception 'hidden tests: 1–200 files, ≤ 5 MB' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(p_files) f
              where jsonb_typeof(f -> 'path') <> 'string' or jsonb_typeof(f -> 'data') <> 'string'
                 or (f ->> 'path') !~ '^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)*$' or (f ->> 'path') ~ '(^|/)\.\.(/|$)') then
    raise exception 'a hidden test path must stay inside the hidden directory' using errcode = '22023';
  end if;
  select coalesce(max(version), 0) + 1 into v_next from public.hidden_test_sets where repo_id = p_repo;
  insert into private.hidden_tests (repo_id, version, files) values (p_repo, v_next, p_files);
  insert into public.hidden_test_sets (org_id, repo_id, version, hash, files, created_by) values (v_org, p_repo, v_next, p_hash, v_n, p_user);
  v_payload := '{"files":' || v_n::text || ',"hash":' || to_json(p_hash)::text || ',"repo_id":' || to_json(p_repo::text)::text || ',"version":' || v_next::text || '}';
  perform private.ledger_append(v_org, 'hidden_tests', null, v_payload, 'sha256:' || encode(extensions.digest(convert_to(v_payload, 'UTF8'), 'sha256'), 'hex'));
  return v_next;
end $$;
revoke all on function private.add_hidden_tests(uuid, jsonb, text, uuid, timestamptz) from public, anon, authenticated;
grant execute on function private.add_hidden_tests(uuid, jsonb, text, uuid, timestamptz) to service_role;
grant select on private.hidden_tests to service_role;
