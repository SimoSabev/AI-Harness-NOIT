begin;
select plan(22);
-- E9д (spec 5.5, PRD AC-11.4, D-643): no field of the harness profile changes without a config_change ledger row with an
-- approval. An approved (or superseded) version is never updated in place; a learned proposal becomes a new version only
-- through private.decide_trial (approve.rules + fresh TOTP), which writes the config_change row.
insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000000001', 'owner@x.invalid'), ('10000000-0000-4000-8000-000000000003', 'approver@x.invalid');
insert into public.orgs (id, name) values ('00000000-0000-4000-8000-000000000001', 'demo');
insert into public.members (org_id, user_id, role) values ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner'), ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'approver');
insert into public.repos (id, org_id, provider, full_name, remote_url) values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'local', 'shop', 'file:///x');
insert into public.harness_profiles (id, org_id, repo_id, version, layers, sources, profile_hash) values
  ('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 1, '{"a":{"x":1},"c":[]}', '{}', 'sha256:' || repeat('1', 64));
insert into public.profile_trials (id, org_id, repo_id, change_key, manifest, from_profile, source, needs_person) values
  ('50000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'tool_allow|bash:ls|feature', '{"change":{"rule":"tool_allow","layer":"c","detail":"bash:ls"}}', '40000000-0000-4000-8000-000000000001', 'rule:ask_repeat', true),
  ('50000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'flaky_test|a > b|bugfix', '{"change":{"rule":"flaky_test","layer":"a","detail":"a > b"}}', '40000000-0000-4000-8000-000000000001', 'rule:flaky_repeat', true);

set local role service_role;
select private.approve_profile('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', now());

-- AC-11.4: every field of an approved version is frozen; the only move is approved → superseded
select throws_ok($$ update public.harness_profiles set layers = '{}' where version = 1 $$, '42501', null, 'layers of an approved version');
select throws_ok($$ update public.harness_profiles set sources = '{"a":"human"}' where version = 1 $$, '42501', null, 'sources of an approved version');
select throws_ok($$ update public.harness_profiles set origin = 'person' where version = 1 $$, '42501', null, 'origin of an approved version');
select throws_ok($$ update public.harness_profiles set approved_by = '10000000-0000-4000-8000-000000000003' where version = 1 $$, '42501', null, 'the approver of an approved version');
select throws_ok($$ update public.harness_profiles set status = 'proposed' where version = 1 $$, '42501', null, 'approved → proposed');
select throws_ok($$ update public.profile_trials set manifest = '{}' where id = '50000000-0000-4000-8000-000000000001' $$, '42501', null, 'a proposal''s manifest is frozen');
select throws_ok($$ update public.profile_trials set needs_person = false where id = '50000000-0000-4000-8000-000000000001' $$, '42501', null, 'a proposal never stops needing a person');
select throws_ok($$ insert into public.profile_trials (org_id, repo_id, change_key, manifest, from_profile, source) values ('00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'k', '{}', '40000000-0000-4000-8000-000000000001', 'rule:Bad') $$, '23514', null, 'a source is rule:<name>');

-- a learned proposal: an approver lacks approve.rules; a stale TOTP; a change outside the proposal's layer
select throws_ok($$ select private.decide_trial('50000000-0000-4000-8000-000000000001', true, '{"a":{"x":1},"c":[{"tool":"bash:ls","decision":"allow"}]}', 'sha256:' || repeat('2', 64), '10000000-0000-4000-8000-000000000003', now()) $$, '42501', null, 'an approver lacks approve.rules');
select throws_ok($$ select private.decide_trial('50000000-0000-4000-8000-000000000001', true, '{"a":{"x":1},"c":[{"tool":"bash:ls","decision":"allow"}]}', 'sha256:' || repeat('2', 64), '10000000-0000-4000-8000-000000000001', now() - interval '3 minutes') $$, '42501', null, 'TOTP older than 2 minutes');
select throws_ok($$ select private.decide_trial('50000000-0000-4000-8000-000000000001', true, '{"a":{"x":2},"c":[{"tool":"bash:ls","decision":"allow"}]}', 'sha256:' || repeat('2', 64), '10000000-0000-4000-8000-000000000001', now()) $$, '22023', null, 'only the layer of the change may differ');
select is((select count(*)::int from public.harness_profiles), 1, 'nothing applied without the approval');

-- approved: a new version (origin learn, its parent and trial), the old one superseded, a config_change row
select is(private.decide_trial('50000000-0000-4000-8000-000000000001', true, '{"a":{"x":1},"c":[{"tool":"bash:ls","decision":"allow"}]}', 'sha256:' || repeat('2', 64), '10000000-0000-4000-8000-000000000001', now()), 2, 'approved → version 2');
select is((select origin || '|' || parent_id::text || '|' || trial_id::text from public.harness_profiles where version = 2), 'learn|40000000-0000-4000-8000-000000000001|50000000-0000-4000-8000-000000000001', 'version 2 names its origin, parent and trial');
select is((select status from public.harness_profiles where version = 1), 'superseded', 'version 1 is superseded');
select is((select status || '|' || decided_by::text from public.profile_trials where id = '50000000-0000-4000-8000-000000000001'), 'accepted|10000000-0000-4000-8000-000000000001', 'the proposal is accepted by the person');
select is((select payload ->> 'source' from public.ledger where kind = 'config_change' and payload ->> 'action' = 'learn_approve'), 'rule:ask_repeat', 'a config_change row with the rule');
select throws_ok($$ select private.decide_trial('50000000-0000-4000-8000-000000000001', true, '{}', 'sha256:' || repeat('3', 64), '10000000-0000-4000-8000-000000000001', now()) $$, '55000', null, 'a decided proposal is not decided again');
select throws_ok($$ update public.harness_profiles set status = 'approved' where version = 1 $$, '42501', null, 'superseded never comes back');

-- refused: no new version, still a config_change row
select is(private.decide_trial('50000000-0000-4000-8000-000000000002', false, null, null, '10000000-0000-4000-8000-000000000001', null), 0, 'a refusal needs no TOTP and makes no version');
select is((select count(*)::int from public.ledger where kind = 'config_change'), 2, 'each decision is a config_change row');

-- a card (model regression) is read by members, written by the service; its content is frozen
insert into public.learn_cards (org_id, card_key, card) values ('00000000-0000-4000-8000-000000000001', 'model_regression|claude:x|2026-11-16', '{"kind":"model_regression"}');
select throws_ok($$ update public.learn_cards set card = '{}' $$, '42501', null, 'a card is never rewritten');
reset role;
select * from finish();
rollback;
