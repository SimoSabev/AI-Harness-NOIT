begin;
select plan(11);
-- D-392: memory. A user-scope memory is seen by its person only; a project memory by the org's members; another org sees
-- nothing; only the server writes; an invalid memory carries its time; no invisible characters; the shelf matches the scope.
insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000000002', 'approver@x.invalid'), ('10000000-0000-4000-8000-000000000003', 'viewer@x.invalid'), ('10000000-0000-4000-8000-000000000009', 'other@x.invalid');
insert into public.orgs (id, name) values ('00000000-0000-4000-8000-000000000001', 'demo'), ('00000000-0000-4000-8000-000000000009', 'other');
insert into public.members (org_id, user_id, role) values ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'approver'), ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'viewer'), ('00000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000009', 'owner');
insert into public.repos (id, org_id, provider, full_name, remote_url) values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'local', 's', 'file:///x');

set local role service_role;
insert into public.memory_items (id, org_id, user_id, scope, kind, text, status, source) values
  ('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'user', 'preference', 'Отговаряй на български', 'active', 'human');
insert into public.memory_items (id, org_id, repo_id, scope, kind, text, status, source) values
  ('40000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'project', 'command', 'Тестовете: pnpm vitest', 'active', 'human');
insert into public.memory_events (org_id, item_id, action, actor) values ('00000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'created', 'human:10000000-0000-4000-8000-000000000002');
select throws_ok($$ insert into public.memory_items (org_id, scope, kind, text, status, source) values ('00000000-0000-4000-8000-000000000001', 'user', 'fact', 'без човек', 'active', 'human') $$, '23514', null, 'a user memory needs its person');
select throws_ok($$ insert into public.memory_items (org_id, scope, kind, text, status, source) values ('00000000-0000-4000-8000-000000000001', 'project', 'fact', 'без проект', 'active', 'human') $$, '23514', null, 'a project memory needs its project');
select throws_ok($$ update public.memory_items set status = 'invalid' where id = '40000000-0000-4000-8000-000000000002' $$, '23514', null, 'invalid needs invalid_at');
select throws_ok($$ insert into public.memory_items (org_id, repo_id, scope, kind, text, status, source) values ('00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'project', 'fact', 'скрит​текст', 'active', 'human') $$, '23514', null, 'no invisible characters');
select throws_ok($$ insert into public.memory_events (org_id, item_id, action, actor) values ('00000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'created', 'someone') $$, '23514', null, 'the actor is named');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::int from public.memory_items), 2, 'the person: their own memory and the project''s');
select is((select count(*)::int from public.memory_events), 1, 'the person: the history of their memory');
select throws_ok($$ insert into public.memory_items (org_id, user_id, scope, kind, text, status, source) values ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'user', 'fact', 'сам пиша', 'active', 'human') $$, '42501', null, 'members cannot write directly');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select array_agg(text)::text from public.memory_items), '{"Тестовете: pnpm vitest"}', 'another member: only the project memory');
select is((select count(*)::int from public.memory_events), 0, 'another member: not the history of someone else''s memory');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000009","role":"authenticated"}';
select is((select count(*)::int from public.memory_items), 0, 'another org sees nothing');
select * from finish();
rollback;
