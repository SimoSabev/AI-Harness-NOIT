begin;
select plan(5);
-- D-708: the whole change of a job (the final check's export): an approver reads it, a viewer and another org do not;
-- over 1 MB only the size stays, never a text next to it.
insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000000002', 'approver@demo.invalid'), ('10000000-0000-4000-8000-000000000003', 'viewer@demo.invalid'), ('10000000-0000-4000-8000-000000000004', 'other@demo.invalid');
insert into public.orgs (id, name) values ('00000000-0000-4000-8000-000000000001', 'demo'), ('00000000-0000-4000-8000-000000000002', 'other');
insert into public.members (org_id, user_id, role) values ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'approver'), ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'viewer'), ('00000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000004', 'owner');
insert into public.repos (id, org_id, provider, full_name, remote_url) values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'local', 's', 'file:///x');
insert into public.conversations (id, org_id, repo_id, agent, budget_usd, expires_at) values ('c_d1', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'claude', 1, now() + interval '1 day');
insert into public.jobs (id, org_id, repo_id, conversation_id, spec_hash, oracle_hash, type, agent) values ('j_d1', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'c_d1', 'sha256:' || repeat('a', 64), 'sha256:' || repeat('b', 64), 'feature', 'claude');
insert into public.tasks (id, org_id, repo_id, type, agent, text) values ('t_jd1_f0', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'feature', 'claude', 'final'), ('t_jd1_f1', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'feature', 'claude', 'final');
insert into public.job_diffs (task_id, job_id, org_id, diff) values ('t_jd1_f0', 'j_d1', '00000000-0000-4000-8000-000000000001', 'diff --git a/x b/x');
select throws_ok($$ insert into public.job_diffs (task_id, job_id, org_id, diff, omitted_bytes) values ('t_jd1_f1', 'j_d1', '00000000-0000-4000-8000-000000000001', 'x', 2000000) $$, '23514', null, 'no text next to the size');

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.job_diffs), 0, 'viewer: no job diff');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated"}';
select is((select count(*)::int from public.job_diffs), 0, 'another org: nothing');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::int from public.job_diffs), 1, 'approver: the job diff');
select throws_ok($$ insert into public.job_diffs (task_id, job_id, org_id, diff) values ('t_jd1_f1', 'j_d1', '00000000-0000-4000-8000-000000000001', 'x') $$, '42501', null, 'only the server writes it');
reset role;

select * from finish();
rollback;
