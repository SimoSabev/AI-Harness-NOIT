begin;
select plan(3);
-- A patch over 1 MB: the row keeps only its size (omitted_bytes), never a text next to it, never a small size.
insert into public.orgs (id, name) values ('00000000-0000-4000-8000-000000000001', 'demo');
insert into public.repos (id, org_id, provider, full_name, remote_url) values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'local', 's', 'file:///x');
insert into public.tasks (id, org_id, repo_id, type, agent, text) values ('t_demo', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'free', 'claude', 'x');
insert into public.changesets (id, org_id, task_id, base_sha) values ('30000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 't_demo', repeat('a', 40));
select lives_ok($$ insert into public.changeset_diffs (changeset_id, org_id, diff, omitted_bytes) values ('30000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', '', 2000000) $$, 'a large change keeps its size');
select throws_ok($$ update public.changeset_diffs set diff = 'x' where changeset_id = '30000000-0000-4000-8000-000000000002' $$, '23514', null, 'no text next to the size');
select throws_ok($$ update public.changeset_diffs set omitted_bytes = 10 where changeset_id = '30000000-0000-4000-8000-000000000002' $$, '23514', null, 'only a size over 1 MB');
select * from finish();
rollback;
