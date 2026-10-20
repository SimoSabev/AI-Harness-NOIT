begin;
select plan(7);

insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000000001', 'owner@demo.invalid'), ('10000000-0000-4000-8000-000000000002', 'approver@demo.invalid');
insert into public.orgs (id, name) values ('00000000-0000-4000-8000-000000000001', 'demo');
insert into public.members (org_id, user_id, role) values ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner'), ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'approver');
insert into public.repos (id, org_id, provider, full_name, remote_url) values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'github', 'mandat-demo/shop', 'file:///x');
insert into public.harness_proposals (id, org_id, repo_id, status, policy_yaml) values
  ('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'proposed', 'version: 2'),
  ('40000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'proposed', 'version: 2');
update public.harness_proposals set blocked = '["AGENTS.md: 1 invisible character(s) (U+202E)"]' where id = '40000000-0000-4000-8000-000000000002';

set local role service_role;
select throws_ok($$ select private.approve_harness('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'version: 2', 'sha256:' || repeat('a', 64), '[]', '[]', now()) $$, '42501', null, 'approver (not owner) → refused');
select throws_ok($$ select private.approve_harness('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'version: 2', 'sha256:' || repeat('a', 64), '[]', '[]', now() - interval '3 minutes') $$, '42501', null, 'TOTP older than 2 min → refused');
select throws_ok($$ select private.approve_harness('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'version: 2', 'sha256:' || repeat('a', 64), '[]', '[]', now()) $$, '55000', null, 'invisible characters → blocked');
select is(private.approve_harness('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'version: 2', 'sha256:' || repeat('a', 64), '[{"name":"bugfix","risk_class":"low"}]', '[]', now()), 1, 'owner + fresh TOTP → version 1');
select throws_ok($$ select private.approve_harness('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'version: 2', 'sha256:' || repeat('a', 64), '[]', '[]', now()) $$, '55000', null, 'second approval → refused');
reset role;
select is((select count(*)::int from public.ledger where kind = 'config_change') + (select count(*)::int from public.outbox where kind = 'harness_pr'), 2, 'ledger config_change + outbox harness_pr');
select is((select config_hash || ':' || config_version::text from public.repos), 'sha256:' || repeat('a', 64) || ':1', 'repos.config_hash, version');

select * from finish();
rollback;
