-- E8б (v5 т. 4.2, D-351): the harness profile (layers A–H) in versions. proposed → approved (one per repo, the repo points at
-- it) → superseded. An approved version never changes in place; a rollback is a new version with the old layers.
create table if not exists public.harness_profiles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  repo_id uuid not null references public.repos (id) on delete cascade,
  version int not null check (version >= 1),
  layers jsonb not null,
  sources jsonb not null default '{}',
  profile_hash text not null check (profile_hash ~ '^sha256:[0-9a-f]{64}$'),
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'superseded')),
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  mfa_verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (repo_id, version)
);
alter table public.repos add column if not exists profile_id uuid references public.harness_profiles (id) on delete set null;

create or replace function private.harness_profiles_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status in ('approved', 'superseded') and (new.layers is distinct from old.layers or new.profile_hash is distinct from old.profile_hash or new.version is distinct from old.version) then
    raise exception 'an approved profile version is immutable; make a new version' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists harness_profiles_guard on public.harness_profiles;
create trigger harness_profiles_guard before update on public.harness_profiles for each row execute function private.harness_profiles_guard();

alter table public.harness_profiles enable row level security;
alter table public.harness_profiles force row level security;
revoke all on public.harness_profiles from anon, authenticated;
grant select on public.harness_profiles to authenticated;
create policy harness_profiles_read on public.harness_profiles for select to authenticated using ((select private.authorize('viewer', org_id)));

-- approve.rules + TOTP ≤ 2 min; invisible characters (bidi, zero-width, tag) anywhere in the layers → refused
create or replace function private.approve_profile(p_profile uuid, p_user uuid, p_mfa_verified_at timestamptz)
  returns int language plpgsql security definer set search_path = '' as $$
declare
  hp public.harness_profiles;
  v_payload text;
begin
  select * into hp from public.harness_profiles where id = p_profile for update;
  if not found then raise exception 'unknown profile' using errcode = 'P0002'; end if;
  if hp.status <> 'proposed' then raise exception 'profile is %', hp.status using errcode = '55000'; end if;
  if not private.cap_of(p_user, hp.org_id, 'approve.rules', hp.repo_id, null, null) then
    raise exception 'not allowed to approve the harness' using errcode = '42501';
  end if;
  if p_mfa_verified_at is null or now() - p_mfa_verified_at > interval '2 minutes' or p_mfa_verified_at > now() + interval '5 seconds' then
    raise exception 'TOTP verification is missing or older than 2 minutes' using errcode = '42501';
  end if;
  if hp.layers::text ~ '[​-‏‪-‮⁠-⁤﻿]' or hp.layers::text ~ '[\U000E0000-\U000E007F]' then
    raise exception 'blocked: invisible characters in the profile' using errcode = '55000';
  end if;
  update public.harness_profiles set status = 'superseded' where repo_id = hp.repo_id and status = 'approved';
  update public.harness_profiles set status = 'approved', approved_by = p_user, approved_at = now(), mfa_verified_at = p_mfa_verified_at where id = p_profile;
  update public.repos set profile_id = p_profile, harness_stale = false where id = hp.repo_id;
  v_payload := '{"action":"approve","profile_hash":' || to_json(hp.profile_hash)::text || ',"profile_id":' || to_json(p_profile::text)::text || ',"version":' || hp.version::text || '}';
  perform private.ledger_append(hp.org_id, 'profile_change', null, v_payload, 'sha256:' || encode(extensions.digest(convert_to(v_payload, 'UTF8'), 'sha256'), 'hex'));
  return hp.version;
end $$;

-- a rollback is a new version (the next number) with the layers of an earlier approved/superseded one, approved at once
create or replace function private.rollback_profile(p_repo uuid, p_version int, p_user uuid, p_mfa_verified_at timestamptz)
  returns int language plpgsql security definer set search_path = '' as $$
declare
  old_p public.harness_profiles;
  v_next int;
  v_id uuid;
begin
  select * into old_p from public.harness_profiles where repo_id = p_repo and version = p_version and status in ('approved', 'superseded');
  if not found then raise exception 'unknown approved version' using errcode = 'P0002'; end if;
  select coalesce(max(version), 0) + 1 into v_next from public.harness_profiles where repo_id = p_repo;
  insert into public.harness_profiles (org_id, repo_id, version, layers, sources, profile_hash)
    values (old_p.org_id, p_repo, v_next, old_p.layers, old_p.sources, old_p.profile_hash) returning id into v_id;
  return private.approve_profile(v_id, p_user, p_mfa_verified_at);
end $$;
revoke execute on function private.approve_profile(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke execute on function private.rollback_profile(uuid, int, uuid, timestamptz) from public, anon, authenticated;
grant execute on function private.approve_profile(uuid, uuid, timestamptz) to service_role;
grant execute on function private.rollback_profile(uuid, int, uuid, timestamptz) to service_role;
