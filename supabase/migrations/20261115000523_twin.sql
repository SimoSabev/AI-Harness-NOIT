-- D-523 „Двойникът на собственика“ (approved by Simo 15.11.2026). The twin's shadow predictions (one per task attempt
-- waiting on an approval, scored against the owner's real decision) and its rules (an offer approved once, or declined:
-- a rule revoked at once is never offered again). Only the server (service_role) writes; the org's members read.
create table if not exists public.twin_predictions (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.orgs (id) on delete cascade,
  task_id text not null references public.tasks (id) on delete cascade,
  attempt int not null check (attempt >= 1),
  class_key text not null check (length(class_key) <= 300),
  predicted text not null check (predicted in ('approved', 'rejected', 'abstain')),
  p double precision not null check (p between 0 and 1),
  n int not null check (n >= 0),
  actual text check (actual in ('approved', 'rejected')),
  decided_at timestamptz,
  by_twin boolean not null default false,
  created_at timestamptz not null default now(),
  unique (task_id, attempt)
);
create index if not exists twin_predictions_class on public.twin_predictions (org_id, class_key);
alter table public.twin_predictions enable row level security;
alter table public.twin_predictions force row level security;
revoke all on public.twin_predictions from anon, authenticated;
grant select on public.twin_predictions to authenticated;
create policy twin_predictions_read on public.twin_predictions for select to authenticated using ((select private.authorize('viewer', org_id)));
grant select, insert, update, delete on public.twin_predictions to service_role;
grant usage on sequence public.twin_predictions_id_seq to service_role;
create policy twin_predictions_service on public.twin_predictions for all to service_role using (true) with check (true);

create table if not exists public.twin_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  class_key text not null check (length(class_key) <= 300),
  approved_by uuid not null references auth.users (id),
  approved_at timestamptz not null default now(),
  weekly_budget int not null default 5 check (weekly_budget between 1 and 5),
  policy_hash text not null check (policy_hash ~ '^sha256:[0-9a-f]{64}$'),
  revoked_at timestamptz,
  unique (org_id, class_key)
);
alter table public.twin_rules enable row level security;
alter table public.twin_rules force row level security;
revoke all on public.twin_rules from anon, authenticated;
grant select on public.twin_rules to authenticated;
create policy twin_rules_read on public.twin_rules for select to authenticated using ((select private.authorize('viewer', org_id)));
grant select, insert, update, delete on public.twin_rules to service_role;
create policy twin_rules_service on public.twin_rules for all to service_role using (true) with check (true);

-- The twin's approval is recorded honestly as method 'twin' and client 'twin' (never as a tap that did not happen).
-- The method trigger still refuses it where a second factor is required.
alter table public.approvals drop constraint if exists approvals_method_check;
alter table public.approvals add constraint approvals_method_check check (method in ('tap', 'totp', 'local', 'twin'));
alter table public.approvals drop constraint if exists approvals_client_check;
alter table public.approvals add constraint approvals_client_check check (client in ('web', 'pwa', 'cli', 'twin'));
