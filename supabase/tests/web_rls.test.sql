begin;
select plan(4);

insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000000002', 'approver@demo.invalid'), ('10000000-0000-4000-8000-000000000003', 'viewer@demo.invalid');
insert into public.orgs (id, name) values ('00000000-0000-4000-8000-000000000001', 'demo');
insert into public.members (org_id, user_id, role) values ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'approver'), ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'viewer');
insert into public.repos (id, org_id, provider, full_name, remote_url) values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'local', 's', 'file:///x');
insert into public.tasks (id, org_id, repo_id, type, agent, text) values ('t_demo', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'bugfix', 'claude', 'x');
insert into public.changesets (id, org_id, task_id, base_sha) values ('30000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 't_demo', repeat('a', 40));
insert into public.changeset_diffs (changeset_id, org_id, diff) values ('30000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'diff --git a/x b/x');
insert into public.task_activities (org_id, task_id, kind, text) values ('00000000-0000-4000-8000-000000000001', 't_demo', 'tool', 'edit src/cart.ts');

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.changeset_diffs) + (select count(*)::int from public.task_activities), 0, 'viewer: no diff, no activities');
select is((select count(*)::int from public.tasks), 1, 'viewer still sees the task');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::int from public.changeset_diffs) + (select count(*)::int from public.task_activities), 2, 'approver: diff + activities');
select throws_ok($$ select * from private.dev_totp $$, '42501', null, 'dev_totp is not readable by authenticated');
reset role;

select * from finish();
rollback;
