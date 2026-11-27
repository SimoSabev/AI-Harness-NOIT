begin;
select plan(3);
-- D-713: Mandat's own retry note (kind 'self') may be up to 1200 chars; every other activity stays at 500.
insert into public.orgs (id, name) values ('00000000-0000-4000-8000-000000000001', 'demo');
insert into public.repos (id, org_id, provider, full_name, remote_url) values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'local', 's', 'file:///x');
insert into public.tasks (id, org_id, repo_id, type, agent, text) values ('t_demo', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'free', 'claude', 'x');
select lives_ok($$ insert into public.task_activities (org_id, task_id, kind, text) values ('00000000-0000-4000-8000-000000000001', 't_demo', 'self', repeat('a', 1200)) $$, 'a self note of 1200 chars');
select throws_ok($$ insert into public.task_activities (org_id, task_id, kind, text) values ('00000000-0000-4000-8000-000000000001', 't_demo', 'self', repeat('a', 1201)) $$, '23514', null, 'not over 1200');
select throws_ok($$ insert into public.task_activities (org_id, task_id, kind, text) values ('00000000-0000-4000-8000-000000000001', 't_demo', 'steer', repeat('a', 501)) $$, '23514', null, 'other kinds stay at 500');
select * from finish();
rollback;
