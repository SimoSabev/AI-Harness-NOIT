begin;
select plan(3);
-- D-360 (Simo, 23.10.2026): the task type "free" has no scope limits; the database accepts it wherever a type is stored.
insert into public.orgs (id, name) values ('00000000-0000-4000-8000-000000000001', 'demo');
insert into public.repos (id, org_id, provider, full_name, remote_url) values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'local', 'shop', 'file:///x');
insert into public.night_shifts (id, org_id, starts_at, ends_at, budget_usd, rules) values ('50000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', now(), now() + interval '1 hour', 1, '{}');
select lives_ok($$ insert into public.tasks (id, org_id, repo_id, type, agent, text) values ('t_free', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'free', 'claude', 'x') $$, 'a free task');
select lives_ok($$ insert into public.task_types (org_id, repo_id, name, risk_class) values ('00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'free', 'medium') $$, 'a free task type of a repo');
select lives_ok($$ insert into public.night_queue (org_id, shift_id, repo_id, position, text, risk, est_minutes, est_usd, type) values ('00000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 0, 'x', 'low', 1, 0, 'free') $$, 'a free night item');
select * from finish();
rollback;
