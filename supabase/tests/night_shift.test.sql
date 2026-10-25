begin;
select plan(9);
-- E9а (v5 5.1, D-320): the night shift runs tasks of a queue; a task that cannot be solved at night is parked with a
-- question (what stopped, what was tried, a proposal) and the shift goes on. Questions are written by the service and
-- read by the org's members; a person answers through the web server (service), never with a direct update.
insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000000001', 'owner@x.invalid'), ('10000000-0000-4000-8000-000000000009', 'other@x.invalid');
insert into public.orgs (id, name) values ('00000000-0000-4000-8000-000000000001', 'demo'), ('00000000-0000-4000-8000-000000000009', 'other');
insert into public.members (org_id, user_id, role) values ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner'), ('00000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000009', 'owner');
insert into public.repos (id, org_id, provider, full_name, remote_url) values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'local', 'shop', 'file:///x');
insert into public.night_shifts (id, org_id, starts_at, ends_at, budget_usd, rules) values
  ('50000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', now(), now() + interval '8 hours', 10,
   '{"auto_merge":{"min_level":2,"max_lines":200},"on_fail":"retry_then_park","retries":1,"same_file":"wait","forbid_tools":[]}');

set local role service_role;
select lives_ok($$ insert into public.tasks (id, org_id, repo_id, type, agent, text, shift_id) values ('t_night', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'bugfix', 'claude', 'x', '50000000-0000-4000-8000-000000000001') $$, 'a task belongs to a shift');
select lives_ok($$ insert into public.night_queue (org_id, shift_id, repo_id, position, text, risk, est_minutes, est_usd, status, task_id, note) values ('00000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 0, 'x', 'low', 10, 1, 'parked', 't_night', 'budget') $$, 'a night item can be parked, with a note');
select lives_ok($$ update public.tasks set retry_reason = 'night' where id = 't_night' $$, 'a night retry has its own reason');
select lives_ok($$ insert into public.night_questions (org_id, shift_id, task_id, what_stopped, tried, proposal) values ('00000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 't_night', 'FAILED after 2 attempt(s)', '["a1","a2"]', 'Add infra/** to allowed_paths') $$, 'the service writes a question');
select throws_ok($$ insert into public.night_questions (org_id, shift_id, task_id, what_stopped, tried, proposal, status) values ('00000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 't_night', 'x', '[]', 'y', 'maybe') $$, '23514', null, 'the status is one of open/answered/closed');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*)::int from public.night_questions), 1, 'a member reads the questions of the org');
select throws_ok($$ update public.night_questions set status = 'answered', answer = 'ok' $$, '42501', null, 'members answer through the server, not directly');
select throws_ok($$ insert into public.night_questions (org_id, shift_id, task_id, what_stopped, tried, proposal) values ('00000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 't_night', 'x', '[]', 'y') $$, '42501', null, 'members cannot write questions');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000009","role":"authenticated"}';
select is((select count(*)::int from public.night_questions), 0, 'another org sees nothing');
reset role;
select * from finish();
rollback;
