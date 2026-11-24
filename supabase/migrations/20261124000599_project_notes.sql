-- D-599 (Simo 24.11.2026): the brief of a project is written live while the interview asks. With any answer the model
-- notes the parts of the brief it just learned and where from (the code or the person); each note is a turn of its own.
alter table public.conversation_turns drop constraint if exists conversation_turns_kind_check;
alter table public.conversation_turns add constraint conversation_turns_kind_check check (kind in ('human', 'assistant', 'memory', 'tool', 'axes', 'spec', 'project', 'project_note'));
