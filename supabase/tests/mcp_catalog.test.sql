begin;
select plan(10);
-- E8e (v5 p. 4.5, AC-5.1/5.7, D-354): the MCP catalog (exact versions, vetting state, per-tool definition hashes) and the
-- skills catalog (content hash, approved / blocked); a profile version may change exactly one named layer.
insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000000001', 'owner@x.invalid'), ('10000000-0000-4000-8000-000000000009', 'other@x.invalid');
insert into public.orgs (id, name) values ('00000000-0000-4000-8000-000000000001', 'demo'), ('00000000-0000-4000-8000-000000000009', 'other');
insert into public.members (org_id, user_id, role) values ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner'), ('00000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000009', 'owner');
insert into public.repos (id, org_id, provider, full_name, remote_url) values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'local', 'shop', 'file:///x');

select throws_ok($$ insert into public.mcp_servers (org_id, name, transport, source, package, version) values ('00000000-0000-4000-8000-000000000001', 'bad', 'stdio', 'registry', '@x/y@latest', 'latest') $$, '23514', null, 'never @latest');
insert into public.mcp_servers (id, org_id, name, transport, source, package, version, secrets) values ('50000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'issues', 'stdio', 'registry', '@example/issues-mcp@1.3.0', '1.3.0', '{ISSUES_TOKEN}');
select is((select vet_status from public.mcp_servers where name = 'issues'), 'pending', 'a new server waits for vetting');
insert into public.mcp_tool_defs (server_id, org_id, name, description_hash, schema_hash) values ('50000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'create_issue', 'sha256:' || repeat('a', 64), 'sha256:' || repeat('b', 64));
select throws_ok($$ update public.mcp_servers set tools_hash = 'not a hash' $$, '23514', null, 'tools_hash is a sha256');
insert into public.skills (org_id, name, source, content_hash) values ('00000000-0000-4000-8000-000000000001', 'test-first', 'builtin', 'sha256:' || repeat('c', 64));
select is((select approved from public.skills where name = 'test-first'), false, 'a skill is not approved by default');

insert into public.harness_profiles (id, org_id, repo_id, version, layers, sources, profile_hash, status, approved_at) values
  ('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 1, '{"c":[],"e":{"mcp":[],"skills":[],"plugins":[]}}', '{}', 'sha256:' || repeat('1', 64), 'approved', now());
update public.repos set profile_id = '40000000-0000-4000-8000-000000000001' where id = '20000000-0000-4000-8000-000000000001';
set local role service_role;
select throws_ok($$ select private.profile_layer_version('20000000-0000-4000-8000-000000000001', 'e', '{"c":[{"subject":"any","tool":"net:x.io","decision":"allow","reason":""}],"e":{"mcp":[{"name":"issues"}],"skills":[],"plugins":[]}}', 'sha256:' || repeat('2', 64), '10000000-0000-4000-8000-000000000001', null, '{}') $$, '22023', null, 'only the named layer may change');
select is(private.profile_layer_version('20000000-0000-4000-8000-000000000001', 'e', '{"c":[],"e":{"mcp":[{"name":"issues"}],"skills":[],"plugins":[]}}', 'sha256:' || repeat('2', 64), '10000000-0000-4000-8000-000000000001', null, '{"mcp":"issues"}'), 2, 'layer E: a new approved version');
select is((select layers -> 'e' -> 'mcp' -> 0 ->> 'name' from public.harness_profiles where version = 2), 'issues', 'the new version has the server');
select is((select count(*)::int from public.ledger where kind = 'profile_change'), 1, 'one ledger row');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*)::int from public.mcp_tool_defs), 1, 'a member reads the tool definitions');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000009","role":"authenticated"}';
select is((select count(*)::int from public.mcp_tool_defs), 0, 'another org sees nothing');
reset role;
select * from finish();
rollback;
