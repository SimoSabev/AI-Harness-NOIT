-- E9д „учене“ (spec 5.5, PRD 6.11, AC-11.4; D-640, D-643). Learning proposes, a person approves:
-- 1. a proposal for the profile is a profile_trial with the rule that made it (`source rule:<name>`) and whether only a
--    person may accept it (`needs_person`: flaky, allow/deny of a tool). Its content never changes after it is written;
-- 2. a person decides through private.decide_trial: approve.rules + TOTP ≤ 2 min; an approval is a new version through
--    approve_profile (origin 'learn'); either decision is a config_change row in the ledger;
-- 3. AC-11.4: no field of an approved or superseded version changes in place (before E9д only layers, hash and
--    version were guarded); the only move left is approved → superseded;
-- 4. learn_cards: what is for a person to read and not a profile change (a model regression).

alter table public.profile_trials add column if not exists source text check (source is null or source ~ '^rule:[a-z0-9_]{1,40}$');
alter table public.profile_trials add column if not exists needs_person boolean not null default false;
alter table public.profile_trials add column if not exists decided_by uuid references auth.users (id);
alter table public.harness_profiles drop constraint if exists harness_profiles_origin_check;
alter table public.harness_profiles add constraint harness_profiles_origin_check check (origin is null or origin in ('person', 'evolve', 'evolve_rollback', 'ablation', 'learn'));

-- AC-11.4. parent_id and trial_id may only become null: that is the foreign key's own `on delete set null`.
create or replace function private.harness_profiles_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status in ('approved', 'superseded') then
    if (new.org_id, new.repo_id, new.version, new.layers, new.sources, new.profile_hash, new.origin, new.approved_by, new.approved_at, new.mfa_verified_at, new.created_at)
         is distinct from (old.org_id, old.repo_id, old.version, old.layers, old.sources, old.profile_hash, old.origin, old.approved_by, old.approved_at, old.mfa_verified_at, old.created_at)
       or (new.parent_id is distinct from old.parent_id and new.parent_id is not null)
       or (new.trial_id is distinct from old.trial_id and new.trial_id is not null)
       or (old.status = 'superseded' and new.status <> 'superseded')
       or (old.status = 'approved' and new.status not in ('approved', 'superseded')) then
      raise exception 'an approved profile version is immutable; make a new version' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

-- a proposal is what it was when it was made; its status only moves forward
create or replace function private.profile_trials_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.org_id, new.repo_id, new.change_key, new.manifest, new.from_profile, new.source, new.needs_person, new.created_at)
       is distinct from (old.org_id, old.repo_id, old.change_key, old.manifest, old.from_profile, old.source, old.needs_person, old.created_at)
     or (old.status in ('refused', 'rolled_back') and new.status <> old.status)
     or (old.status = 'accepted' and new.status not in ('accepted', 'rolled_back')) then
    raise exception 'a profile proposal is immutable once made; its status only moves forward' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists profile_trials_guard on public.profile_trials;
create trigger profile_trials_guard before update on public.profile_trials for each row execute function private.profile_trials_guard();

-- A person decides a proposal. p_layers: the current approved layers with the change applied (computed by the caller
-- from the contract); the database checks that only the change's layer differs. Approve → the new version number;
-- refuse → 0. Always a config_change row.
create or replace function private.decide_trial(p_trial uuid, p_accept boolean, p_layers jsonb, p_hash text, p_user uuid, p_mfa_verified_at timestamptz)
  returns int language plpgsql security definer set search_path = '' as $$
declare
  tr public.profile_trials;
  cur public.harness_profiles;
  v_layer text;
  v_id uuid;
  v_version int := 0;
  v_payload text;
begin
  select * into tr from public.profile_trials where id = p_trial for update;
  if not found then raise exception 'unknown proposal' using errcode = 'P0002'; end if;
  if tr.status not in ('proposed', 'benched') then raise exception 'proposal is %', tr.status using errcode = '55000'; end if;
  if not private.cap_of(p_user, tr.org_id, 'approve.rules', tr.repo_id, null, null) then
    raise exception 'not allowed to approve the harness' using errcode = '42501';
  end if;
  if p_accept then
    if p_mfa_verified_at is null or now() - p_mfa_verified_at > interval '2 minutes' or p_mfa_verified_at > now() + interval '5 seconds' then
      raise exception 'TOTP verification is missing or older than 2 minutes' using errcode = '42501';
    end if;
    select h.* into cur from public.repos r join public.harness_profiles h on h.id = r.profile_id and h.status = 'approved' where r.id = tr.repo_id for update of h;
    if not found then raise exception 'the repo has no approved profile' using errcode = 'P0002'; end if;
    if p_hash is null or p_hash !~ '^sha256:[0-9a-f]{64}$' then raise exception 'bad profile hash' using errcode = '22023'; end if;
    v_layer := tr.manifest -> 'change' ->> 'layer';
    if v_layer is null or v_layer !~ '^[a-h]$' or p_layers is null or jsonb_typeof(p_layers) <> 'object' or (p_layers - v_layer) is distinct from (cur.layers - v_layer) then
      raise exception 'only the layer of the proposed change may differ' using errcode = '22023';
    end if;
    select coalesce(max(version), 0) + 1 into v_version from public.harness_profiles where repo_id = tr.repo_id;
    insert into public.harness_profiles (org_id, repo_id, version, layers, sources, profile_hash, parent_id, origin, trial_id)
      values (tr.org_id, tr.repo_id, v_version, p_layers, cur.sources, p_hash, cur.id, 'learn', tr.id) returning id into v_id;
    v_version := private.approve_profile(v_id, p_user, p_mfa_verified_at);
    update public.profile_trials set status = 'accepted', to_profile = v_id, decided_by = p_user, decided_at = now(), why = 'approved by a person' where id = tr.id;
  else
    update public.profile_trials set status = 'refused', decided_by = p_user, decided_at = now(), why = 'refused by a person' where id = tr.id;
  end if;
  -- JCS by hand: keys in order, strings through to_json
  v_payload := '{"action":' || to_json(case when p_accept then 'learn_approve' else 'learn_refuse' end)::text
    || ',"by":' || to_json(p_user::text)::text
    || ',"change_key":' || to_json(tr.change_key)::text
    || ',"profile_id":' || coalesce(to_json(v_id::text)::text, 'null')
    || ',"source":' || coalesce(to_json(tr.source)::text, 'null')
    || ',"trial_id":' || to_json(tr.id::text)::text
    || ',"version":' || v_version::text || '}';
  perform private.ledger_append(tr.org_id, 'config_change', null, v_payload, 'sha256:' || encode(extensions.digest(convert_to(v_payload, 'UTF8'), 'sha256'), 'hex'));
  return v_version;
end $$;
revoke execute on function private.decide_trial(uuid, boolean, jsonb, text, uuid, timestamptz) from public, anon, authenticated;
grant execute on function private.decide_trial(uuid, boolean, jsonb, text, uuid, timestamptz) to service_role;

create table if not exists public.learn_cards (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  repo_id uuid references public.repos (id) on delete cascade,
  card_key text not null check (length(card_key) between 1 and 300),
  card jsonb not null check (jsonb_typeof(card) = 'object' and length(card::text) <= 4000),
  status text not null default 'open' check (status in ('open', 'dismissed')),
  dismissed_by uuid references auth.users (id),
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, card_key)
);
create or replace function private.learn_cards_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.org_id, new.repo_id, new.card_key, new.card, new.created_at) is distinct from (old.org_id, old.repo_id, old.card_key, old.card, old.created_at) then
    raise exception 'a learning card is never rewritten' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists learn_cards_guard on public.learn_cards;
create trigger learn_cards_guard before update on public.learn_cards for each row execute function private.learn_cards_guard();
alter table public.learn_cards enable row level security;
alter table public.learn_cards force row level security;
revoke all on public.learn_cards from anon, authenticated;
grant select on public.learn_cards to authenticated;
create policy learn_cards_read on public.learn_cards for select to authenticated using ((select private.authorize('viewer', org_id)));
grant select, insert, update, delete on public.learn_cards to service_role;
create policy learn_cards_service on public.learn_cards for all to service_role using (true) with check (true);
