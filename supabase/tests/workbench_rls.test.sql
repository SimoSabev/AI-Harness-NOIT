begin;
select plan(5);

insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000000003', 'viewer@demo.invalid'), ('10000000-0000-4000-8000-000000000009', 'other@other.invalid');
insert into public.orgs (id, name) values ('00000000-0000-4000-8000-000000000001', 'demo'), ('00000000-0000-4000-8000-000000000009', 'other');
insert into public.members (org_id, user_id, role) values ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'viewer'), ('00000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000009', 'owner');
insert into public.repos (id, org_id, provider, full_name, remote_url) values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'local', 's', 'file:///x');
insert into public.agent_sessions (id, org_id, repo_id, agent, model, role, state) values ('s_lead', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'claude', 'sonnet', 'lead', 'running');
insert into public.tool_calls (org_id, session_id, kind, tool, decision) values ('00000000-0000-4000-8000-000000000001', 's_lead', 'mcp', 'github.get_issue', 'allowed');
insert into public.mcp_servers (org_id, name, transport) values ('00000000-0000-4000-8000-000000000001', 'github', 'http');
insert into public.night_shifts (org_id, starts_at, ends_at, budget_usd, rules) values ('00000000-0000-4000-8000-000000000001', now(), now() + interval '8 hours', 18, '{}');

select throws_ok($$ insert into public.agent_sessions (id, org_id, agent, model, role, state) values ('s_x', '00000000-0000-4000-8000-000000000001', 'a', 'm', 'subagent', 'running') $$, '23514', null, 'a subagent needs a parent');
select throws_ok($$ insert into public.open_windows (org_id, kind, title, url) values ('00000000-0000-4000-8000-000000000001', 'preview', 'x', 'https://evil.example') $$, '23514', null, 'open windows: localhost only');

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.agent_sessions) + (select count(*)::int from public.tool_calls) + (select count(*)::int from public.mcp_servers) + (select count(*)::int from public.night_shifts), 4, 'viewer reads its org');
select throws_ok($$ insert into public.tool_calls (org_id, session_id, kind, tool, decision) values ('00000000-0000-4000-8000-000000000001', 's_lead', 'mcp', 'x', 'allowed') $$, '42501', null, 'members cannot write tool calls');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000009","role":"authenticated"}';
select is((select count(*)::int from public.agent_sessions) + (select count(*)::int from public.tool_calls) + (select count(*)::int from public.mcp_servers) + (select count(*)::int from public.night_shifts), 0, 'another org sees nothing');
reset role;

select * from finish();
rollback;
