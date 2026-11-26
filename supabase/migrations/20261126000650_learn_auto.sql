-- D-650 (Simo 26.11.2026, „за ученето да е автоматично, а не ръчно“). Learning no longer waits for a person: the worker
-- applies a learned change after the bench gate (profile_change, by: mandat) and rolls it back by itself when things get
-- worse. A person sees what was applied and reverts it with one button:
-- private.revert_trial(trial, layers, hash, user, mfa): approve.rules; the trial must be applied (accepted); only the
-- change's layer may differ from the current approved version, and something must differ. Reverting a change that can
-- weaken the verdict (flaky_test, tool_allow) only narrows: no TOTP. Reverting any other change widens: a fresh TOTP.
-- The revert is a new approved version (origin learn_revert, parent and trial), the trial becomes rolled_back, and a
-- profile_change row names who did it. needs_person (D-643) stays for the trials made before; nothing new sets it.

alter table public.harness_profiles drop constraint if exists harness_profiles_origin_check;
alter table public.harness_profiles add constraint harness_profiles_origin_check check (origin is null or origin in ('person', 'evolve', 'evolve_rollback', 'ablation', 'learn', 'learn_revert'));

create or replace function private.revert_trial(p_trial uuid, p_layers jsonb, p_hash text, p_user uuid, p_mfa_verified_at timestamptz)
  returns int language plpgsql security definer set search_path = '' as $$
declare
  tr public.profile_trials;
  cur public.harness_profiles;
  v_layer text;
  v_rule text;
  v_id uuid;
  v_version int;
  v_payload text;
begin
  select * into tr from public.profile_trials where id = p_trial for update;
  if not found then raise exception 'unknown proposal' using errcode = 'P0002'; end if;
  if not private.cap_of(p_user, tr.org_id, 'approve.rules', tr.repo_id, null, null) then
    raise exception 'not allowed to change the harness' using errcode = '42501';
  end if;
  if tr.status <> 'accepted' then raise exception 'proposal is %', tr.status using errcode = '55000'; end if;
  v_rule := tr.manifest -> 'change' ->> 'rule';
  -- a revert of a narrowing widens the agent's rights again
  if v_rule is null or v_rule not in ('flaky_test', 'tool_allow') then
    if p_mfa_verified_at is null or now() - p_mfa_verified_at > interval '2 minutes' or p_mfa_verified_at > now() + interval '5 seconds' then
      raise exception 'TOTP verification is missing or older than 2 minutes' using errcode = '42501';
    end if;
  end if;
  select h.* into cur from public.repos r join public.harness_profiles h on h.id = r.profile_id and h.status = 'approved' where r.id = tr.repo_id for update of h;
  if not found then raise exception 'the repo has no approved profile' using errcode = 'P0002'; end if;
  if p_hash is null or p_hash !~ '^sha256:[0-9a-f]{64}$' then raise exception 'bad profile hash' using errcode = '22023'; end if;
  v_layer := tr.manifest -> 'change' ->> 'layer';
  if v_layer is null or v_layer !~ '^[a-h]$' or p_layers is null or jsonb_typeof(p_layers) <> 'object' or (p_layers - v_layer) is distinct from (cur.layers - v_layer) then
    raise exception 'only the layer of the change may differ' using errcode = '22023';
  end if;
  if p_layers = cur.layers then raise exception 'nothing to revert' using errcode = '22023'; end if;
  if p_layers::text ~ '[​-‏‪-‮⁠-⁤﻿]' or p_layers::text ~ '[\U000E0000-\U000E007F]' then
    raise exception 'blocked: invisible characters in the profile' using errcode = '55000';
  end if;
  select coalesce(max(version), 0) + 1 into v_version from public.harness_profiles where repo_id = tr.repo_id;
  update public.harness_profiles set status = 'superseded' where id = cur.id;
  insert into public.harness_profiles (org_id, repo_id, version, layers, sources, profile_hash, status, approved_by, approved_at, mfa_verified_at, parent_id, origin, trial_id)
    values (tr.org_id, tr.repo_id, v_version, p_layers, cur.sources, p_hash, 'approved', p_user, now(), p_mfa_verified_at, cur.id, 'learn_revert', tr.id) returning id into v_id;
  update public.repos set profile_id = v_id where id = tr.repo_id;
  update public.profile_trials set status = 'rolled_back', decided_by = p_user, why = 'reverted by a person' where id = tr.id;
  -- JCS by hand: keys in order, strings through to_json
  v_payload := '{"action":"learn_revert"'
    || ',"by":' || to_json(p_user::text)::text
    || ',"change_key":' || to_json(tr.change_key)::text
    || ',"profile_hash":' || to_json(p_hash)::text
    || ',"profile_id":' || to_json(v_id::text)::text
    || ',"source":' || coalesce(to_json(tr.source)::text, 'null')
    || ',"trial_id":' || to_json(tr.id::text)::text
    || ',"version":' || v_version::text || '}';
  perform private.ledger_append(tr.org_id, 'profile_change', null, v_payload, 'sha256:' || encode(extensions.digest(convert_to(v_payload, 'UTF8'), 'sha256'), 'hex'));
  return v_version;
end $$;
revoke execute on function private.revert_trial(uuid, jsonb, text, uuid, timestamptz) from public, anon, authenticated;
grant execute on function private.revert_trial(uuid, jsonb, text, uuid, timestamptz) to service_role;
