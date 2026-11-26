-- E10 hosted (v5 т. 6.1, D-701/D-702/D-703): runners. A team's owner (settings.manage) makes a one-time registration
-- token; the runner trades it once for its id + secret (only hashes are stored), then gets short JWTs from the hosted
-- worker. A runner drains the outbox effects that need Docker on its machine (its `kinds`) through /api/runner/*:
-- it never gets a database URL. Members of the team see the team's runners (never the secret's hash); members of
-- another team see nothing.

create table if not exists public.runners (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  name text not null check (name ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$'),
  kinds text[] not null default '{}' check (kinds <@ '{baseline,mcp_vet,harness_scan}'::text[]),
  secret_hash text not null check (secret_hash ~ '^sha256:[0-9a-f]{64}$'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);
create unique index if not exists runners_org_name_live on public.runners (org_id, lower(name)) where revoked_at is null;

create table if not exists public.runner_registrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  name text not null check (name ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$'),
  token_hash text not null unique check (token_hash ~ '^sha256:[0-9a-f]{64}$'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  runner_id uuid references public.runners (id) on delete set null
);

-- the outbox row a runner holds: who and until when (the hosted worker's own drain skips a live lease)
alter table public.outbox add column if not exists lease_owner uuid references public.runners (id) on delete set null;
alter table public.outbox add column if not exists lease_until timestamptz;

alter table public.runners enable row level security;
alter table public.runners force row level security;
alter table public.runner_registrations enable row level security;
alter table public.runner_registrations force row level security;
revoke all on public.runners, public.runner_registrations from anon, authenticated;
-- columns, not the table: the secret's hash and the token's hash never reach a user
grant select (id, org_id, name, kinds, created_by, created_at, last_seen_at, revoked_at) on public.runners to authenticated;
grant select (id, org_id, name, created_by, created_at, expires_at, used_at, runner_id) on public.runner_registrations to authenticated;
create policy runners_read on public.runners for select to authenticated using ((select private.authorize('viewer', org_id)));
create policy runner_registrations_read on public.runner_registrations for select to authenticated using ((select private.has_cap(org_id, 'settings.manage')));

create or replace function private.sha256_text(p text) returns text language sql immutable set search_path = '' as $$
  select 'sha256:' || encode(extensions.digest(convert_to(p, 'UTF8'), 'sha256'), 'hex')
$$;
revoke execute on function private.sha256_text(text) from public, anon, authenticated;
grant execute on function private.sha256_text(text) to service_role;

-- a ledger row of a runner change (registered / revoked), with the formula of packages/ledger (JCS text + its hash)
create or replace function private.runner_ledger(p_org uuid, p_action text, p_runner uuid, p_name text, p_kinds text[], p_by uuid) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v text;
begin
  -- keys in JCS order: action, by, kinds, name, runner_id
  v := '{"action":' || to_json(p_action)::text || ',"by":' || coalesce(to_json(p_by::text)::text, 'null') || ',"kinds":' || to_json(coalesce(p_kinds, '{}'::text[]))::text
    || ',"name":' || to_json(p_name)::text || ',"runner_id":' || to_json(p_runner::text)::text || '}';
  perform private.ledger_append(p_org, 'runner_change', null, v, private.sha256_text(v));
end $$;
revoke execute on function private.runner_ledger(uuid, text, uuid, text, text[], uuid) from public, anon, authenticated;

-- an owner of the team (settings.manage) makes a one-time token; it is shown once and only its hash is kept
create or replace function public.runner_registration_create(p_org uuid, p_name text, p_ttl_minutes int default 60) returns text
  language plpgsql security definer set search_path = '' as $$
declare
  v_token text;
begin
  if not private.has_cap(p_org, 'settings.manage') then raise exception 'not allowed to add runners' using errcode = '42501'; end if;
  if p_ttl_minutes is null or p_ttl_minutes < 1 or p_ttl_minutes > 1440 then raise exception 'ttl must be 1..1440 minutes' using errcode = '22023'; end if;
  v_token := 'mrr_' || encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.runner_registrations (org_id, name, token_hash, created_by, expires_at)
    values (p_org, p_name, private.sha256_text(v_token), auth.uid(), now() + make_interval(mins => p_ttl_minutes));
  return v_token;
end $$;
revoke execute on function public.runner_registration_create(uuid, text, int) from public, anon;
grant execute on function public.runner_registration_create(uuid, text, int) to authenticated;

create or replace function public.runner_revoke(p_runner uuid) returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.runners;
begin
  select * into r from public.runners where id = p_runner for update;
  if not found or not private.has_cap(r.org_id, 'settings.manage') then raise exception 'not allowed to revoke this runner' using errcode = '42501'; end if;
  if r.revoked_at is not null then return; end if;
  update public.runners set revoked_at = now() where id = p_runner;
  update public.outbox set lease_owner = null, lease_until = null where lease_owner = p_runner and status = 'pending';
  perform private.runner_ledger(r.org_id, 'revoked', r.id, r.name, r.kinds, auth.uid());
end $$;
revoke execute on function public.runner_revoke(uuid) from public, anon;
grant execute on function public.runner_revoke(uuid) to authenticated;

-- the hosted worker (service role) on POST /api/runner/register: the token once, before it expires
create or replace function private.runner_register(p_token_hash text, p_kinds text[], p_secret_hash text) returns table (runner_id uuid, org_id uuid)
  language plpgsql security definer set search_path = '' as $$
declare
  g public.runner_registrations;
  v_id uuid;
begin
  select * into g from public.runner_registrations where token_hash = p_token_hash for update;
  if not found or g.used_at is not null or g.expires_at <= now() then raise exception 'unknown, used or expired registration token' using errcode = '28000'; end if;
  insert into public.runners (org_id, name, kinds, secret_hash, created_by) values (g.org_id, g.name, coalesce(p_kinds, '{}'), p_secret_hash, g.created_by) returning id into v_id;
  update public.runner_registrations set used_at = now(), runner_id = v_id where id = g.id;
  perform private.runner_ledger(g.org_id, 'registered', v_id, g.name, p_kinds, g.created_by);
  return query select v_id, g.org_id;
end $$;

-- every authenticated runner request: a live (not revoked) runner; with a secret hash for POST /api/runner/token
create or replace function private.runner_seen(p_runner uuid, p_secret_hash text default null) returns table (org_id uuid, kinds text[])
  language sql security definer set search_path = '' as $$
  update public.runners r set last_seen_at = now()
   where r.id = p_runner and r.revoked_at is null and (p_secret_hash is null or r.secret_hash = p_secret_hash)
  returning r.org_id, r.kinds
$$;

-- claim: the team's pending rows of the runner's kinds, not leased by anyone now; SKIP LOCKED against the hosted drain
create or replace function private.runner_outbox_claim(p_runner uuid, p_limit int, p_lease_seconds int default 60)
  returns table (id bigint, kind text, idempotency_key text, payload jsonb, attempts int, lease_until timestamptz)
  language sql security definer set search_path = '' as $$
  with r as (select x.org_id, x.kinds from public.runners x where x.id = p_runner and x.revoked_at is null),
  c as (
    select o.id from public.outbox o, r
     where o.org_id = r.org_id and o.status = 'pending' and o.kind = any (r.kinds) and (o.lease_until is null or o.lease_until < now())
     order by o.id limit greatest(1, least(p_limit, 20)) for update of o skip locked
  )
  update public.outbox o set lease_owner = p_runner, lease_until = now() + make_interval(secs => greatest(10, least(p_lease_seconds, 900)))
    from c where o.id = c.id
  returning o.id, o.kind, o.idempotency_key, o.payload, o.attempts, o.lease_until
$$;

-- done / failed / extend: only by the runner that holds a live lease on the row; false = the lease is lost
create or replace function private.runner_outbox_finish(p_runner uuid, p_id bigint, p_ok boolean, p_error text default null, p_max_attempts int default 8) returns boolean
  language plpgsql security definer set search_path = '' as $$
begin
  update public.outbox o set
      status = case when p_ok then 'done' when o.attempts + 1 >= p_max_attempts then 'failed' else 'pending' end,
      done_at = case when p_ok then now() else o.done_at end,
      attempts = case when p_ok then o.attempts else o.attempts + 1 end,
      last_error = case when p_ok then o.last_error else left(coalesce(p_error, 'failed'), 300) end,
      lease_owner = null, lease_until = null
   where o.id = p_id and o.lease_owner = p_runner and o.lease_until >= now() and o.status = 'pending'
     and exists (select 1 from public.runners r where r.id = p_runner and r.revoked_at is null);
  return found;
end $$;
create or replace function private.runner_outbox_extend(p_runner uuid, p_id bigint, p_seconds int default 60) returns timestamptz
  language sql security definer set search_path = '' as $$
  update public.outbox o set lease_until = now() + make_interval(secs => greatest(10, least(p_seconds, 900)))
   where o.id = p_id and o.lease_owner = p_runner and o.lease_until >= now() and o.status = 'pending'
     and exists (select 1 from public.runners r where r.id = p_runner and r.revoked_at is null)
  returning o.lease_until
$$;

do $$
declare f text;
begin
  foreach f in array array['private.runner_register(text, text[], text)', 'private.runner_seen(uuid, text)', 'private.runner_outbox_claim(uuid, int, int)',
    'private.runner_outbox_finish(uuid, bigint, boolean, text, int)', 'private.runner_outbox_extend(uuid, bigint, int)']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
