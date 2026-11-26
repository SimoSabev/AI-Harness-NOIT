begin;
select plan(16);
-- D-647 (Simo 26.11.2026, „за ученето да е автоматично, а не ръчно“): Mandat applies a learned change by itself; a person
-- sees it on the rules screen and reverts it with one button through private.revert_trial. The revert is a new approved
-- version (origin learn_revert) and a profile_change row with who did it. Reverting a change that can weaken the verdict
-- (flaky, allow) only narrows and needs no TOTP; reverting a narrowing widens, so it needs a fresh TOTP.
insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000000001', 'owner@x.invalid'), ('10000000-0000-4000-8000-000000000003', 'approver@x.invalid');
insert into public.orgs (id, name) values ('00000000-0000-4000-8000-000000000001', 'demo');
insert into public.members (org_id, user_id, role) values ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner'), ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'approver');
insert into public.repos (id, org_id, provider, full_name, remote_url) values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'local', 'shop', 'file:///x');
insert into public.harness_profiles (id, org_id, repo_id, version, layers, sources, profile_hash) values
  ('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 1, '{"a":{"x":1,"tests":{"flaky":["a > b"]}},"c":[{"tool":"path:write:infra/**","decision":"deny"}]}', '{}', 'sha256:' || repeat('1', 64));
insert into public.profile_trials (id, org_id, repo_id, change_key, manifest, from_profile, source, status, decided_at) values
  ('50000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'flaky_test|a > b|bugfix', '{"change":{"rule":"flaky_test","layer":"a","detail":"a > b"}}', '40000000-0000-4000-8000-000000000001', 'rule:flaky_repeat', 'accepted', now()),
  ('50000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'protect_path|infra/**|bugfix', '{"change":{"rule":"protect_path","layer":"c","detail":"infra/**"}}', '40000000-0000-4000-8000-000000000001', 'rule:d4_repeat', 'accepted', now()),
  ('50000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'lint_hook||bugfix', '{"change":{"rule":"lint_hook","layer":"d","detail":""}}', '40000000-0000-4000-8000-000000000001', 'rule:lint_repeat', 'proposed', null);

set local role service_role;
select private.approve_profile('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', now());

select throws_ok($$ select private.revert_trial('50000000-0000-4000-8000-000000000001', '{"a":{"x":1,"tests":{}},"c":[{"tool":"path:write:infra/**","decision":"deny"}]}', 'sha256:' || repeat('2', 64), '10000000-0000-4000-8000-000000000003', null) $$, '42501', null, 'an approver lacks approve.rules');
select throws_ok($$ select private.revert_trial('50000000-0000-4000-8000-000000000003', '{"a":{"x":1,"tests":{"flaky":["a > b"]}},"c":[{"tool":"path:write:infra/**","decision":"deny"}]}', 'sha256:' || repeat('2', 64), '10000000-0000-4000-8000-000000000001', null) $$, '55000', null, 'only an applied change is reverted');
select throws_ok($$ select private.revert_trial('50000000-0000-4000-8000-000000000001', '{"a":{"x":1,"tests":{}},"c":[]}', 'sha256:' || repeat('2', 64), '10000000-0000-4000-8000-000000000001', null) $$, '22023', null, 'only the layer of the change may differ');
select throws_ok($$ select private.revert_trial('50000000-0000-4000-8000-000000000001', '{"a":{"x":1,"tests":{"flaky":["a > b"]}},"c":[{"tool":"path:write:infra/**","decision":"deny"}]}', 'sha256:' || repeat('2', 64), '10000000-0000-4000-8000-000000000001', null) $$, '22023', null, 'a revert that changes nothing is refused');
select throws_ok($$ select private.revert_trial('50000000-0000-4000-8000-000000000002', '{"a":{"x":1,"tests":{"flaky":["a > b"]}},"c":[]}', 'sha256:' || repeat('2', 64), '10000000-0000-4000-8000-000000000001', null) $$, '42501', null, 'reverting a narrowing widens: it needs a fresh TOTP');
select is((select count(*)::int from public.harness_profiles), 1, 'nothing changed yet');

-- the flaky test: one button, no TOTP (the revert only narrows)
select is(private.revert_trial('50000000-0000-4000-8000-000000000001', '{"a":{"x":1,"tests":{}},"c":[{"tool":"path:write:infra/**","decision":"deny"}]}', 'sha256:' || repeat('2', 64), '10000000-0000-4000-8000-000000000001', null), 2, 'reverted → version 2');
select is((select origin || '|' || status || '|' || parent_id::text || '|' || trial_id::text from public.harness_profiles where version = 2), 'learn_revert|approved|40000000-0000-4000-8000-000000000001|50000000-0000-4000-8000-000000000001', 'version 2 is approved, names the revert, its parent and trial');
select is((select status from public.harness_profiles where version = 1), 'superseded', 'version 1 is superseded');
select is((select h.version from public.repos r join public.harness_profiles h on h.id = r.profile_id), 2, 'the repo runs version 2');
select is((select status || '|' || decided_by::text from public.profile_trials where id = '50000000-0000-4000-8000-000000000001'), 'rolled_back|10000000-0000-4000-8000-000000000001', 'the trial is rolled back by the person');
select is((select payload ->> 'by' || '|' || (payload ->> 'source') from public.ledger where kind = 'profile_change' and payload ->> 'action' = 'learn_revert'), '10000000-0000-4000-8000-000000000001|rule:flaky_repeat', 'a profile_change row with who and the rule');
select throws_ok($$ select private.revert_trial('50000000-0000-4000-8000-000000000001', '{"a":{"x":2,"tests":{}},"c":[]}', 'sha256:' || repeat('3', 64), '10000000-0000-4000-8000-000000000001', null) $$, '55000', null, 'a reverted change is not reverted again');

-- the narrowing, with a fresh TOTP
select is(private.revert_trial('50000000-0000-4000-8000-000000000002', '{"a":{"x":1,"tests":{}},"c":[]}', 'sha256:' || repeat('3', 64), '10000000-0000-4000-8000-000000000001', now()), 3, 'a narrowing reverted with TOTP → version 3');
select is((select mfa_verified_at is not null from public.harness_profiles where version = 3), true, 'version 3 keeps when the TOTP was checked');
reset role;

set local role authenticated;
select throws_ok($$ select private.revert_trial('50000000-0000-4000-8000-000000000002', '{}', 'sha256:' || repeat('4', 64), '10000000-0000-4000-8000-000000000001', now()) $$, '42501', null, 'only the service calls it');
reset role;
select * from finish();
rollback;
