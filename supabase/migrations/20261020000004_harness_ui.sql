-- E3а (демо промпт т. 8.1): board columns, approval with CAS by head_sha, Realtime topic RLS (S22).

alter table public.tasks drop constraint if exists tasks_state_check;
alter table public.tasks add constraint tasks_state_check check (state in ('CREATED', 'CONTRACTED', 'PROVISIONING', 'RUNNING', 'EXPORTING', 'RETRY', 'VERIFY_1', 'REBASING', 'PUSHED', 'VERIFY_2', 'VERDICT', 'GATED', 'DELIVERED', 'HELD', 'BLOCKED', 'OUTCOME', 'CLOSED'));
alter table public.tasks add column if not exists wait_reason text;
alter table public.tasks add column if not exists attempts_max int not null default 3 check (attempts_max between 1 and 10);
alter table public.tasks add column if not exists usd numeric(12, 6) not null default 0;
alter table public.tasks add column if not exists minutes numeric(10, 2) not null default 0;
alter table public.tasks add column if not exists effective_level int check (effective_level between 0 and 3);
alter table public.tasks add column if not exists last_result text check (last_result in ('VERIFIED', 'FAILED', 'UNKNOWN'));
alter table public.tasks add column if not exists outcome_decided boolean not null default false;
alter table public.tasks add column if not exists updated_at timestamptz not null default now();
alter table public.tasks add column if not exists seq bigint not null default 0;
alter table public.changesets add column if not exists head_sha text check (head_sha ~ '^[0-9a-f]{40}$');
alter table public.changesets add column if not exists approval_needed boolean not null default false;
alter table public.approvals add column if not exists reason text check (length(reason) <= 500);
alter table public.approvals add column if not exists client text check (client in ('web', 'pwa', 'cli'));

-- Ф4 / т. 8.1: exactly one column per task; a FAILED verdict is always column 5. Pure (immutable), used by the API.
create or replace function public.board_column(p_state text, p_result text, p_wait_reason text, p_approval_needed boolean, p_outcome_decided boolean)
  returns int language sql immutable set search_path = '' as $$
  select case
    when p_result = 'FAILED' then 5
    when p_state in ('CREATED', 'CONTRACTED') then 1
    when p_state in ('PROVISIONING', 'RUNNING', 'EXPORTING', 'RETRY') then 2
    when p_state in ('VERIFY_1', 'REBASING', 'PUSHED', 'VERIFY_2', 'VERDICT') then 3
    when p_state = 'GATED' and not coalesce(p_approval_needed, false) then 3
    when p_state = 'GATED' then 4
    when p_state = 'HELD' then 4
    when p_state = 'BLOCKED' then 5
    when p_state = 'DELIVERED' then 6
    when p_state = 'OUTCOME' and not coalesce(p_outcome_decided, false) then 6
    else 7
  end
$$;
grant execute on function public.board_column(text, text, text, boolean, boolean) to authenticated, service_role;

-- D-236 with the signature of т. 8.1: CAS on head_sha + the partial unique index → approvals + ledger + outbox, one transaction.
drop function if exists private.approve_changeset(uuid, uuid, text, text, timestamptz);
create function private.approve_changeset(p_changeset uuid, p_head_sha text, p_user uuid, p_decision text, p_reason text, p_client text, p_method text, p_mfa_verified_at timestamptz)
  returns uuid language plpgsql security definer set search_path = '' as $$
declare
  cs public.changesets;
  v_id uuid;
  v_payload text;
begin
  select * into cs from public.changesets where id = p_changeset for update;
  if not found then raise exception 'unknown changeset' using errcode = 'P0002'; end if;
  if cs.head_sha is distinct from p_head_sha then raise exception 'head_sha moved' using errcode = '40001'; end if;
  if not exists (select 1 from public.members m where m.org_id = cs.org_id and m.user_id = p_user and m.role in ('approver', 'owner')) then
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
revoke execute on function private.approve_changeset(uuid, text, uuid, text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function private.approve_changeset(uuid, text, uuid, text, text, text, text, timestamptz) to service_role;

-- S22: Realtime private channels `org:<uuid>:board` and `task:<id>` — only members of that org (never `using (true)`).
create or replace function private.topic_allowed(p_topic text) returns boolean
  language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  if p_topic ~ '^org:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:board$' then
    v_org := split_part(p_topic, ':', 2)::uuid;
  elsif p_topic ~ '^task:t_[a-z0-9_]{1,40}$' then
    select t.org_id into v_org from public.tasks t where t.id = split_part(p_topic, ':', 2);
  else
    return false;
  end if;
  return v_org is not null and private.authorize('viewer', v_org);
end $$;
revoke execute on function private.topic_allowed(text) from public, anon;
grant execute on function private.topic_allowed(text) to authenticated;

do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'realtime' and table_name = 'messages') then
    execute 'drop policy if exists mandat_topics_read on realtime.messages';
    execute 'create policy mandat_topics_read on realtime.messages for select to authenticated using ((select private.topic_allowed(realtime.topic())))';
  end if;
end $$;
