begin;
select plan(9);
-- v5 E9б (5.2, D-362): D5 hidden tests. The files live in a private table the service reads; members see only the
-- metadata (version, hash, count). A new version needs a TOTP from the last 2 minutes and is a ledger row.
insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000000001', 'owner@x.invalid'), ('10000000-0000-4000-8000-000000000009', 'other@x.invalid');
insert into public.orgs (id, name) values ('00000000-0000-4000-8000-000000000001', 'demo'), ('00000000-0000-4000-8000-000000000009', 'other');
insert into public.members (org_id, user_id, role) values ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner'), ('00000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000009', 'owner');
insert into public.repos (id, org_id, provider, full_name, remote_url) values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'local', 'shop', 'file:///x');

set local role service_role;
select throws_ok($$ select private.add_hidden_tests('20000000-0000-4000-8000-000000000001', '[{"path":"cart.spec.ts","data":"eA=="}]', 'sha256:' || repeat('1', 64), '10000000-0000-4000-8000-000000000001', now() - interval '3 minutes') $$, '42501', null, 'a stale TOTP is refused');
select throws_ok($$ select private.add_hidden_tests('20000000-0000-4000-8000-000000000001', '[{"path":"../x.spec.ts","data":"eA=="}]', 'sha256:' || repeat('1', 64), '10000000-0000-4000-8000-000000000001', now()) $$, '22023', null, 'a path outside the hidden directory is refused');
select is(private.add_hidden_tests('20000000-0000-4000-8000-000000000001', '[{"path":"cart.spec.ts","data":"eA=="}]', 'sha256:' || repeat('1', 64), '10000000-0000-4000-8000-000000000001', now()), 1, 'version 1');
select is(private.add_hidden_tests('20000000-0000-4000-8000-000000000001', '[{"path":"cart.spec.ts","data":"eQ=="},{"path":"more/b.spec.ts","data":"eg=="}]', 'sha256:' || repeat('2', 64), '10000000-0000-4000-8000-000000000001', now()), 2, 'version 2');
select is((select count(*)::int from public.ledger where kind = 'hidden_tests'), 2, 'a ledger row per version');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select files from public.hidden_test_sets where version = 2), 2, 'a member reads the metadata');
select throws_ok($$ select files from private.hidden_tests $$, '42501', null, 'the content is not readable by members');
select throws_ok($$ insert into public.hidden_test_sets (org_id, repo_id, version, hash, files) values ('00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 9, 'x', 1) $$, '42501', null, 'members cannot write sets');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000009","role":"authenticated"}';
select is((select count(*)::int from public.hidden_test_sets), 0, 'another org sees nothing');
reset role;
select * from finish();
rollback;
