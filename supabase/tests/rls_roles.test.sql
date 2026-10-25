begin;
select plan(17);
-- E8в (v5 т. 4.3, D-315/D-349): roles are data with capabilities; RLS and the approval functions ask has_cap.
insert into auth.users (id, email) values
  ('10000000-0000-4000-8000-000000000001', 'owner@x.invalid'), ('10000000-0000-4000-8000-000000000002', 'worker@x.invalid'),
  ('10000000-0000-4000-8000-000000000003', 'approver@x.invalid'), ('10000000-0000-4000-8000-000000000004', 'operator@x.invalid'),
  ('10000000-0000-4000-8000-000000000005', 'viewer@x.invalid'), ('10000000-0000-4000-8000-000000000006', 'docs@x.invalid');
insert into public.orgs (id, name) values ('00000000-0000-4000-8000-000000000001', 'demo');
insert into public.repos (id, org_id, provider, full_name, remote_url) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'local', 'shop', 'file:///x'),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'local', 'site', 'file:///y');
insert into public.members (org_id, user_id, role) values
  ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner'),
  ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'approver'),
  ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000005', 'viewer');
insert into public.members (org_id, user_id, role, role_id) values
  ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'viewer', 'builtin:worker'),
  ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 'viewer', 'builtin:agent-operator');
insert into public.roles (id, org_id, name, builtin, capabilities, scope) values
  ('3f6c1c56-8b38-4a3b-a5a3-0f43a0d1b0a1', '00000000-0000-4000-8000-000000000001', 'docs reviewer', false, '{approve.level1,approve.level2,diff.view}',
   '{"repos":["20000000-0000-4000-8000-000000000002"],"task_types":["docs"],"level_cap":2,"budget_usd_day":null}');
insert into public.members (org_id, user_id, role, role_id) values ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000006', 'viewer', '3f6c1c56-8b38-4a3b-a5a3-0f43a0d1b0a1');
insert into public.tasks (id, org_id, repo_id, type, agent, text) values
  ('t_bug', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'bugfix', 'claude', 'fix'),
  ('t_doc', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'docs', 'claude', 'docs'),
  ('t_doc3', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'docs', 'claude', 'docs at level 3');
insert into public.changesets (id, org_id, task_id, base_sha, head_sha, effective_level) values
  ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 't_bug', repeat('a', 40), repeat('b', 40), 2),
  ('30000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 't_doc', repeat('a', 40), repeat('c', 40), 2),
  ('30000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 't_doc3', repeat('a', 40), repeat('d', 40), 3);

select is((select count(*)::int from public.roles where builtin), 5, 'five builtin roles');
select is((select role_id from public.members where user_id = '10000000-0000-4000-8000-000000000003'), 'builtin:approver', 'legacy role → role_id');
select throws_ok($$ update public.roles set capabilities = '{diff.view}' where id = 'builtin:viewer' $$, '42501', null, 'a builtin role cannot be edited');
select throws_ok($$ delete from public.roles where id = 'builtin:owner' $$, '42501', null, 'a builtin role cannot be deleted');
select throws_ok($$ insert into public.roles (id, org_id, name, builtin, capabilities) values (gen_random_uuid()::text, '00000000-0000-4000-8000-000000000001', 'x', false, '{root}') $$, '23514', null, 'unknown capability refused');

-- approvals (service role calls the function with the user)
set local role service_role;
select lives_ok($$ select private.approve_changeset('30000000-0000-4000-8000-000000000001', repeat('b', 40), '10000000-0000-4000-8000-000000000003', 'approved', null, 'web', 'tap', null) $$, 'approver approves level 2');
select lives_ok($$ select private.approve_changeset('30000000-0000-4000-8000-000000000001', repeat('b', 40), '10000000-0000-4000-8000-000000000002', 'rejected', null, 'web', 'tap', null) $$, 'worker approves level 1… and rejects (approve.level1 is enough to reject)');
select throws_ok($$ select private.approve_changeset('30000000-0000-4000-8000-000000000001', repeat('b', 40), '10000000-0000-4000-8000-000000000004', 'approved', null, 'web', 'tap', null) $$, '42501', null, 'agent-operator cannot approve');
select throws_ok($$ select private.approve_changeset('30000000-0000-4000-8000-000000000001', repeat('b', 40), '10000000-0000-4000-8000-000000000005', 'approved', null, 'web', 'tap', null) $$, '42501', null, 'viewer cannot approve');
select lives_ok($$ select private.approve_changeset('30000000-0000-4000-8000-000000000002', repeat('c', 40), '10000000-0000-4000-8000-000000000006', 'approved', null, 'web', 'tap', null) $$, 'docs reviewer approves a docs change at level 2 in its repo');
select throws_ok($$ select private.approve_changeset('30000000-0000-4000-8000-000000000001', repeat('b', 40), '10000000-0000-4000-8000-000000000006', 'approved', null, 'web', 'tap', null) $$, '42501', null, 'docs reviewer cannot approve a bugfix in another repo');
select throws_ok($$ select private.approve_changeset('30000000-0000-4000-8000-000000000003', repeat('d', 40), '10000000-0000-4000-8000-000000000006', 'approved', null, 'web', 'tap', null) $$, '42501', null, 'docs reviewer cannot approve above its level cap');
reset role;

-- RLS through authorize() = capabilities
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(private.has_cap('00000000-0000-4000-8000-000000000001', 'task.create'), true, 'worker creates tasks');
select is(private.has_cap('00000000-0000-4000-8000-000000000001', 'keys.manage'), false, 'worker does not manage keys (dangerous)');
select is((select count(*)::int from public.tasks), 3, 'worker reads the org tasks (diff.view)');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000005","role":"authenticated"}';
select is(private.has_cap('00000000-0000-4000-8000-000000000001', 'task.create'), false, 'viewer cannot create tasks');
select is(private.authorize('owner', '00000000-0000-4000-8000-000000000001'), false, 'viewer is not owner-equivalent');
reset role;
select * from finish();
rollback;
