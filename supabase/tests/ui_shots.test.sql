begin;
select plan(6);
-- v5 E9б (5.2, D-364): the D12 screenshots of a changeset (before/after) for the card; approver+ like the diff; only the
-- worker (service) writes; a name is route-N.png or base-route-N.png and a file is at most 5 MB.
insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000000002', 'approver@x.invalid'), ('10000000-0000-4000-8000-000000000003', 'viewer@x.invalid'), ('10000000-0000-4000-8000-000000000009', 'other@x.invalid');
insert into public.orgs (id, name) values ('00000000-0000-4000-8000-000000000001', 'demo'), ('00000000-0000-4000-8000-000000000009', 'other');
insert into public.members (org_id, user_id, role) values ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'approver'), ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'viewer'), ('00000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000009', 'owner');
insert into public.repos (id, org_id, provider, full_name, remote_url) values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'local', 's', 'file:///x');
insert into public.tasks (id, org_id, repo_id, type, agent, text) values ('t_demo', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'free', 'claude', 'x');
insert into public.changesets (id, org_id, task_id, base_sha) values ('30000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 't_demo', repeat('a', 40));

set local role service_role;
insert into public.changeset_shots (changeset_id, org_id, name, png) values ('30000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'route-0.png', '\x89504e47'), ('30000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'base-route-0.png', '\x89504e47');
select throws_ok($$ insert into public.changeset_shots (changeset_id, org_id, name, png) values ('30000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', '../x.png', '\x00') $$, '23514', null, 'a foreign name is refused');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.changeset_shots), 0, 'viewer: no screenshots');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::int from public.changeset_shots), 2, 'approver: before and after');
select throws_ok($$ insert into public.changeset_shots (changeset_id, org_id, name, png) values ('30000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'route-1.png', '\x00') $$, '42501', null, 'members cannot write');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000009","role":"authenticated"}';
select is((select count(*)::int from public.changeset_shots), 0, 'another org sees nothing');
reset role;
select is((select count(*)::int from public.changesets where id = '30000000-0000-4000-8000-000000000002'), 1, 'the changeset is there');
select * from finish();
rollback;
