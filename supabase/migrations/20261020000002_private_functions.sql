-- Демо промпт т. 5.2–5.4 (S8): every SECURITY DEFINER function lives in `private` (not exposed by PostgREST),
-- with search_path = '' and EXECUTE only for the role that needs it.

-- Role check for RLS policies: owner > approver > viewer. Reads only the caller's own membership.
create function private.authorize(p_role text, p_org uuid) returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members m
     where m.org_id = p_org and m.user_id = auth.uid()
       and case p_role when 'viewer' then m.role in ('viewer', 'approver', 'owner')
                       when 'approver' then m.role in ('approver', 'owner')
                       when 'owner' then m.role = 'owner' else false end)
$$;
revoke execute on function private.authorize(text, uuid) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.authorize(text, uuid) to authenticated;

-- E0 hash formula (packages/ledger/src/append.ts): hash = sha256(JCS({kind, org_id, payload_hash, prev_hash, seq, task_id, ts})).
-- JCS of this fixed object: keys sorted, values are ASCII strings / integer / null, so to_json() escaping equals JCS.
create function private.ledger_body_jcs(p_org uuid, p_seq bigint, p_ts text, p_kind text, p_task text, p_payload_hash text, p_prev text)
  returns text language sql immutable set search_path = '' as $$
  select '{"kind":' || to_json(p_kind)::text
      || ',"org_id":' || to_json(p_org::text)::text
      || ',"payload_hash":' || coalesce(to_json(p_payload_hash)::text, 'null')
      || ',"prev_hash":' || coalesce(to_json(p_prev)::text, 'null')
      || ',"seq":' || p_seq::text
      || ',"task_id":' || coalesce(to_json(p_task)::text, 'null')
      || ',"ts":' || to_json(p_ts)::text || '}'
$$;
revoke execute on function private.ledger_body_jcs(uuid, bigint, text, text, text, text, text) from public, anon, authenticated;

-- т. 5.4: TS canonicalizes the payload (JCS) and sends its sha256; the function recomputes it and refuses a mismatch.
create function private.ledger_append(p_org uuid, p_kind text, p_task text, p_payload_jcs text, p_payload_hash text)
  returns public.ledger language plpgsql security definer set search_path = '' as $$
declare
  prev public.ledger;
  v_seq bigint;
  v_ts text;
  v_hash text;
  v_calc text;
  row public.ledger;
begin
  if p_kind !~ '^[a-z_]{1,40}$' then raise exception 'ledger_append: bad kind' using errcode = '22023'; end if;
  if p_task is not null and p_task !~ '^t_[a-z0-9_]{1,40}$' then raise exception 'ledger_append: bad task_id' using errcode = '22023'; end if;
  if p_payload_jcs is null then
    if p_payload_hash is not null then raise exception 'ledger_append: hash without payload' using errcode = '22023'; end if;
  else
    v_calc := 'sha256:' || encode(extensions.digest(convert_to(p_payload_jcs, 'UTF8'), 'sha256'), 'hex');
    if p_payload_hash is distinct from v_calc then raise exception 'ledger_append: payload hash mismatch' using errcode = '22023'; end if;
    perform p_payload_jcs::jsonb; -- must be JSON
  end if;
  perform pg_advisory_xact_lock(hashtextextended('mandat.ledger:' || p_org::text, 0));
  select * into prev from public.ledger where org_id = p_org order by seq desc limit 1;
  v_seq := coalesce(prev.seq, 0) + 1;
  v_ts := to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_hash := 'sha256:' || encode(extensions.digest(convert_to(private.ledger_body_jcs(p_org, v_seq, v_ts, p_kind, p_task, p_payload_hash, prev.hash), 'UTF8'), 'sha256'), 'hex');
  insert into public.ledger (org_id, seq, ts, kind, task_id, payload_jcs, payload, payload_hash, prev_hash, hash)
    values (p_org, v_seq, v_ts, p_kind, p_task, p_payload_jcs, p_payload_jcs::jsonb, p_payload_hash, prev.hash, v_hash)
    returning * into row;
  return row;
end $$;
revoke execute on function private.ledger_append(uuid, text, text, text, text) from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.ledger_append(uuid, text, text, text, text) to service_role;

-- The ledger is append-only: no UPDATE/DELETE, even for its owner role (trigger), REVOKE for everyone else.
create function private.ledger_immutable() returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'ledger is append-only' using errcode = '42501';
end $$;
create trigger ledger_no_update before update or delete on public.ledger for each row execute function private.ledger_immutable();
create trigger ledger_no_truncate before truncate on public.ledger for each statement execute function private.ledger_immutable();
revoke insert, update, delete, truncate on public.ledger from public, anon, authenticated, service_role;

-- спец. т. 11 „approvals“: a second factor is required when the changeset needs one; TOTP must be fresh (≤ 2 min).
create function private.approvals_method_check() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  needs boolean;
begin
  select c.requires_second_factor into needs from public.changesets c where c.id = new.changeset_id;
  if needs and new.method <> 'totp' then
    raise exception 'approval needs a second factor' using errcode = '42501';
  end if;
  if new.method = 'totp' then
    if new.mfa_verified_at is null or new.decided_at - new.mfa_verified_at > interval '2 minutes' or new.mfa_verified_at > new.decided_at then
      raise exception 'TOTP verification is missing or older than 2 minutes' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger approvals_method_check before insert or update on public.approvals for each row execute function private.approvals_method_check();

-- D-236: approval + ledger row + outbox row in ONE transaction. Called only by the server (service role) after the
-- role check and (when required) a fresh TOTP.
create function private.approve_changeset(p_changeset uuid, p_user uuid, p_decision text, p_method text, p_mfa_verified_at timestamptz)
  returns uuid language plpgsql security definer set search_path = '' as $$
declare
  cs public.changesets;
  v_id uuid;
  v_payload text;
begin
  select * into cs from public.changesets where id = p_changeset for update;
  if not found then raise exception 'unknown changeset' using errcode = '22023'; end if;
  if not exists (select 1 from public.members m where m.org_id = cs.org_id and m.user_id = p_user and m.role in ('approver', 'owner')) then
    raise exception 'not an approver' using errcode = '42501';
  end if;
  insert into public.approvals (org_id, changeset_id, user_id, decision, method, mfa_verified_at)
    values (cs.org_id, cs.id, p_user, p_decision, p_method, p_mfa_verified_at) returning id into v_id;
  -- JCS of {"approval_id","changeset_id","decision","method"}: keys sorted, ASCII values
  v_payload := '{"approval_id":' || to_json(v_id::text)::text || ',"changeset_id":' || to_json(cs.id::text)::text
            || ',"decision":' || to_json(p_decision)::text || ',"method":' || to_json(p_method)::text || '}';
  perform private.ledger_append(cs.org_id, 'approval', cs.task_id, v_payload,
    'sha256:' || encode(extensions.digest(convert_to(v_payload, 'UTF8'), 'sha256'), 'hex'));
  if p_decision = 'approved' then
    insert into public.outbox (org_id, kind, idempotency_key, payload)
      values (cs.org_id, 'approval_check', 'approval:' || cs.id::text, jsonb_build_object('changeset_id', cs.id, 'approval_id', v_id));
  end if;
  return v_id;
end $$;
revoke execute on function private.approve_changeset(uuid, uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function private.approve_changeset(uuid, uuid, text, text, timestamptz) to service_role;
