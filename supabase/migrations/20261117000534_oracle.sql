-- D-534 (М1 Х3): the oracle. A person presses "Build oracle" on an approved spec; a separate agent task (kind 'oracle')
-- writes hidden acceptance tests; the worker stores them as a hidden test set keyed by the spec's hash (the D-362
-- storage: files only in private, metadata for members), runs them on the base and records the oracle. A person
-- approves the oracle (ledger oracle_approved); "Start work" then carries oracle_hash into the writer's task.

-- a hidden test set may belong to one spec (an oracle); a repo-wide set has none. The writer's tree B gets the oracle's
-- set only through an approved oracle; every other task keeps the latest repo-wide set (D-362).
alter table private.hidden_tests add column if not exists spec_hash text check (spec_hash is null or spec_hash ~ '^sha256:[0-9a-f]{64}$');
alter table public.hidden_test_sets add column if not exists spec_hash text check (spec_hash is null or spec_hash ~ '^sha256:[0-9a-f]{64}$');

alter table public.tasks add column if not exists kind text not null default 'work' check (kind in ('work', 'oracle'));
alter table public.tasks add column if not exists oracle_hash text check (oracle_hash is null or oracle_hash ~ '^sha256:[0-9a-f]{64}$');

create table if not exists public.oracles (
  id text primary key check (id ~ '^o_[a-z0-9]{1,40}$'),
  org_id uuid not null references public.orgs (id) on delete cascade,
  repo_id uuid references public.repos (id) on delete cascade,
  conversation_id text not null references public.conversations (id) on delete cascade,
  spec_hash text not null check (spec_hash ~ '^sha256:[0-9a-f]{64}$'),
  task_id text references public.tasks (id) on delete set null,
  status text not null default 'building' check (status in ('building', 'not_ready', 'ready', 'approved', 'failed')),
  problems jsonb not null default '[]'::jsonb check (jsonb_typeof(problems) = 'array' and pg_column_size(problems) <= 65536),
  red_on_base jsonb not null default '[]'::jsonb check (jsonb_typeof(red_on_base) = 'array'),
  -- OracleManifest (paths and sha256 of the tests, never their content)
  manifest jsonb check (manifest is null or (jsonb_typeof(manifest) = 'object' and pg_column_size(manifest) <= 262144)),
  oracle_hash text check (oracle_hash is null or oracle_hash ~ '^sha256:[0-9a-f]{64}$'),
  hidden_version int,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'approved' or (approved_at is not null and oracle_hash is not null)),
  check (status not in ('ready', 'approved') or (manifest is not null and oracle_hash is not null and hidden_version is not null))
);
create index if not exists oracles_conversation on public.oracles (conversation_id, created_at desc);
create index if not exists oracles_task on public.oracles (task_id);
alter table public.oracles enable row level security;
alter table public.oracles force row level security;
revoke all on public.oracles from anon, authenticated;
grant select on public.oracles to authenticated;
create policy oracles_read on public.oracles for select to authenticated using ((select private.authorize('viewer', org_id)));
grant select, insert, update, delete on public.oracles to service_role;
create policy oracles_service on public.oracles for all to service_role using (true) with check (true);

-- the oracle's tests: a new version of the repo's hidden tests, keyed by the spec. Written by the worker only; no TOTP
-- here, because the tests are not used until a person approves the oracle (and the hash of each file is checked then).
create or replace function private.add_oracle_tests(p_repo uuid, p_spec_hash text, p_files jsonb, p_hash text)
  returns int language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_next int;
  v_n int;
  v_payload text;
begin
  select org_id into v_org from public.repos where id = p_repo;
  if not found then raise exception 'unknown repo' using errcode = 'P0002'; end if;
  if p_hash !~ '^sha256:[0-9a-f]{64}$' or p_spec_hash !~ '^sha256:[0-9a-f]{64}$' or jsonb_typeof(p_files) <> 'array' then raise exception 'bad oracle tests' using errcode = '22023'; end if;
  v_n := jsonb_array_length(p_files);
  if v_n < 1 or v_n > 200 or length(p_files::text) > 7 * 1024 * 1024 then raise exception 'oracle tests: 1–200 files, ≤ 5 MB' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(p_files) f
              where jsonb_typeof(f -> 'path') <> 'string' or jsonb_typeof(f -> 'data') <> 'string'
                 or (f ->> 'path') !~ '^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)*$' or (f ->> 'path') ~ '(^|/)\.\.(/|$)') then
    raise exception 'an oracle test path must stay inside the hidden directory' using errcode = '22023';
  end if;
  select coalesce(max(version), 0) + 1 into v_next from public.hidden_test_sets where repo_id = p_repo;
  insert into private.hidden_tests (repo_id, version, files, spec_hash) values (p_repo, v_next, p_files, p_spec_hash);
  insert into public.hidden_test_sets (org_id, repo_id, version, hash, files, created_by, spec_hash) values (v_org, p_repo, v_next, p_hash, v_n, null, p_spec_hash);
  v_payload := '{"files":' || v_n::text || ',"hash":' || to_json(p_hash)::text || ',"repo_id":' || to_json(p_repo::text)::text || ',"spec_hash":' || to_json(p_spec_hash)::text || ',"version":' || v_next::text || '}';
  perform private.ledger_append(v_org, 'hidden_tests', null, v_payload, 'sha256:' || encode(extensions.digest(convert_to(v_payload, 'UTF8'), 'sha256'), 'hex'));
  return v_next;
end $$;
revoke all on function private.add_oracle_tests(uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function private.add_oracle_tests(uuid, text, jsonb, text) to service_role;
