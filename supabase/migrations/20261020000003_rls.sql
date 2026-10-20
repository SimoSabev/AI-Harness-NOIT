-- Демо промпт т. 5.3: every table with org_id has RLS. Reads: members (viewer+). Writes: the worker (service role,
-- bypasses RLS); mandat_runner only INSERTs into channel_usage, task_activities and changesets with integrity 'pending'.
do $$
declare t text;
begin
  foreach t in array array['orgs', 'members', 'repos', 'task_types', 'tasks', 'task_steps', 'changesets', 'verdicts', 'evidence',
    'failure_labels', 'ladder_state', 'ladder_events', 'deliveries', 'outcomes', 'approvals', 'ledger', 'anchors', 'budgets_usage',
    'model_channels', 'channel_usage', 'routing_rules', 'push_subscriptions', 'repo_sync_state', 'sync_events', 'security_events',
    'harness_proposals', 'task_activities', 'user_settings', 'outbox']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    -- Supabase grants ALL on new public tables to anon/authenticated by default: start from nothing (defense in depth)
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- viewer+ may read their org's rows (not outbox, task_steps: worker internals; not push_subscriptions of others)
do $$
declare t text;
begin
  foreach t in array array['repos', 'task_types', 'tasks', 'changesets', 'verdicts', 'evidence', 'failure_labels', 'ladder_state',
    'ladder_events', 'deliveries', 'outcomes', 'approvals', 'ledger', 'anchors', 'budgets_usage', 'model_channels', 'channel_usage',
    'routing_rules', 'repo_sync_state', 'sync_events', 'security_events', 'harness_proposals', 'task_activities']
  loop
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select private.authorize(''viewer'', org_id)))', t || '_read', t);
  end loop;
end $$;

grant select on public.orgs to authenticated;
create policy orgs_read on public.orgs for select to authenticated using ((select private.authorize('viewer', id)));
grant select on public.members to authenticated;
create policy members_read on public.members for select to authenticated using ((select private.authorize('viewer', org_id)));

grant select, insert, delete on public.push_subscriptions to authenticated;
create policy push_own on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and (select private.authorize('viewer', org_id)));
grant select, insert, update on public.user_settings to authenticated;
create policy settings_own on public.user_settings for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- mandat_runner (спец. т. 11): INSERT only, and never verdicts/evidence/ladder_*/ledger/deliveries.
grant insert on public.channel_usage, public.task_activities, public.changesets to mandat_runner;
grant usage on all sequences in schema public to mandat_runner;
create policy runner_channel_usage on public.channel_usage for insert to mandat_runner with check (true);
create policy runner_activities on public.task_activities for insert to mandat_runner with check (true);
create policy runner_changesets on public.changesets for insert to mandat_runner with check (integrity = 'pending');
revoke all on public.inbox_items from anon, authenticated;
grant select on public.inbox_items to authenticated;
