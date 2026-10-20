begin;
select plan(12);

insert into public.orgs (id, name) values ('00000000-0000-4000-8000-000000000001', 'o1'), ('00000000-0000-4000-8000-000000000002', 'o2');

-- the worker path: service role calls private.ledger_append
set local role service_role;
select lives_ok($$ select private.ledger_append('00000000-0000-4000-8000-000000000001', 'task_created', 't_a', '{"a":1}', 'sha256:' || encode(extensions.digest('{"a":1}', 'sha256'), 'hex')) $$, 'service_role appends');
select lives_ok($$ select private.ledger_append('00000000-0000-4000-8000-000000000001', 'verdict', 't_a', null, null) $$, 'null payload');
select lives_ok($$ select private.ledger_append('00000000-0000-4000-8000-000000000002', 'verdict', null, '{}', 'sha256:' || encode(extensions.digest('{}', 'sha256'), 'hex')) $$, 'second org');
select throws_ok($$ select private.ledger_append('00000000-0000-4000-8000-000000000001', 'verdict', 't_a', '{"a":1}', 'sha256:' || repeat('0', 64)) $$, '22023', 'ledger_append: payload hash mismatch', 'wrong hash → exception');
select throws_ok($$ insert into public.ledger (org_id, seq, ts, kind, hash) values ('00000000-0000-4000-8000-000000000001', 99, 'x', 'verdict', 'x') $$, '42501', null, 'no direct insert');
reset role;

select results_eq($$ select seq from public.ledger where org_id = '00000000-0000-4000-8000-000000000001' order by seq $$, $$ values (1::bigint), (2::bigint) $$, 'seq per org, no gaps');
select is((select prev_hash from public.ledger where org_id = '00000000-0000-4000-8000-000000000001' and seq = 2),
          (select hash from public.ledger where org_id = '00000000-0000-4000-8000-000000000001' and seq = 1), 'prev_hash chains');
select is((select hash from public.ledger where org_id = '00000000-0000-4000-8000-000000000001' and seq = 1),
          (select 'sha256:' || encode(extensions.digest(private.ledger_body_jcs(org_id, seq, ts, kind, task_id, payload_hash, prev_hash), 'sha256'), 'hex') from public.ledger where org_id = '00000000-0000-4000-8000-000000000001' and seq = 1),
          'hash = sha256(JCS(body)) (E0 formula)');

-- append-only, even for the table owner
select throws_ok($$ update public.ledger set kind = 'x' where seq = 1 $$, '42501', 'ledger is append-only', 'UPDATE refused');
select throws_ok($$ delete from public.ledger where seq = 1 $$, '42501', 'ledger is append-only', 'DELETE refused');

set local role anon;
select throws_ok($$ select private.ledger_append('00000000-0000-4000-8000-000000000001', 'verdict', null, null, null) $$, '42501', null, 'anon → permission denied');
reset role;
set local role authenticated;
select throws_ok($$ select private.ledger_append('00000000-0000-4000-8000-000000000001', 'verdict', null, null, null) $$, '42501', null, 'authenticated → permission denied');
reset role;

select * from finish();
rollback;
