-- D-490, D-492: the optional account on this device (`pnpm local`, the desktop). One link at most: the sync server's
-- address, the device-flow code while signing in, then the session token and the opened vault key. Both stay in this
-- local database (127.0.0.1) and are read only by the web server as the database owner — never by anon/authenticated,
-- never sent to the browser. The cache is the device's copy of the synced records (the server is the truth).
-- No row = no account = nothing ever leaves the machine.
create table if not exists private.account_link (
  one boolean primary key default true check (one),
  server text not null check (server ~ '^https?://'),
  state text not null check (state in ('pending', 'signed_in')),
  device_code text,
  user_code text,
  verification_url text,
  expires_at timestamptz,
  token text,
  email text,
  vault_key text check (vault_key is null or vault_key ~ '^[A-Za-z0-9_-]{43}$'),
  last_sync timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists private.account_cache (
  kind text not null check (kind in ('settings', 'prefs', 'connection', 'secret', 'mcp', 'skill', 'project', 'task')),
  id text not null check (id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  body jsonb not null default '{}'::jsonb check (jsonb_typeof(body) = 'object'),
  deleted boolean not null default false,
  rev bigint not null default 0 check (rev >= 0),
  base jsonb,
  dirty boolean not null default true,
  primary key (kind, id)
);

create table if not exists private.account_cursor (
  one boolean primary key default true check (one),
  cursor bigint not null default 0 check (cursor >= 0)
);

revoke all on private.account_link, private.account_cache, private.account_cursor from public, anon, authenticated;
