-- D-546 (М2 Х5): migration sites. The server finds a migration's sites in the code (git grep, with surplus); every found
-- file is in exactly one unit's files or skipped with a category. jobs.sites keeps the table (file, category, unit);
-- job_units.files are the files of a unit.

alter table public.jobs add column if not exists sites jsonb check (sites is null or (jsonb_typeof(sites) = 'array' and pg_column_size(sites) <= 1048576));
alter table public.job_units add column if not exists files jsonb not null default '[]'::jsonb check (jsonb_typeof(files) = 'array');
