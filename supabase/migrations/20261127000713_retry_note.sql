-- D-713 (code critic, 27.11.2026): a retry note of D-711 (the failed hidden checks' titles) may be longer than the 500
-- chars every activity had; only Mandat's own note (kind 'self') may take up to 1200. Indexes for the reads the night
-- added: the last verdict's D5 evidence of a task (self-finish) and each conversation's latest job (the task list).
alter table public.task_activities drop constraint if exists task_activities_text_check;
alter table public.task_activities add constraint task_activities_text_check check (length(text) <= 500 or (kind = 'self' and length(text) <= 1200));
create index if not exists evidence_verdict_detector on public.evidence (verdict_id, detector);
create index if not exists verdicts_task_attempt on public.verdicts (task_id, attempt);
create index if not exists jobs_org_conversation on public.jobs (org_id, conversation_id, created_at desc);
