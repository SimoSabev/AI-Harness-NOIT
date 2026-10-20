-- E4 (демо промпт т. 9.0): the deterministic agent of a demo task replays a recording; the name goes into the contract.
alter table public.tasks add column if not exists replay text check (replay ~ '^[a-z0-9-]{1,60}$');
