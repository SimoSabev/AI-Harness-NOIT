begin;
select plan(9);
-- E8g (v5 p. 4.4, D-352): a permission change is a new profile version where only layer C differs; opening net:* or
-- bash:git push needs a fresh TOTP; the asks of a task are read by the org's members and written only by the service.
insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000000001', 'owner@x.invalid'), ('10000000-0000-4000-8000-000000000009', 'other@x.invalid');
insert into public.orgs (id, name) values ('00000000-0000-4000-8000-000000000001', 'demo'), ('00000000-0000-4000-8000-000000000009', 'other');
insert into public.members (org_id, user_id, role) values ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner'), ('00000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000009', 'owner');
insert into public.repos (id, org_id, provider, full_name, remote_url) values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'local', 'shop', 'file:///x');
insert into public.harness_profiles (id, org_id, repo_id, version, layers, sources, profile_hash, status, approved_by, approved_at) values
  ('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 1,
   '{"b":{"summary":"v1"},"c":[{"subject":"any","tool":"mcp:stripe.create_refund","decision":"ask","reason":"money"},{"subject":"any","tool":"net:api.segment.io","decision":"deny","reason":""}]}',
   '{}', 'sha256:' || repeat('1', 64), 'approved', '10000000-0000-4000-8000-000000000001', now());
update public.repos set profile_id = '40000000-0000-4000-8000-000000000001' where id = '20000000-0000-4000-8000-000000000001';
insert into public.tasks (id, org_id, repo_id, type, agent, text, state) values ('t_ask', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'bugfix', 'claude', 'x', 'HELD');
insert into public.tool_asks (org_id, task_id, attempt, tool, reason) values ('00000000-0000-4000-8000-000000000001', 't_ask', 1, 'mcp:stripe.create_refund', 'money');

set local role service_role;
select throws_ok($$ select private.layer_c_version('20000000-0000-4000-8000-000000000001', '{"b":{"summary":"changed"},"c":[]}', 'sha256:' || repeat('2', 64), '10000000-0000-4000-8000-000000000001', null, '{}') $$, '22023', null, 'only layer C may change');
select is(private.layer_c_version('20000000-0000-4000-8000-000000000001',
  '{"b":{"summary":"v1"},"c":[{"subject":"any","tool":"mcp:stripe.create_refund","decision":"allow","reason":"money"},{"subject":"any","tool":"net:api.segment.io","decision":"deny","reason":""}]}',
  'sha256:' || repeat('2', 64), '10000000-0000-4000-8000-000000000001', null, '{"tool":"mcp:stripe.create_refund"}'), 2, 'ask → allow on an MCP tool: a new approved version without TOTP');
select is((select profile_id from public.repos where id = '20000000-0000-4000-8000-000000000001'), (select id from public.harness_profiles where version = 2), 'the repo points at the new version');
select throws_ok($$ select private.layer_c_version('20000000-0000-4000-8000-000000000001',
  '{"b":{"summary":"v1"},"c":[{"subject":"any","tool":"mcp:stripe.create_refund","decision":"allow","reason":"money"},{"subject":"any","tool":"net:api.segment.io","decision":"allow","reason":""}]}',
  'sha256:' || repeat('3', 64), '10000000-0000-4000-8000-000000000001', now() - interval '3 minutes', '{}') $$, '42501', null, 'deny → allow on net:* without a fresh TOTP is refused');
select is(private.layer_c_version('20000000-0000-4000-8000-000000000001',
  '{"b":{"summary":"v1"},"c":[{"subject":"any","tool":"mcp:stripe.create_refund","decision":"allow","reason":"money"},{"subject":"any","tool":"net:api.segment.io","decision":"allow","reason":""}]}',
  'sha256:' || repeat('3', 64), '10000000-0000-4000-8000-000000000001', now(), '{}'), 3, 'with a fresh TOTP it passes');
select is((select count(*)::int from public.ledger where kind = 'profile_change'), 2, 'a ledger row per version');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*)::int from public.tool_asks), 1, 'a member reads the asks of the org');
select throws_ok($$ update public.tool_asks set status = 'always' $$, '42501', null, 'members cannot decide asks directly');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000009","role":"authenticated"}';
select is((select count(*)::int from public.tool_asks), 0, 'another org sees nothing');
reset role;
select * from finish();
rollback;
