begin;
select plan(4);
-- E7д: the redacted stream lines of a session (the read-only terminal of the card); members of the org read them.
insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000000003', 'viewer@demo.invalid'), ('10000000-0000-4000-8000-000000000009', 'other@other.invalid');
insert into public.orgs (id, name) values ('00000000-0000-4000-8000-000000000001', 'demo'), ('00000000-0000-4000-8000-000000000009', 'other');
insert into public.members (org_id, user_id, role) values ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'viewer'), ('00000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000009', 'owner');
insert into public.agent_sessions (id, org_id, agent, model, role, state) values ('s_lead', '00000000-0000-4000-8000-000000000001', 'claude', 'sonnet', 'lead', 'running');
insert into public.session_lines (org_id, session_id, seq, kind, text) values ('00000000-0000-4000-8000-000000000001', 's_lead', 0, 'init', 'claude-sonnet-5-5'), ('00000000-0000-4000-8000-000000000001', 's_lead', 1, 'text', 'fixing');
select throws_ok($$ insert into public.session_lines (org_id, session_id, seq, kind, text) values ('00000000-0000-4000-8000-000000000001', 's_lead', 2, 'telepathy', 'x') $$, '23514', null, 'kind is one of the stream kinds');
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.session_lines), 2, 'a member reads the lines');
select throws_ok($$ insert into public.session_lines (org_id, session_id, seq, kind, text) values ('00000000-0000-4000-8000-000000000001', 's_lead', 3, 'text', 'x') $$, '42501', null, 'members cannot write lines');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000009","role":"authenticated"}';
select is((select count(*)::int from public.session_lines), 0, 'another org sees nothing');
reset role;
select * from finish();
rollback;
