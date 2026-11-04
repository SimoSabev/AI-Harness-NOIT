-- D-491: the sync server's own tables (the Postgres of the sync server — Supabase cloud or self-hosted — never the
-- local stack of `pnpm local`). Better Auth's tables (user, session, account, verification, deviceCode, rateLimit) are
-- created by its CLI (docs/setup/auth.md). Every row belongs to one person (user_id = Better Auth's user id). The web
-- server talks to these tables only as the role mandat_sync, with the person's id set per transaction; RLS is forced,
-- so a query that forgot its WHERE still sees one person's rows only. Bodies never hold a key in clear (D-494): a
-- secret record is a sealed envelope, checked before it is stored.
create schema if not exists sync;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'mandat_sync') then create role mandat_sync nologin; end if;
end $$;

create table if not exists sync.records (
  user_id text not null check (length(user_id) between 1 and 128),
  kind text not null check (kind in ('settings', 'prefs', 'connection', 'secret', 'mcp', 'skill', 'project', 'task')),
  id text not null check (id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  rev bigint not null check (rev >= 1),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  body jsonb not null default '{}'::jsonb check (jsonb_typeof(body) = 'object' and octet_length(body::text) <= 262144),
  primary key (user_id, kind, id)
);
create index if not exists records_user_rev on sync.records (user_id, rev);

create table if not exists sync.counters (
  user_id text primary key,
  rev bigint not null default 0
);

create table if not exists sync.vaults (
  user_id text primary key,
  wrapped jsonb not null check (jsonb_typeof(wrapped) = 'object'),
  updated_at timestamptz not null default now()
);

alter table sync.records enable row level security;
alter table sync.records force row level security;
alter table sync.counters enable row level security;
alter table sync.counters force row level security;
alter table sync.vaults enable row level security;
alter table sync.vaults force row level security;

drop policy if exists own_records on sync.records;
create policy own_records on sync.records for all to mandat_sync
  using (user_id = current_setting('mandat.sync_uid', true)) with check (user_id = current_setting('mandat.sync_uid', true));
drop policy if exists own_counter on sync.counters;
create policy own_counter on sync.counters for all to mandat_sync
  using (user_id = current_setting('mandat.sync_uid', true)) with check (user_id = current_setting('mandat.sync_uid', true));
drop policy if exists own_vault on sync.vaults;
create policy own_vault on sync.vaults for all to mandat_sync
  using (user_id = current_setting('mandat.sync_uid', true)) with check (user_id = current_setting('mandat.sync_uid', true));

revoke all on schema sync from public;
grant usage on schema sync to mandat_sync;
grant select, insert, update, delete on sync.records, sync.counters, sync.vaults to mandat_sync;
