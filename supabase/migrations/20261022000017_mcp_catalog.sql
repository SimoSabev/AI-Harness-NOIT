-- E8e (v5 p. 4.5, AC-5.1/5.2/5.7, D-354): the MCP catalog with vetting, the per-tool definition hashes, the skills catalog.
alter table public.mcp_servers
  add column if not exists source text not null default 'manual' check (source in ('registry', 'manual')),
  add column if not exists registry_name text check (length(registry_name) <= 200),
  add column if not exists package text check (length(package) <= 200 and package !~ '@latest$'),
  add column if not exists url text check (url ~ '^https?://' and length(url) <= 500),
  add column if not exists version text check (version ~ '^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$'),
  add column if not exists digest text check (length(digest) <= 200),
  add column if not exists tools_hash text check (tools_hash ~ '^sha256:[0-9a-f]{64}$'),
  add column if not exists secrets text[] not null default '{}' check (array_length(secrets, 1) is null or array_length(secrets, 1) <= 20),
  add column if not exists enabled_tools text[],
  add column if not exists budget_calls_min int not null default 60 check (budget_calls_min between 1 and 10000),
  add column if not exists vet_status text not null default 'pending' check (vet_status in ('pending', 'vetting', 'approved', 'blocked')),
  add column if not exists vet_findings jsonb not null default '[]',
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users (id),
  add column if not exists mfa_verified_at timestamptz;

create table if not exists public.mcp_tool_defs (
  server_id uuid not null references public.mcp_servers (id) on delete cascade,
  org_id uuid not null references public.orgs (id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  description_hash text not null check (description_hash ~ '^sha256:[0-9a-f]{64}$'),
  schema_hash text not null check (schema_hash ~ '^sha256:[0-9a-f]{64}$'),
  primary key (server_id, name)
);
alter table public.mcp_tool_defs enable row level security;
alter table public.mcp_tool_defs force row level security;
revoke all on public.mcp_tool_defs from anon, authenticated;
grant select on public.mcp_tool_defs to authenticated;
create policy mcp_tool_defs_read on public.mcp_tool_defs for select to authenticated using ((select private.authorize('viewer', org_id)));

alter table public.skills
  add column if not exists content_hash text check (content_hash ~ '^sha256:[0-9a-f]{64}$'),
  add column if not exists approved boolean not null default false,
  add column if not exists blocked_reason text check (length(blocked_reason) <= 200),
  add column if not exists repo_id uuid references public.repos (id) on delete cascade;

-- A new approved profile version where only the named layer differs (the caller computed the layers and checked the
-- capability; layer C goes through layer_c_version, which adds the TOTP rule for dangerous openings).
create or replace function private.profile_layer_version(p_repo uuid, p_layer text, p_layers jsonb, p_hash text, p_user uuid, p_mfa_verified_at timestamptz, p_why jsonb)
  returns int language plpgsql security definer set search_path = '' as $$
declare
  hp public.harness_profiles;
  v_next int;
  v_id uuid;
  v_payload text;
begin
  if p_layer not in ('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h') then raise exception 'unknown layer' using errcode = '22023'; end if;
  select h.* into hp from public.repos r join public.harness_profiles h on h.id = r.profile_id and h.status = 'approved' where r.id = p_repo for update of h;
  if not found then raise exception 'the repo has no approved profile' using errcode = 'P0002'; end if;
  if p_hash !~ '^sha256:[0-9a-f]{64}$' then raise exception 'bad profile hash' using errcode = '22023'; end if;
  if (p_layers - p_layer) is distinct from (hp.layers - p_layer) or p_layers -> p_layer is null then
    raise exception 'only layer % may change here', p_layer using errcode = '22023';
  end if;
  if p_layers::text ~ '[​-‏‪-‮⁠-⁤﻿]' or p_layers::text ~ '[\U000E0000-\U000E007F]' then
    raise exception 'blocked: invisible characters in the profile' using errcode = '55000';
  end if;
  select coalesce(max(version), 0) + 1 into v_next from public.harness_profiles where repo_id = p_repo;
  update public.harness_profiles set status = 'superseded' where id = hp.id;
  insert into public.harness_profiles (org_id, repo_id, version, layers, sources, profile_hash, status, approved_by, approved_at, mfa_verified_at)
    values (hp.org_id, p_repo, v_next, p_layers, hp.sources, p_hash, 'approved', p_user, now(), p_mfa_verified_at)
    returning id into v_id;
  update public.repos set profile_id = v_id where id = p_repo;
  v_payload := '{"action":"layer_' || p_layer || '","profile_hash":' || to_json(p_hash)::text || ',"profile_id":' || to_json(v_id::text)::text
    || ',"version":' || v_next::text || ',"why":' || coalesce(p_why, '{}'::jsonb)::text || '}';
  perform private.ledger_append(hp.org_id, 'profile_change', null, v_payload, 'sha256:' || encode(extensions.digest(convert_to(v_payload, 'UTF8'), 'sha256'), 'hex'));
  return v_next;
end $$;
revoke execute on function private.profile_layer_version(uuid, text, jsonb, text, uuid, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function private.profile_layer_version(uuid, text, jsonb, text, uuid, timestamptz, jsonb) to service_role;
