-- D-708: the whole change of a job, as its final check exported it (base..branch head, the patch only without a secret
-- hit), so a person sees what they merge before "Approve and merge". Keyed by the final task: a restack clears the job's
-- final_task_id (D-547), so the card shows only the diff of the check that made the current seal. Approver+ like
-- changeset_diffs; over 1 MB only the size stays.
create table if not exists public.job_diffs (
  task_id text primary key references public.tasks (id) on delete cascade,
  job_id text not null references public.jobs (id) on delete cascade,
  org_id uuid not null references public.orgs (id) on delete cascade,
  diff text not null check (octet_length(diff) <= 1048576),
  omitted_bytes bigint,
  -- D-710: the final verdict's diff_hash (sha256 of this patch, in the verdict the ledger hashes): the web shows the text only when it matches
  diff_hash text check (diff_hash ~ '^sha256:[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  constraint job_diffs_omitted_check check (omitted_bytes is null or (omitted_bytes > 1048576 and diff = ''))
);
create index if not exists job_diffs_job on public.job_diffs (job_id);
alter table public.job_diffs enable row level security;
alter table public.job_diffs force row level security;
revoke all on public.job_diffs from anon, authenticated;
grant select on public.job_diffs to authenticated;
drop policy if exists job_diffs_read on public.job_diffs;
create policy job_diffs_read on public.job_diffs for select to authenticated using ((select private.authorize('approver', org_id)));
