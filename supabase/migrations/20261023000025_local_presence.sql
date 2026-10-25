-- D-368: `pnpm local` has no login; an approval there is a click by whoever sits at the computer, recorded honestly as
-- method 'local' (never as a TOTP that did not happen). Like 'totp', it carries a fresh mfa_verified_at (≤ 2 min).
-- Only the server (service role) writes approvals, so 'local' is the server's word, exactly as 'totp' is.
alter table public.approvals drop constraint if exists approvals_method_check;
alter table public.approvals add constraint approvals_method_check check (method in ('tap', 'totp', 'local'));

create or replace function private.approvals_method_check() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  needs boolean;
begin
  select c.requires_second_factor into needs from public.changesets c where c.id = new.changeset_id;
  if needs and new.method not in ('totp', 'local') then
    raise exception 'approval needs a second factor' using errcode = '42501';
  end if;
  if new.method in ('totp', 'local') then
    if new.mfa_verified_at is null or new.decided_at - new.mfa_verified_at > interval '2 minutes' or new.mfa_verified_at > new.decided_at then
      raise exception 'TOTP verification is missing or older than 2 minutes' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
