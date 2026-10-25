-- E8g (v5 p. 4.4 (3), AC-8.5, D-353): "Steer". tasks.steerable is true while a steerable agent runs (the UI shows the
-- button only then); steer texts are task_activities of kind 'steer' with their author.
alter table public.tasks add column if not exists steerable boolean not null default false;
alter table public.task_activities add column if not exists by_user uuid references auth.users (id) on delete set null;
