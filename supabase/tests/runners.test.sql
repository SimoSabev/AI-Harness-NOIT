-- E10 hosted (v5 т. 6.1, D-701/D-702): runner registration by role, the one-time token, revocation, and the outbox
-- through a runner: only its team's rows, only its kinds, one holder per row, a lost lease cannot finish.
begin;
select plan(22);

insert into auth.users (id, email) values
  ('a1000000-0000-4000-8000-000000000001', 'ana@team-a.invalid'),
  ('a1000000-0000-4000-8000-000000000002', 'boris@team-a.invalid'),
  ('a1000000-0000-4000-8000-000000000003', 'vera@team-a.invalid'),
  ('b1000000-0000-4000-8000-000000000001', 'cveta@team-b.invalid');
insert into public.orgs (id, name) values ('a0000000-0000-4000-8000-00000000000a', 'team-a'), ('b0000000-0000-4000-8000-00000000000b', 'team-b');
insert into public.members (org_id, user_id, role, role_id) values
  ('a0000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-000000000001', 'viewer', 'builtin:owner'),
  ('a0000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-000000000002', 'viewer', 'builtin:worker'),
  ('a0000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-000000000003', 'viewer', 'builtin:viewer'),
  ('b0000000-0000-4000-8000-00000000000b', 'b1000000-0000-4000-8000-000000000001', 'viewer', 'builtin:owner');
create temp table tok (who text primary key, token text);
create temp table reg (runner_id uuid, org_id uuid);
create temp table reg_b (runner_id uuid, org_id uuid);
create temp table c1 (id bigint, kind text, idempotency_key text, payload jsonb, attempts int, lease_until timestamptz);
grant all on tok, reg, reg_b, c1 to authenticated, service_role;

-- 1–5. who may make a registration token
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok($$ insert into tok values ('ana', public.runner_registration_create('a0000000-0000-4000-8000-00000000000a', 'vps-1', 30)) $$, 'owner of A: makes a registration token');
select ok((select token ~ '^mrr_[0-9a-f]{64}$' from tok where who = 'ana'), 'the token is mrr_ + 64 hex, shown once');
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok($$ select public.runner_registration_create('a0000000-0000-4000-8000-00000000000a', 'x', 30) $$, '42501', null, 'worker of A (no settings.manage): refused');
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok($$ select public.runner_registration_create('a0000000-0000-4000-8000-00000000000a', 'x', 30) $$, '42501', null, 'viewer of A: refused');
set local request.jwt.claims = '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok($$ select public.runner_registration_create('a0000000-0000-4000-8000-00000000000a', 'x', 30) $$, '42501', null, 'owner of B on team A: refused');
insert into tok values ('cveta', public.runner_registration_create('b0000000-0000-4000-8000-00000000000b', 'vps-b', 30));
reset role;

-- 6–9. the hosted worker (service role) trades the token once; only hashes are stored; a ledger row records it
set local role service_role;
insert into reg select * from private.runner_register(private.sha256_text((select token from tok where who = 'ana')), '{baseline,mcp_vet}', private.sha256_text('mrs_' || repeat('1', 64)));
select is((select org_id from reg), 'a0000000-0000-4000-8000-00000000000a'::uuid, 'register: the runner belongs to the token''s team');
select throws_ok($$ select * from private.runner_register(private.sha256_text((select token from tok where who = 'ana')), '{}', private.sha256_text('mrs_x')) $$, '28000', null, 'the token works once');
select throws_ok($$ select * from private.runner_register(private.sha256_text('mrr_' || repeat('0', 64)), '{}', private.sha256_text('mrs_x')) $$, '28000', null, 'an unknown token is refused');
insert into reg_b select * from private.runner_register(private.sha256_text((select token from tok where who = 'cveta')), '{baseline}', private.sha256_text('mrs_' || repeat('2', 64)));
reset role;
select is((select payload ->> 'action' from public.ledger where org_id = 'a0000000-0000-4000-8000-00000000000a' and kind = 'runner_change'), 'registered', 'ledger: runner_change registered (the chain of team A)');

-- 10–12. token auth: right secret, wrong secret, the JWT-time check without a secret
set local role service_role;
select is((select org_id from private.runner_seen((select runner_id from reg), private.sha256_text('mrs_' || repeat('1', 64)))), 'a0000000-0000-4000-8000-00000000000a'::uuid, 'seen with its secret');
select is((select count(*)::int from private.runner_seen((select runner_id from reg), private.sha256_text('mrs_' || repeat('9', 64)))), 0, 'a wrong secret: nothing');
select is((select kinds from private.runner_seen((select runner_id from reg))), '{baseline,mcp_vet}'::text[], 'seen by id (JWT already checked): its kinds');

-- 13–19. the outbox through the runner
insert into public.outbox (org_id, kind, idempotency_key) values
  ('a0000000-0000-4000-8000-00000000000a', 'baseline', 'a:base:1'),
  ('a0000000-0000-4000-8000-00000000000a', 'merge', 'a:merge:1'),
  ('b0000000-0000-4000-8000-00000000000b', 'baseline', 'b:base:1');
insert into c1 select * from private.runner_outbox_claim((select runner_id from reg), 10, 60);
select results_eq($$ select idempotency_key from c1 $$, $$ values ('a:base:1') $$, 'claim: only its team''s rows of its kinds (no merge, nothing of team B)');
select is((select count(*)::int from private.runner_outbox_claim((select runner_id from reg_b), 10, 60) where idempotency_key like 'a:%'), 0, 'team B''s runner never gets team A''s rows');
select is((select count(*)::int from private.runner_outbox_claim((select runner_id from reg), 10, 60)), 0, 'a leased row is not claimed twice');
select is(private.runner_outbox_finish((select runner_id from reg_b), (select id from c1), true), false, 'another runner cannot finish it');
select is(private.runner_outbox_finish((select runner_id from reg), (select id from c1), false, 'docker down'), true, 'the holder reports a failure');
select is((select status || ':' || attempts || ':' || coalesce(lease_owner::text, '-') from public.outbox where idempotency_key = 'a:base:1'), 'pending:1:-', 'a failure returns the row to pending, attempts + 1, lease cleared');
update public.outbox set lease_owner = (select runner_id from reg), lease_until = now() - interval '1 second' where idempotency_key = 'a:base:1';
select is(private.runner_outbox_finish((select runner_id from reg), (select id from c1), true), false, 'a lost (expired) lease cannot finish');
reset role;

-- 20–22. revocation: only settings.manage; a revoked runner gets nothing; recorded in the ledger
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok($$ select public.runner_revoke((select runner_id from reg)) $$, '42501', null, 'worker: cannot revoke');
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}';
select public.runner_revoke((select runner_id from reg));
reset role;
set local role service_role;
select is((select count(*)::int from private.runner_seen((select runner_id from reg))) + (select count(*)::int from private.runner_outbox_claim((select runner_id from reg), 10, 60)), 0, 'revoked: not seen, claims nothing');
reset role;
select is((select array_agg(payload ->> 'action' order by seq) from public.ledger where org_id = 'a0000000-0000-4000-8000-00000000000a' and kind = 'runner_change'), '{registered,revoked}'::text[], 'ledger: registered, then revoked');

select * from finish();
rollback;
