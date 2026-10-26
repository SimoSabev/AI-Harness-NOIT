-- D-392: the model a person picked for a task (null = the connection's default) and the kind of channel it ran on — a
-- local model is capped at ladder level 1 (spec 5.3), so the outcome needs to know it.
alter table public.tasks add column if not exists model text check (model is null or model ~ '^[A-Za-z0-9][A-Za-z0-9._:/@\[\]-]{0,127}$');
alter table public.tasks add column if not exists channel_kind text check (channel_kind is null or channel_kind in ('api_key', 'cli_profile', 'local'));
