-- D-531 (E10а ф. 1): a conversation before work, without a sandbox. A person writes, the worker answers through a model
-- with a budget and an expiry (the mdt_ token of research), and the turns are stored in order. The conversation ends
-- when a person starts the work (phase 'work', the task it made). Only the server writes; the org's members read.
create table if not exists public.conversations (
  id text primary key check (id ~ '^c_[a-z0-9_]{1,40}$'),
  org_id uuid not null references public.orgs (id) on delete cascade,
  repo_id uuid references public.repos (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  agent text not null check (length(agent) <= 64),
  model text check (length(model) <= 128),
  phase text not null default 'conversation' check (phase in ('conversation', 'work')),
  status text not null default 'queued' check (status in ('idle', 'queued', 'running', 'budget', 'expired', 'overloaded', 'failed')),
  budget_usd numeric(10, 4) not null check (budget_usd >= 0),
  usd numeric(10, 4) not null default 0 check (usd >= 0),
  expires_at timestamptz not null,
  error text check (length(error) <= 300),
  task_id text references public.tasks (id) on delete set null,
  heartbeat_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists conversations_queue on public.conversations (status, updated_at) where status in ('queued', 'running');
create index if not exists conversations_org on public.conversations (org_id, created_at desc);

-- the turns: ChatTurn (packages/contract/src/conversation.ts) without seq/at/kind in data
create table if not exists public.conversation_turns (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.orgs (id) on delete cascade,
  conversation_id text not null references public.conversations (id) on delete cascade,
  seq int not null check (seq >= 0),
  at timestamptz not null default now(),
  kind text not null check (kind in ('human', 'assistant', 'memory')),
  data jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 65536),
  unique (conversation_id, seq)
);

alter table public.conversations enable row level security;
alter table public.conversations force row level security;
revoke all on public.conversations from anon, authenticated;
grant select on public.conversations to authenticated;
create policy conversations_read on public.conversations for select to authenticated using ((select private.authorize('viewer', org_id)));
grant select, insert, update, delete on public.conversations to service_role;
create policy conversations_service on public.conversations for all to service_role using (true) with check (true);

alter table public.conversation_turns enable row level security;
alter table public.conversation_turns force row level security;
revoke all on public.conversation_turns from anon, authenticated;
grant select on public.conversation_turns to authenticated;
create policy conversation_turns_read on public.conversation_turns for select to authenticated using ((select private.authorize('viewer', org_id)));
grant select, insert, update, delete on public.conversation_turns to service_role;
create policy conversation_turns_service on public.conversation_turns for all to service_role using (true) with check (true);
