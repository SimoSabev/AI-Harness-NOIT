begin;
select plan(7);
-- E7в / D-313: sealed API keys live in private.api_keys; only the service role writes and reads them.
insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000000001', 'owner@demo.invalid');
insert into public.orgs (id, name) values ('00000000-0000-4000-8000-000000000001', 'demo');
insert into public.members (org_id, user_id, role) values ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner');

set local role service_role;
select lives_ok($$ select private.store_api_key('00000000-0000-4000-8000-000000000001', 'anthropic', '\x0102'::bytea, '\x000102030405060708090a0b'::bytea, 'k1') $$, 'the service role stores a sealed key');
select lives_ok($$ select private.store_api_key('00000000-0000-4000-8000-000000000001', 'anthropic', '\x0304'::bytea, '\x0c0102030405060708090a0b'::bytea, 'k1') $$, 'storing again replaces it');
select is((select count(*)::int from private.api_keys), 1, 'one row per org and provider');
select is((select count(*)::int from public.outbox where kind = 'proxy_restart'), 2, 'each store asks the worker to restart the proxy');
select throws_ok($$ select private.store_api_key('00000000-0000-4000-8000-000000000001', 'evil', '\x01'::bytea, '\x000102030405060708090a0b'::bytea, 'k1') $$, '23514', null, 'unknown provider refused');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok($$ select count(*) from private.api_keys $$, '42501', null, 'even an owner cannot read the sealed keys');
reset role;
set local role anon;
select throws_ok($$ select private.store_api_key('00000000-0000-4000-8000-000000000001', 'anthropic', '\x01'::bytea, '\x000102030405060708090a0b'::bytea, 'k1') $$, '42501', null, 'anon cannot store');
reset role;
select * from finish();
rollback;
