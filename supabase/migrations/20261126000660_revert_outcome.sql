-- E9f (v5 5.6, AC-9.5, D-660): a revert of a merged change within 7 days is that change's real outcome. The merge wrote
-- a success (reason 'merge'); the revert adds ONE failure per changeset (reason 'revert', the revert commit's sha).
alter table public.outcomes add column reason text not null default 'merge' check (reason in ('merge', 'revert'));
alter table public.outcomes add column revert_sha text check (revert_sha ~ '^[0-9a-f]{40}$');
alter table public.outcomes add constraint outcomes_revert_has_sha check ((reason = 'revert') = (revert_sha is not null));
create unique index outcomes_one_revert on public.outcomes (changeset_id) where reason = 'revert';
