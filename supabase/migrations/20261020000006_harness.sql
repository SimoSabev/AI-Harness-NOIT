-- E3б (демо промпт т. 8.2): the auto-harness proposal and its approval (owner + fresh TOTP) in ONE transaction.

alter table public.harness_proposals drop constraint if exists harness_proposals_status_check;
alter table public.harness_proposals add constraint harness_proposals_status_check check (status in ('draft', 'proposed', 'approved', 'accepted', 'rejected'));
alter table public.harness_proposals add column if not exists base_commit text check (base_commit ~ '^[0-9a-f]{40}$');
alter table public.harness_proposals add column if not exists yaml_sha256 text check (yaml_sha256 ~ '^sha256:[0-9a-f]{64}$');
alter table public.harness_proposals add column if not exists field_sources jsonb not null default '{}';
alter table public.harness_proposals add column if not exists scan jsonb not null default '{}';
alter table public.harness_proposals add column if not exists risk_cap int check (risk_cap between 0 and 3);
alter table public.harness_proposals add column if not exists blocked jsonb not null default '[]';
alter table public.harness_proposals add column if not exists needs_human jsonb not null default '[]';
alter table public.harness_proposals add column if not exists warnings jsonb not null default '[]';
alter table public.harness_proposals add column if not exists version int;
alter table public.harness_proposals add column if not exists generated jsonb not null default '[]';
alter table public.harness_proposals add column if not exists approved_by uuid references auth.users (id);
alter table public.harness_proposals add column if not exists approved_at timestamptz;
alter table public.harness_proposals add column if not exists mfa_verified_at timestamptz;
alter table public.harness_proposals add column if not exists pr_number int;
alter table public.repos add column if not exists config_hash text check (config_hash ~ '^sha256:[0-9a-f]{64}$');
alter table public.repos add column if not exists config_version int not null default 0;
alter table public.repos add column if not exists harness_stale boolean not null default false;

alter table public.outbox drop constraint if exists outbox_kind_check;
alter table public.outbox add constraint outbox_kind_check check (kind in ('check_run', 'draft_pr', 'ready_for_review', 'approval_check', 'merge', 'push_branch', 'web_push', 'harness_scan', 'harness_pr'));

-- т. 8.2 (7): no auto-approval (К-1); invisible characters in existing instructions block it; owner + TOTP ≤ 2 min.
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
  if not exists (select 1 from public.members m where m.org_id = hp.org_id and m.user_id = p_user and m.role = 'owner') then
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
revoke execute on function private.approve_harness(uuid, uuid, text, text, jsonb, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function private.approve_harness(uuid, uuid, text, text, jsonb, jsonb, timestamptz) to service_role;
