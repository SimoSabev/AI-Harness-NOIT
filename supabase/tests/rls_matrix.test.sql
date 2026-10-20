begin;
select plan(17);

insert into auth.users (id, email) values
  ('10000000-0000-4000-8000-000000000001', 'owner@demo.invalid'),
  ('10000000-0000-4000-8000-000000000002', 'approver@demo.invalid'),
  ('10000000-0000-4000-8000-000000000003', 'viewer@demo.invalid'),
  ('10000000-0000-4000-8000-000000000004', 'stranger@demo.invalid');
insert into public.orgs (id, name, is_demo) values ('00000000-0000-4000-8000-000000000001', 'demo', true), ('00000000-0000-4000-8000-000000000002', 'other', false);
insert into public.members (org_id, user_id, role) values
  ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner'),
  ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'approver'),
  ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'viewer');
insert into public.repos (id, org_id, provider, full_name, remote_url) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'local', 'mandat-demo/shop', 'file:///x'),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'local', 'other/repo', 'file:///y');
insert into public.tasks (id, org_id, repo_id, type, agent, text) values ('t_demo', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'bugfix', 'claude', 'x');
insert into public.verdicts (org_id, task_id, run_id, attempt, mode, agent, result, base_sha, verdict_hash)
  values ('00000000-0000-4000-8000-000000000001', 't_demo', 'r_01JABCDEFGHJKMNPQRSTVWXYZ0', 1, 'full', 'claude', 'VERIFIED', repeat('a', 40), 'sha256:x');
insert into public.outbox (org_id, kind, idempotency_key) values ('00000000-0000-4000-8000-000000000001', 'check_run', 'k1');

-- anon sees nothing
set local role anon;
select throws_ok($$ select * from public.repos $$, '42501', null, 'anon: repos');
select throws_ok($$ select * from public.verdicts $$, '42501', null, 'anon: verdicts');
select throws_ok($$ select * from public.ledger $$, '42501', null, 'anon: ledger');
reset role;

-- viewer / approver / owner read their org only
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}';
select results_eq($$ select full_name from public.repos $$, $$ values ('mandat-demo/shop') $$, 'viewer: own org repos only');
select is((select count(*)::int from public.verdicts), 1, 'viewer: verdicts of own org');
select is((select count(*)::int from public.orgs), 1, 'viewer: one org');
select throws_ok($$ insert into public.verdicts (org_id, task_id, run_id, attempt, mode, agent, result, base_sha, verdict_hash) values ('00000000-0000-4000-8000-000000000001', 't_demo', 'r_01JABCDEFGHJKMNPQRSTVWXYZ1', 1, 'full', 'x', 'VERIFIED', repeat('a', 40), 'x') $$, '42501', null, 'viewer: cannot write verdicts');
select throws_ok($$ select * from public.outbox $$, '42501', null, 'viewer: outbox is internal');
select throws_ok($$ select * from public.task_steps $$, '42501', null, 'viewer: task_steps is internal');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated"}';
select is((select count(*)::int from public.repos), 0, 'stranger: nothing');
select is((select count(*)::int from public.verdicts), 0, 'stranger: no verdicts');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok($$ update public.ladder_state set level = 3 $$, '42501', null, 'owner: no direct ladder writes');
select throws_ok($$ insert into public.approvals (org_id, changeset_id, user_id, decision, method) values ('00000000-0000-4000-8000-000000000001', gen_random_uuid(), '10000000-0000-4000-8000-000000000001', 'approved', 'tap') $$, '42501', null, 'owner: approvals only through private.approve_changeset');
reset role;

-- mandat_runner: INSERT channel_usage / task_activities / changesets(pending) only
set local role mandat_runner;
select lives_ok($$ insert into public.task_activities (org_id, task_id, kind, text) values ('00000000-0000-4000-8000-000000000001', 't_demo', 'agent', 'hi') $$, 'runner: task_activities');
select lives_ok($$ insert into public.changesets (org_id, task_id, base_sha) values ('00000000-0000-4000-8000-000000000001', 't_demo', repeat('b', 40)) $$, 'runner: changeset pending');
select throws_ok($$ insert into public.changesets (org_id, task_id, base_sha, integrity) values ('00000000-0000-4000-8000-000000000001', 't_demo', repeat('b', 40), 'ok') $$, '42501', null, 'runner: changeset integrity ok refused');
select throws_ok($$ insert into public.verdicts (org_id, task_id, run_id, attempt, mode, agent, result, base_sha, verdict_hash) values ('00000000-0000-4000-8000-000000000001', 't_demo', 'r_01JABCDEFGHJKMNPQRSTVWXYZ2', 1, 'full', 'x', 'VERIFIED', repeat('a', 40), 'x') $$, '42501', null, 'runner: no verdicts');
reset role;

select * from finish();
rollback;
