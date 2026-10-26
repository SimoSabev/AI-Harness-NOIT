-- D-392: Mandat's memory. Facts and preferences with provenance, by trust level; an old fact is made invalid, never
-- deleted (only the person deletes). A user-scope memory is seen by its person only; a project memory by the org's
-- members. Only the server (service_role) writes, after the scanner and the trust rules of @mandat/memory.
create table if not exists public.memory_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  repo_id uuid references public.repos (id) on delete cascade,
  scope text not null check (scope in ('user', 'project')),
  kind text not null check (kind in ('preference', 'convention', 'command', 'pitfall', 'fact', 'note', 'episode')),
  text text not null check (length(text) between 3 and 500),
  status text not null check (status in ('active', 'pending', 'rejected', 'invalid', 'archived')),
  source text not null check (source in ('human', 'chat', 'agent_session', 'agent_sandbox', 'consolidation')),
  basis text check (basis in ('user_said', 'observed')),
  entities text[] not null default '{}' check (coalesce(array_length(entities, 1), 0) <= 20),
  pinned boolean not null default false,
  uses int not null default 0 check (uses >= 0),
  last_used_at timestamptz,
  invalid_at timestamptz,
  superseded_by uuid references public.memory_items (id) on delete set null,
  provenance jsonb not null default '{}' check (jsonb_typeof(provenance) = 'object' and length(provenance::text) <= 1000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memory_items_shelf check ((scope = 'user' and user_id is not null and repo_id is null) or (scope = 'project' and repo_id is not null)),
  constraint memory_items_invalid check ((status = 'invalid') = (invalid_at is not null)),
  constraint memory_items_visible_text check (text !~ '[­᠎​-‏‪-‮⁠-⁤⁦-⁩﻿]')
);
create index if not exists memory_items_org_status on public.memory_items (org_id, status);
create index if not exists memory_items_entities on public.memory_items using gin (entities);
alter table public.memory_items enable row level security;
alter table public.memory_items force row level security;
revoke all on public.memory_items from anon, authenticated;
grant select on public.memory_items to authenticated;
create policy memory_items_read on public.memory_items for select to authenticated
  using ((select private.authorize('viewer', org_id)) and (scope = 'project' or user_id = (select auth.uid())));
grant select, insert, update, delete on public.memory_items to service_role;
create policy memory_items_service on public.memory_items for all to service_role using (true) with check (true);

-- The history of each memory (versions, approvals, merges); it goes with the memory when the person deletes it.
create table if not exists public.memory_events (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.orgs (id) on delete cascade,
  item_id uuid not null references public.memory_items (id) on delete cascade,
  action text not null check (action in ('created', 'edited', 'approved', 'rejected', 'archived', 'restored', 'pinned', 'unpinned', 'superseded', 'merged')),
  actor text not null check (actor ~ '^(human:[0-9a-f-]{36}|agent|worker|consolidation)$'),
  before jsonb,
  after jsonb,
  task_id text,
  created_at timestamptz not null default now()
);
create index if not exists memory_events_item on public.memory_events (item_id, id);
alter table public.memory_events enable row level security;
alter table public.memory_events force row level security;
revoke all on public.memory_events from anon, authenticated;
grant select on public.memory_events to authenticated;
create policy memory_events_read on public.memory_events for select to authenticated
  using (exists (select 1 from public.memory_items m where m.id = item_id));
grant select, insert, delete on public.memory_events to service_role;
grant usage on sequence public.memory_events_id_seq to service_role;
create policy memory_events_service on public.memory_events for all to service_role using (true) with check (true);

-- What memory cost each task (the core + the recall in its contract): the tokens the menu shows.
create table if not exists public.memory_usage (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.orgs (id) on delete cascade,
  task_id text not null references public.tasks (id) on delete cascade,
  attempt int not null default 1 check (attempt >= 1),
  core_tokens int not null check (core_tokens >= 0),
  recall_tokens int not null check (recall_tokens >= 0),
  items int not null check (items >= 0),
  block_hash text check (block_hash ~ '^sha256:[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (task_id, attempt)
);
alter table public.memory_usage enable row level security;
alter table public.memory_usage force row level security;
revoke all on public.memory_usage from anon, authenticated;
grant select on public.memory_usage to authenticated;
create policy memory_usage_read on public.memory_usage for select to authenticated using ((select private.authorize('viewer', org_id)));
grant select, insert on public.memory_usage to service_role;
grant usage on sequence public.memory_usage_id_seq to service_role;
create policy memory_usage_service on public.memory_usage for all to service_role using (true) with check (true);
