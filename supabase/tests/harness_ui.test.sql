begin;
select plan(12);

-- board_column (Ф4): FAILED always column 5; GATED with/without a human
select is(public.board_column('CREATED', null, null, false, false), 1, 'CREATED → Нови');
select is(public.board_column('RETRY', null, null, false, false), 2, 'RETRY → Работи');
select is(public.board_column('GATED', 'VERIFIED', null, false, false), 3, 'GATED без човек → Проверява');
select is(public.board_column('GATED', 'VERIFIED', null, true, false), 4, 'GATED с одобрение → Чака теб');
select is(public.board_column('DELIVERED', 'FAILED', null, false, false), 5, 'FAILED → винаги Блокирано / Провал');
select is(public.board_column('OUTCOME', 'VERIFIED', null, false, true), 7, 'OUTCOME решен → Резултат');

insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000000002', 'approver@demo.invalid'), ('10000000-0000-4000-8000-000000000009', 'x@other.invalid');
insert into public.orgs (id, name) values ('00000000-0000-4000-8000-000000000001', 'demo'), ('00000000-0000-4000-8000-000000000002', 'other');
insert into public.members (org_id, user_id, role) values ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'approver'), ('00000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000009', 'owner');
insert into public.repos (id, org_id, provider, full_name, remote_url) values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'local', 's', 'file:///x');
insert into public.tasks (id, org_id, repo_id, type, agent, text) values ('t_demo', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'bugfix', 'claude', 'x');
insert into public.changesets (id, org_id, task_id, base_sha, head_sha) values ('30000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 't_demo', repeat('a', 40), repeat('c', 40));

-- approve-cas: the second approval of the same changeset is refused (partial unique index)
set local role service_role;
select lives_ok($$ select private.approve_changeset('30000000-0000-4000-8000-000000000002', repeat('c', 40), '10000000-0000-4000-8000-000000000002', 'approved', null, 'web', 'tap', null) $$, 'first approval');
select throws_ok($$ select private.approve_changeset('30000000-0000-4000-8000-000000000002', repeat('c', 40), '10000000-0000-4000-8000-000000000002', 'approved', null, 'web', 'tap', null) $$, '23505', null, 'second approval → unique violation, nothing written');
reset role;
select is((select count(*)::int from public.ledger where kind = 'approval'), 1, 'one ledger row');

-- Realtime topics (S22)
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}';
select ok(private.topic_allowed('org:00000000-0000-4000-8000-000000000001:board') and private.topic_allowed('task:t_demo'), 'member: own org board + task topic');
select ok(not private.topic_allowed('org:00000000-0000-4000-8000-000000000002:board') and not private.topic_allowed('evil') and not private.topic_allowed('org:not-a-uuid:board'), 'foreign org / garbage → no');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000009","role":"authenticated"}';
select ok(not private.topic_allowed('task:t_demo'), 'member of another org does not get task:t_demo');
reset role;

select * from finish();
rollback;
