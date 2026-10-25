-- A change over 1 MB used to leave no changeset_diffs row, so the task vanished from the library and the card showed no
-- change at all. Now the row stays with the size of the patch and an empty text; the reader says why there is nothing to see.
alter table public.changeset_diffs add column if not exists omitted_bytes bigint;
alter table public.changeset_diffs drop constraint if exists changeset_diffs_omitted_check;
alter table public.changeset_diffs add constraint changeset_diffs_omitted_check check (omitted_bytes is null or (omitted_bytes > 1048576 and diff = ''));
