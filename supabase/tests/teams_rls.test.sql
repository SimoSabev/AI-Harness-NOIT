-- E10 hosted (v5 т. 6.1, D-703): a team is an org; its members have the roles of E8в. A member of another team sees
-- NOTHING of this team — checked over every public table and view that has an org_id, not a hand-picked list.
begin;
select plan(16);

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
insert into public.repos (id, org_id, provider, full_name, remote_url) values
  ('a2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', 'local', 'team-a/shop', 'file:///a'),
  ('b2000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000b', 'local', 'team-b/shop', 'file:///b');
insert into public.task_types (org_id, repo_id, name, risk_class) values
  ('a0000000-0000-4000-8000-00000000000a', 'a2000000-0000-4000-8000-000000000001', 'bugfix', 'low'),
  ('b0000000-0000-4000-8000-00000000000b', 'b2000000-0000-4000-8000-000000000001', 'bugfix', 'low');
insert into public.tasks (id, org_id, repo_id, type, agent, text) values
  ('t_team_a', 'a0000000-0000-4000-8000-00000000000a', 'a2000000-0000-4000-8000-000000000001', 'bugfix', 'claude', 'a'),
  ('t_team_b', 'b0000000-0000-4000-8000-00000000000b', 'b2000000-0000-4000-8000-000000000001', 'bugfix', 'claude', 'b');
insert into public.verdicts (org_id, task_id, run_id, attempt, mode, agent, result, base_sha, verdict_hash) values
  ('a0000000-0000-4000-8000-00000000000a', 't_team_a', 'r_01JABCDEFGHJKMNPQRSTVWXYA0', 1, 'full', 'claude', 'VERIFIED', repeat('a', 40), 'sha256:a'),
  ('b0000000-0000-4000-8000-00000000000b', 't_team_b', 'r_01JABCDEFGHJKMNPQRSTVWXYB0', 1, 'full', 'claude', 'FAILED', repeat('b', 40), 'sha256:b');
insert into public.task_activities (org_id, task_id, kind, text) values
  ('a0000000-0000-4000-8000-00000000000a', 't_team_a', 'agent', 'a'), ('b0000000-0000-4000-8000-00000000000b', 't_team_b', 'agent', 'b');
insert into public.outbox (org_id, kind, idempotency_key) values
  ('a0000000-0000-4000-8000-00000000000a', 'baseline', 'team-a:1'), ('b0000000-0000-4000-8000-00000000000b', 'baseline', 'team-b:1');
select private.ledger_append('a0000000-0000-4000-8000-00000000000a', 'task_created', 't_team_a', '{"a":1}', private.sha256_text('{"a":1}'));
select private.ledger_append('b0000000-0000-4000-8000-00000000000b', 'task_created', 't_team_b', '{"b":1}', private.sha256_text('{"b":1}'));
insert into public.runners (id, org_id, name, kinds, secret_hash) values
  ('a3000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', 'runner-a', '{baseline}', private.sha256_text('mrs_a')),
  ('b3000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000b', 'runner-b', '{baseline}', private.sha256_text('mrs_b'));
insert into public.runner_registrations (org_id, name, token_hash, expires_at) values
  ('a0000000-0000-4000-8000-00000000000a', 'next-a', private.sha256_text('mrr_a'), now() + interval '1 hour'),
  ('b0000000-0000-4000-8000-00000000000b', 'next-b', private.sha256_text('mrr_b'), now() + interval '1 hour');

-- 1–2. no table or view with an org_id is outside RLS (a new table without RLS fails here, whatever its name)
select is(
  (select array_agg(c.relname::text order by c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not (c.relrowsecurity and c.relforcerowsecurity)
      and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'org_id' and not a.attisdropped)),
  null, 'every public table with org_id has RLS enabled and forced');
select is(
  (select array_agg(c.relname::text order by c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v' and has_table_privilege('authenticated', c.oid, 'select')
      and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e') -- pgTAP's own views
      and not coalesce((select o.option_value in ('true', 'on') from pg_options_to_table(c.reloptions) o where o.option_name = 'security_invoker'), false)),
  null, 'every public view a user can read is security_invoker');

-- which org_id tables/views show rows of p_org to the CURRENT role (no privilege = nothing seen)
create function public.e10_seen(p_org uuid) returns text[] language plpgsql security invoker set search_path = '' as $$
declare
  t text;
  n bigint;
  seen text[] := '{}';
begin
  for t in select c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
            where s.nspname = 'public' and c.relkind in ('r', 'v')
              and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'org_id' and not a.attisdropped)
            order by c.relname
  loop
    begin
      execute format('select count(*) from public.%I where org_id = $1', t) into n using p_org;
      if n > 0 then seen := seen || t; end if;
    exception when insufficient_privilege then null;
    end;
  end loop;
  return seen;
end $$;
grant execute on function public.e10_seen(uuid) to authenticated;
select ok(cardinality(public.e10_seen('a0000000-0000-4000-8000-00000000000a')) >= 8, 'positive control: the owner role sees team A in many tables');

set local role authenticated;
-- 4–7. Cveta (owner of team B) sees nothing of team A, in any table or view, and sees her own team
set local request.jwt.claims = '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(public.e10_seen('a0000000-0000-4000-8000-00000000000a'), '{}'::text[], 'another team: no table or view shows team A');
select is((select count(*)::int from public.orgs where id = 'a0000000-0000-4000-8000-00000000000a'), 0, 'another team: team A is not even an org it sees');
select is((select count(*)::int from public.members where user_id::text like 'a1000000%'), 0, 'another team: no member of team A');
select ok('tasks' = any (public.e10_seen('b0000000-0000-4000-8000-00000000000b')) and 'runners' = any (public.e10_seen('b0000000-0000-4000-8000-00000000000b')), 'another team: sees its own tasks and runners');

-- 8–10. Vera (viewer of A) reads A, but no internals; Boris (worker) reads A
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is(array(select unnest(public.e10_seen('a0000000-0000-4000-8000-00000000000a')) intersect select unnest('{tasks,verdicts,ledger,task_activities,runners}'::text[]) order by 1), '{ledger,runners,tasks,verdicts}'::text[], 'viewer: the team''s tasks, verdicts, ledger, runners (the activity log is approver+, migration 20261020000005)');
select ok(not ('outbox' = any (public.e10_seen('a0000000-0000-4000-8000-00000000000a'))) and not ('runner_registrations' = any (public.e10_seen('a0000000-0000-4000-8000-00000000000a'))), 'viewer: no outbox, no registration tokens');
select is(public.e10_seen('b0000000-0000-4000-8000-00000000000b'), '{}'::text[], 'viewer of A: nothing of team B');
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(public.e10_seen('b0000000-0000-4000-8000-00000000000b'), '{}'::text[], 'worker of A: nothing of team B');

-- 12–14. the secret's hash never reaches a user; registrations only with settings.manage
select throws_ok($$ select secret_hash from public.runners $$, '42501', null, 'worker: the runner secret hash is not readable');
select is((select count(*)::int from public.runner_registrations), 0, 'worker (no settings.manage): no registration tokens');
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}';
select results_eq($$ select name from public.runner_registrations $$, $$ values ('next-a') $$, 'owner: only the own team''s registrations');
select throws_ok($$ select token_hash from public.runner_registrations $$, '42501', null, 'owner: the token hash is not readable either');
reset role;

-- 16. anon: nothing
set local role anon;
select throws_ok($$ select * from public.runners $$, '42501', null, 'anon: runners');
reset role;

select * from finish();
rollback;
