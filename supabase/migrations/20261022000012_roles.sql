-- E8в (v5 т. 4.3, D-315/D-349): roles are data with capabilities and a scope. Builtin roles (org_id null) cannot be
-- edited or deleted (copy them). members.role_id names the role; the legacy members.role column stays in sync for old readers.
-- private.authorize(viewer|approver|owner) is re-expressed through capabilities, so every existing RLS policy now asks has_cap.
create table if not exists public.roles (
  id text primary key check (id ~ '^(builtin:(owner|worker|approver|agent-operator|viewer)|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$'),
  org_id uuid references public.orgs (id) on delete cascade,
  name text not null check (length(name) between 1 and 40),
  builtin boolean not null default false,
  capabilities text[] not null default '{}' check (capabilities <@ '{task.create,task.stop,task.retry,task.steer,approve.level1,approve.level2,approve.rules,approve.tool,keys.manage,accounts.manage,tools.manage,roles.manage,projects.manage,projects.delete,night.manage,research.ask,research.manage,docs.download,diff.view,ledger.export,settings.manage,members.manage}'::text[]),
  scope jsonb not null default '{"repos":null,"task_types":null,"level_cap":null,"budget_usd_day":null}',
  created_at timestamptz not null default now(),
  check (builtin = (org_id is null))
);
create unique index if not exists roles_org_name on public.roles (coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
insert into public.roles (id, org_id, name, builtin, capabilities) values
  ('builtin:owner', null, 'owner', true, '{task.create,task.stop,task.retry,task.steer,approve.level1,approve.level2,approve.rules,approve.tool,keys.manage,accounts.manage,tools.manage,roles.manage,projects.manage,projects.delete,night.manage,research.ask,research.manage,docs.download,diff.view,ledger.export,settings.manage,members.manage}'),
  ('builtin:worker', null, 'worker', true, '{task.create,task.stop,task.retry,task.steer,approve.level1,approve.tool,tools.manage,projects.manage,night.manage,research.ask,research.manage,docs.download,diff.view,ledger.export}'),
  ('builtin:approver', null, 'approver', true, '{task.create,task.stop,task.retry,approve.level1,approve.level2,approve.tool,diff.view,docs.download,research.ask}'),
  ('builtin:agent-operator', null, 'agent-operator', true, '{task.create,task.stop,task.retry,task.steer,diff.view,research.ask}'),
  ('builtin:viewer', null, 'viewer', true, '{diff.view,docs.download}')
  on conflict (id) do nothing;

create or replace function private.roles_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if (tg_op = 'DELETE' and old.builtin) or (tg_op = 'UPDATE' and (old.builtin or new.builtin)) then
    raise exception 'builtin roles are read-only; copy one instead' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists roles_guard on public.roles;
create trigger roles_guard before update or delete on public.roles for each row execute function private.roles_guard();

alter table public.members add column if not exists role_id text references public.roles (id);
update public.members set role_id = 'builtin:' || role where role_id is null;
-- the legacy column follows the role: owner-like (settings.manage), approver-like (approve.level1) or viewer
create or replace function private.members_role_sync() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  c text[];
begin
  if new.role_id is null then new.role_id := 'builtin:' || new.role; end if;
  select capabilities into c from public.roles where id = new.role_id;
  new.role := case when 'settings.manage' = any (c) then 'owner' when 'approve.level1' = any (c) then 'approver' else 'viewer' end;
  return new;
end $$;
drop trigger if exists members_role_sync on public.members;
create trigger members_role_sync before insert or update on public.members for each row execute function private.members_role_sync();
alter table public.members alter column role_id set not null;

-- the capability of a user in an org, with the role's scope (repo, task type, level cap)
create or replace function private.cap_of(p_user uuid, p_org uuid, p_cap text, p_repo uuid default null, p_type text default null, p_level int default null)
  returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members m join public.roles r on r.id = m.role_id
     where m.org_id = p_org and m.user_id = p_user and p_cap = any (r.capabilities)
       and (r.scope -> 'repos' is null or jsonb_typeof(r.scope -> 'repos') = 'null' or (p_repo is not null and r.scope -> 'repos' ? p_repo::text))
       and (r.scope -> 'task_types' is null or jsonb_typeof(r.scope -> 'task_types') = 'null' or (p_type is not null and r.scope -> 'task_types' ? p_type))
       and (r.scope -> 'level_cap' is null or jsonb_typeof(r.scope -> 'level_cap') = 'null' or p_level is null or p_level <= (r.scope ->> 'level_cap')::int))
$$;
create or replace function private.has_cap(p_org uuid, p_cap text, p_repo uuid default null, p_type text default null, p_level int default null)
  returns boolean language sql stable security definer set search_path = '' as $$
  select private.cap_of(auth.uid(), p_org, p_cap, p_repo, p_type, p_level)
$$;
create or replace function private.authorize(p_role text, p_org uuid) returns boolean
  language sql stable security definer set search_path = '' as $$
  select private.has_cap(p_org, case p_role when 'viewer' then 'diff.view' when 'approver' then 'approve.level1' when 'owner' then 'settings.manage' else '-' end)
$$;
revoke execute on function private.cap_of(uuid, uuid, text, uuid, text, int) from public, anon, authenticated;
grant execute on function private.cap_of(uuid, uuid, text, uuid, text, int) to service_role;
revoke execute on function private.has_cap(uuid, text, uuid, text, int) from public, anon;
grant execute on function private.has_cap(uuid, text, uuid, text, int) to authenticated, service_role;

alter table public.roles enable row level security;
alter table public.roles force row level security;
revoke all on public.roles from anon, authenticated;
grant select on public.roles to authenticated;
create policy roles_read on public.roles for select to authenticated using (org_id is null or (select private.authorize('viewer', org_id)));

create or replace function private.approve_changeset(p_changeset uuid, p_head_sha text, p_user uuid, p_decision text, p_reason text, p_client text, p_method text, p_mfa_verified_at timestamptz)
  returns uuid language plpgsql security definer set search_path = '' as $$
declare
  cs public.changesets;
  t public.tasks;
  v_id uuid;
  v_payload text;
begin
  select * into cs from public.changesets where id = p_changeset for update;
  if not found then raise exception 'unknown changeset' using errcode = 'P0002'; end if;
  if cs.head_sha is distinct from p_head_sha then raise exception 'head_sha moved' using errcode = '40001'; end if;
  select * into t from public.tasks where id = cs.task_id;
  -- E8в: approving at level ≥ 2 needs approve.level2; a rejection (or level ≤ 1) needs approve.level1; the role's scope applies
  if not private.cap_of(p_user, cs.org_id, case when p_decision = 'approved' and coalesce(cs.effective_level, 0) >= 2 then 'approve.level2' else 'approve.level1' end, t.repo_id, t.type, cs.effective_level) then
    raise exception 'not an approver' using errcode = '42501';
  end if;
  insert into public.approvals (org_id, changeset_id, user_id, decision, method, mfa_verified_at, reason, client)
    values (cs.org_id, cs.id, p_user, p_decision, p_method, p_mfa_verified_at, p_reason, p_client) returning id into v_id;
  v_payload := '{"approval_id":' || to_json(v_id::text)::text || ',"changeset_id":' || to_json(cs.id::text)::text
            || ',"decision":' || to_json(p_decision)::text || ',"head_sha":' || to_json(p_head_sha)::text || ',"method":' || to_json(p_method)::text || '}';
  perform private.ledger_append(cs.org_id, 'approval', cs.task_id, v_payload, 'sha256:' || encode(extensions.digest(convert_to(v_payload, 'UTF8'), 'sha256'), 'hex'));
  if p_decision = 'approved' then
    insert into public.outbox (org_id, kind, idempotency_key, payload)
      values (cs.org_id, 'ready_for_review', 'ready:' || cs.id::text || ':' || p_head_sha, jsonb_build_object('changeset_id', cs.id, 'head_sha', p_head_sha)),
             (cs.org_id, 'approval_check', 'approval:' || cs.id::text || ':' || p_head_sha, jsonb_build_object('changeset_id', cs.id, 'approval_id', v_id, 'head_sha', p_head_sha));
  end if;
  return v_id;
end $$;

create or replace function private.approve_harness(p_proposal uuid, p_user uuid, p_yaml text, p_yaml_sha256 text, p_task_types jsonb, p_generated jsonb, p_mfa_verified_at timestamptz)
  returns int language plpgsql security definer set search_path = '' as $$
declare
  hp public.harness_proposals;
  v_version int;
  v_payload text;
begin
  select * into hp from public.harness_proposals where id = p_proposal for update;
  if not found then raise exception 'unknown proposal' using errcode = 'P0002'; end if;
  if hp.status <> 'proposed' then raise exception 'proposal is %', hp.status using errcode = '55000'; end if;
  if jsonb_array_length(hp.blocked) > 0 then raise exception 'blocked: invisible characters in instruction files' using errcode = '55000'; end if;
  if not private.cap_of(p_user, hp.org_id, 'approve.rules', hp.repo_id, null, null) then
    raise exception 'not an owner' using errcode = '42501';
  end if;
  if p_mfa_verified_at is null or now() - p_mfa_verified_at > interval '2 minutes' or p_mfa_verified_at > now() + interval '5 seconds' then
    raise exception 'TOTP verification is missing or older than 2 minutes' using errcode = '42501';
  end if;
  update public.repos set config_hash = p_yaml_sha256, config_version = config_version + 1, harness_stale = false where id = hp.repo_id returning config_version into v_version;
  delete from public.task_types where repo_id = hp.repo_id;
  insert into public.task_types (org_id, repo_id, name, risk_class)
    select hp.org_id, hp.repo_id, x ->> 'name', x ->> 'risk_class' from jsonb_array_elements(p_task_types) x;
  update public.harness_proposals set status = 'approved', policy_yaml = p_yaml, yaml_sha256 = p_yaml_sha256, version = v_version, generated = p_generated,
    approved_by = p_user, approved_at = now(), mfa_verified_at = p_mfa_verified_at where id = p_proposal;
  v_payload := '{"proposal_id":' || to_json(p_proposal::text)::text || ',"status":"approved","version":' || v_version::text || ',"yaml_sha256":' || to_json(p_yaml_sha256)::text || '}';
  perform private.ledger_append(hp.org_id, 'config_change', null, v_payload, 'sha256:' || encode(extensions.digest(convert_to(v_payload, 'UTF8'), 'sha256'), 'hex'));
  insert into public.outbox (org_id, kind, idempotency_key, payload) values (hp.org_id, 'harness_pr', 'harness:' || p_proposal::text, jsonb_build_object('proposal_id', p_proposal));
  return v_version;
end $$;
