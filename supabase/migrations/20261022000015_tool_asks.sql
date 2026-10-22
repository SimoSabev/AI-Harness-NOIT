-- E8g (v5 p. 4.4, D-352): the "ask" flow and the permission matrix as the source of layer C.
-- tool_asks: what an agent asked for during an attempt (from the hook's asks.jsonl, filtered by the worker against the
-- policy). A person decides: once (a new attempt with a temporary allow), always (a tool_permissions row + a new layer C
-- version), deny (the task is closed). Written only by the service (worker and web server); members read.
create table if not exists public.tool_asks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  task_id text not null references public.tasks (id) on delete cascade,
  attempt int not null check (attempt >= 1),
  tool text not null check (length(tool) between 1 and 160),
  reason text not null default '' check (length(reason) <= 200),
  status text not null default 'pending' check (status in ('pending', 'once', 'always', 'denied')),
  grant_attempt int check (grant_attempt >= 1),
  decided_by uuid references auth.users (id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (task_id, attempt, tool)
);
create index if not exists tool_asks_task on public.tool_asks (task_id, attempt);
alter table public.tool_asks enable row level security;
alter table public.tool_asks force row level security;
revoke all on public.tool_asks from anon, authenticated;
grant select on public.tool_asks to authenticated;
create policy tool_asks_read on public.tool_asks for select to authenticated using ((select private.authorize('viewer', org_id)));

-- A new approved version of the repo's profile where ONLY layer C differs (the caller computed it from tool_permissions
-- and checked the capability). Opening a way out (a rule that becomes allow on net:* or bash:git push) needs TOTP ≤ 2 min;
-- the database decides that by comparing the old and the new layer C, not by trusting the caller.
create or replace function private.layer_c_version(p_repo uuid, p_layers jsonb, p_hash text, p_user uuid, p_mfa_verified_at timestamptz, p_why jsonb)
  returns int language plpgsql security definer set search_path = '' as $$
declare
  hp public.harness_profiles;
  v_next int;
  v_id uuid;
  v_dangerous boolean;
  v_payload text;
begin
  select h.* into hp from public.repos r join public.harness_profiles h on h.id = r.profile_id and h.status = 'approved' where r.id = p_repo for update of h;
  if not found then raise exception 'the repo has no approved profile' using errcode = 'P0002'; end if;
  if p_hash !~ '^sha256:[0-9a-f]{64}$' then raise exception 'bad profile hash' using errcode = '22023'; end if;
  if (p_layers - 'c') is distinct from (hp.layers - 'c') or jsonb_typeof(p_layers -> 'c') <> 'array' then
    raise exception 'only layer C may change here' using errcode = '22023';
  end if;
  if p_layers::text ~ '[​-‏‪-‮⁠-⁤﻿]' or p_layers::text ~ '[\U000E0000-\U000E007F]' then
    raise exception 'blocked: invisible characters in the profile' using errcode = '55000';
  end if;
  select exists (
    select 1 from jsonb_array_elements(p_layers -> 'c') n
     where n ->> 'decision' = 'allow' and (n ->> 'tool' like 'net:%' or n ->> 'tool' ~ '^bash:git\s+push(\s|$)')
       and not exists (select 1 from jsonb_array_elements(coalesce(hp.layers -> 'c', '[]'::jsonb)) o
                        where o ->> 'subject' = n ->> 'subject' and o ->> 'tool' = n ->> 'tool' and o ->> 'decision' = 'allow')
  ) into v_dangerous;
  if v_dangerous and (p_mfa_verified_at is null or now() - p_mfa_verified_at > interval '2 minutes' or p_mfa_verified_at > now() + interval '5 seconds') then
    raise exception 'opening net:* or git push needs a TOTP code from the last 2 minutes' using errcode = '42501';
  end if;
  select coalesce(max(version), 0) + 1 into v_next from public.harness_profiles where repo_id = p_repo;
  update public.harness_profiles set status = 'superseded' where id = hp.id;
  insert into public.harness_profiles (org_id, repo_id, version, layers, sources, profile_hash, status, approved_by, approved_at, mfa_verified_at)
    values (hp.org_id, p_repo, v_next, p_layers, hp.sources, p_hash, 'approved', p_user, now(), case when v_dangerous then p_mfa_verified_at end)
    returning id into v_id;
  update public.repos set profile_id = v_id where id = p_repo;
  v_payload := '{"action":"layer_c","profile_hash":' || to_json(p_hash)::text || ',"profile_id":' || to_json(v_id::text)::text || ',"version":' || v_next::text
    || ',"dangerous":' || v_dangerous::text || ',"why":' || coalesce(p_why, '{}'::jsonb)::text || '}';
  perform private.ledger_append(hp.org_id, 'profile_change', null, v_payload, 'sha256:' || encode(extensions.digest(convert_to(v_payload, 'UTF8'), 'sha256'), 'hex'));
  return v_next;
end $$;
revoke execute on function private.layer_c_version(uuid, jsonb, text, uuid, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function private.layer_c_version(uuid, jsonb, text, uuid, timestamptz, jsonb) to service_role;
