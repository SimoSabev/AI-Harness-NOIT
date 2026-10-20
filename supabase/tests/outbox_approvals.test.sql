begin;
select plan(11);

insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000000002', 'approver@demo.invalid'), ('10000000-0000-4000-8000-000000000003', 'viewer@demo.invalid');
insert into public.orgs (id, name) values ('00000000-0000-4000-8000-000000000001', 'demo');
insert into public.members (org_id, user_id, role) values ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'approver'), ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'viewer');
insert into public.repos (id, org_id, provider, full_name, remote_url) values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'local', 's', 'file:///x');
insert into public.tasks (id, org_id, repo_id, type, agent, text) values ('t_demo', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'bugfix', 'claude', 'x');
insert into public.changesets (id, org_id, task_id, base_sha, head_sha, requires_second_factor) values
  ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 't_demo', repeat('a', 40), repeat('c', 40), true),
  ('30000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 't_demo', repeat('a', 40), repeat('c', 40), false);

-- outbox: unique idempotency_key
insert into public.outbox (org_id, kind, idempotency_key) values ('00000000-0000-4000-8000-000000000001', 'check_run', 'task:t_demo:1:check_run:1');
select throws_ok($$ insert into public.outbox (org_id, kind, idempotency_key) values ('00000000-0000-4000-8000-000000000001', 'check_run', 'task:t_demo:1:check_run:1') $$, '23505', null, 'outbox idempotency_key is unique');

-- approvals_method_check (спец. т. 11)
set local role service_role;
select throws_ok($$ select private.approve_changeset('30000000-0000-4000-8000-000000000001', repeat('c', 40), '10000000-0000-4000-8000-000000000002', 'approved', null, 'web', 'tap', null) $$, '42501', 'approval needs a second factor', 'tap when a second factor is required → exception');
select throws_ok($$ select private.approve_changeset('30000000-0000-4000-8000-000000000001', repeat('c', 40), '10000000-0000-4000-8000-000000000002', 'approved', null, 'web', 'totp', now() - interval '3 minutes') $$, '42501', null, 'TOTP from 3 min ago → refused');
select throws_ok($$ select private.approve_changeset('30000000-0000-4000-8000-000000000001', repeat('c', 40), '10000000-0000-4000-8000-000000000003', 'approved', null, 'web', 'totp', now()) $$, '42501', 'not an approver', 'viewer cannot approve');
select lives_ok($$ select private.approve_changeset('30000000-0000-4000-8000-000000000001', repeat('c', 40), '10000000-0000-4000-8000-000000000002', 'approved', null, 'web', 'totp', now()) $$, 'fresh TOTP → approved');
select lives_ok($$ select private.approve_changeset('30000000-0000-4000-8000-000000000002', repeat('c', 40), '10000000-0000-4000-8000-000000000002', 'approved', null, 'web', 'tap', null) $$, 'tap without second factor → ok');
reset role;
-- one transaction: approval + ledger + outbox
select is((select count(*)::int from public.ledger where kind = 'approval'), 2, 'ledger rows for both approvals');
select is((select count(*)::int from public.outbox where kind in ('approval_check', 'ready_for_review')), 4, 'outbox rows (ready + approval check) for both approvals');
set local role service_role;
select throws_ok($$ select private.approve_changeset('30000000-0000-4000-8000-000000000002', repeat('d', 40), '10000000-0000-4000-8000-000000000002', 'approved', null, 'web', 'tap', null) $$, '40001', 'head_sha moved', 'old head_sha → refused (approve-head-sha)');
select is((select count(*)::int from public.approvals where changeset_id = '30000000-0000-4000-8000-000000000002'), 1, 'still one approval: the partial unique index (approve-cas)');
reset role;
set local role authenticated;
select throws_ok($$ select private.approve_changeset('30000000-0000-4000-8000-000000000002', repeat('c', 40), '10000000-0000-4000-8000-000000000002', 'approved', null, 'web', 'tap', null) $$, '42501', null, 'authenticated → permission denied');
reset role;

select * from finish();
rollback;
