begin;
select plan(11);
-- E8б (v5 т. 4.2, D-351): profile versions; approval = approve.rules + TOTP ≤ 2 min in one transaction; rollback = a new version.
insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000000001', 'owner@x.invalid'), ('10000000-0000-4000-8000-000000000003', 'approver@x.invalid');
insert into public.orgs (id, name) values ('00000000-0000-4000-8000-000000000001', 'demo');
insert into public.members (org_id, user_id, role) values ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner'), ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'approver');
insert into public.repos (id, org_id, provider, full_name, remote_url) values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'local', 'shop', 'file:///x');
insert into public.harness_profiles (id, org_id, repo_id, version, layers, sources, profile_hash) values
  ('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 1, '{"b":{"summary":"v1"}}', '{}', 'sha256:' || repeat('1', 64)),
  ('40000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 2, '{"b":{"summary":"v2"}}', '{}', 'sha256:' || repeat('2', 64)),
  ('40000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 3, '{"b":{"summary":"bad ​"}}', '{}', 'sha256:' || repeat('3', 64));

set local role service_role;
select throws_ok($$ select private.approve_profile('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', now()) $$, '42501', null, 'an approver lacks approve.rules');
select throws_ok($$ select private.approve_profile('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', now() - interval '3 minutes') $$, '42501', null, 'TOTP older than 2 minutes');
select throws_ok($$ select private.approve_profile('40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', now()) $$, '55000', null, 'invisible characters block the approval');
select is(private.approve_profile('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', now()), 1, 'owner + fresh TOTP approves version 1');
select is((select profile_id from public.repos where id = '20000000-0000-4000-8000-000000000001'), '40000000-0000-4000-8000-000000000001'::uuid, 'the repo points at it');
select is(private.approve_profile('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', now()), 2, 'version 2 approved');
select is((select status from public.harness_profiles where version = 1), 'superseded', 'the previous one is superseded');
select is((select count(*)::int from public.ledger where kind = 'profile_change'), 2, 'a ledger row per approval');
select is(private.rollback_profile('20000000-0000-4000-8000-000000000001', 1, '10000000-0000-4000-8000-000000000001', now()), 4, 'rollback to v1 = a new approved version 4 with v1 layers');
select is((select layers -> 'b' ->> 'summary' from public.harness_profiles where version = 4), 'v1', 'v4 has the layers of v1');
select throws_ok($$ update public.harness_profiles set layers = '{}' where version = 4 $$, '42501', null, 'an approved version is never updated in place');
reset role;
select * from finish();
rollback;
