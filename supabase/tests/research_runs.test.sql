begin;
select plan(9);
-- E9г (D-409): research questions are queued, run by the worker (service role) with a live event trail, and read by the
-- org's members; members never write the trail or the report directly.
insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000000001', 'owner@x.invalid'), ('10000000-0000-4000-8000-000000000009', 'other@x.invalid');
insert into public.orgs (id, name) values ('00000000-0000-4000-8000-000000000001', 'demo'), ('00000000-0000-4000-8000-000000000009', 'other');
insert into public.members (org_id, user_id, role) values ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner'), ('00000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000009', 'owner');

set local role service_role;
select lives_ok($$ insert into public.research_questions (id, org_id, question, depth, goal, request, created_by) values ('q_one', '00000000-0000-4000-8000-000000000001', 'What is JCS?', 'standard', 'balanced', '{"question":"What is JCS?"}', '10000000-0000-4000-8000-000000000001') $$, 'a question is queued by the server');
select is((select status from public.research_questions where id = 'q_one'), 'queued', 'a new question waits in the queue');
select lives_ok($$ insert into public.research_events (org_id, question_id, seq, at, lane, kind, data) values ('00000000-0000-4000-8000-000000000001', 'q_one', 0, now(), null, 'run_started', '{}'), ('00000000-0000-4000-8000-000000000001', 'q_one', 1, now(), 'l1', 'fetch', '{"url":"https://a.org"}') $$, 'the worker writes events');
select throws_ok($$ insert into public.research_events (org_id, question_id, seq, at, lane, kind, data) values ('00000000-0000-4000-8000-000000000001', 'q_one', 1, now(), 'l1', 'fetch', '{}') $$, '23505', null, 'one event per sequence number');
select throws_ok($$ insert into public.research_events (org_id, question_id, seq, at, lane, kind, data) values ('00000000-0000-4000-8000-000000000001', 'q_one', 2, now(), 'lane one', 'teleport', '{}') $$, '23514', null, 'kind and lane are checked');
select lives_ok($$ insert into public.research_sources (org_id, question_id, n, title, url, state, domain, final_url, content_hash, tier, lane) values ('00000000-0000-4000-8000-000000000001', 'q_one', 1, 'A', 'https://a.org', 'blocked', 'a.org', 'https://a.org', 'sha256:' || repeat('a', 64), 'archive', 'l1') $$, 'a source keeps its hash, tier and lane');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*)::int from public.research_events where question_id = 'q_one'), 2, 'a member reads the trail');
select throws_ok($$ insert into public.research_events (org_id, question_id, seq, at, kind, data) values ('00000000-0000-4000-8000-000000000001', 'q_one', 9, now(), 'note', '{}') $$, '42501', null, 'members cannot write the trail');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000009","role":"authenticated"}';
select is((select count(*)::int from public.research_events), 0, 'another org sees nothing');
reset role;
select * from finish();
rollback;
