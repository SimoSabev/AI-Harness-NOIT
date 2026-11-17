-- D-533 (М1 Х1–Х2): the conversation understands the task on the six axes and proposes a spec; a person approves it.
-- The worker writes the axes, the derived profile and the proposed spec; the approve route writes the approval (with
-- a ledger row spec_approved). "Start work" carries the approved spec's hash into the task and its sealed contract.
-- Same RLS as D-531: the org's members read, only the server writes (the new columns are covered by the table policies).
alter table public.conversations
  add column if not exists axes jsonb check (axes is null or jsonb_typeof(axes) = 'object'),
  add column if not exists profile text check (profile is null or profile ~ '^[a-z_]{1,40}$'),
  add column if not exists unknown_axes jsonb check (unknown_axes is null or jsonb_typeof(unknown_axes) = 'array'),
  add column if not exists spec jsonb check (spec is null or (jsonb_typeof(spec) = 'object' and pg_column_size(spec) <= 262144)),
  add column if not exists spec_hash text check (spec_hash is null or spec_hash ~ '^sha256:[0-9a-f]{64}$'),
  add column if not exists spec_ready boolean not null default false,
  add column if not exists approved_spec jsonb check (approved_spec is null or (jsonb_typeof(approved_spec) = 'object' and pg_column_size(approved_spec) <= 262144)),
  add column if not exists approved_spec_hash text check (approved_spec_hash is null or approved_spec_hash ~ '^sha256:[0-9a-f]{64}$'),
  add column if not exists approved_by uuid references auth.users (id) on delete set null,
  add column if not exists approved_at timestamptz;
alter table public.conversations drop constraint if exists conversations_approval_whole;
alter table public.conversations add constraint conversations_approval_whole
  check ((approved_spec_hash is null) = (approved_at is null) and (approved_spec_hash is null) = (approved_spec is null));

-- the new turns: what a tool did (never file contents), the proposed axes and the proposed spec; a spec may be long
alter table public.conversation_turns drop constraint if exists conversation_turns_kind_check;
alter table public.conversation_turns add constraint conversation_turns_kind_check check (kind in ('human', 'assistant', 'memory', 'tool', 'axes', 'spec'));
alter table public.conversation_turns drop constraint if exists conversation_turns_data_check;
alter table public.conversation_turns add constraint conversation_turns_data_check check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 262144);

-- the approved spec's hash travels with the task into its sealed contract (contract.spec_hash) and the ledger
alter table public.tasks add column if not exists spec_hash text check (spec_hash is null or spec_hash ~ '^sha256:[0-9a-f]{64}$');
