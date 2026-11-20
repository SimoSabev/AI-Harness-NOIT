-- D-557 (demo 4.12): the interview of a whole project when it is added. A conversation has a purpose (a task, or the
-- project); a project conversation keeps the brief the model proposed (shown, never acted on); a person approves it and
-- the repo keeps the approved brief and its hash, which later task conversations of the project start from.
alter table public.conversations add column if not exists purpose text not null default 'task' check (purpose in ('task', 'project'));
alter table public.conversations add column if not exists project_brief jsonb check (project_brief is null or (jsonb_typeof(project_brief) = 'object' and length(project_brief::text) <= 20000));
alter table public.conversations add column if not exists project_brief_hash text check (project_brief_hash is null or project_brief_hash ~ '^sha256:[0-9a-f]{64}$');
alter table public.conversations add column if not exists project_ready boolean not null default false;
alter table public.repos add column if not exists brief jsonb check (brief is null or (jsonb_typeof(brief) = 'object' and length(brief::text) <= 20000));
alter table public.repos add column if not exists brief_hash text check (brief_hash is null or brief_hash ~ '^sha256:[0-9a-f]{64}$');
alter table public.repos add column if not exists brief_approved_by uuid references auth.users (id) on delete set null;
alter table public.repos add column if not exists brief_approved_at timestamptz;
alter table public.conversation_turns drop constraint if exists conversation_turns_kind_check;
alter table public.conversation_turns add constraint conversation_turns_kind_check check (kind in ('human', 'assistant', 'memory', 'tool', 'axes', 'spec', 'project'));
