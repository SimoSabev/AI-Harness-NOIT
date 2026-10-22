-- E8g (v5 p. 4.4): a HELD task waits at most MANDAT_HELD_DAYS (default 7) for a person; then the sweeper closes it.
alter table public.tasks add column if not exists held_until timestamptz;

create or replace function private.tasks_held_until() returns trigger language plpgsql as $$
begin
  if new.state = 'HELD' and (tg_op = 'INSERT' or old.state is distinct from 'HELD') then
    new.held_until := coalesce(new.held_until, now() + interval '7 days');
  elsif new.state <> 'HELD' then
    new.held_until := null;
  end if;
  return new;
end $$;

drop trigger if exists tasks_held_until on public.tasks;
create trigger tasks_held_until before insert or update of state on public.tasks for each row execute function private.tasks_held_until();
create index if not exists tasks_held_until on public.tasks (held_until) where state = 'HELD';
