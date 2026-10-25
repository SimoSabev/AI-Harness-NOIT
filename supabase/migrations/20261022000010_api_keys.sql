-- E7в (v5 т. 3.3, D-313): API keys at rest, sealed with AES-256-GCM under a KEK the database never sees. Only the service
-- role (worker, web server) stores and reads them; storing one asks the worker to restart the proxy (outbox proxy_restart).
create table if not exists private.api_keys (
  org_id uuid not null references public.orgs (id) on delete cascade,
  provider text not null check (provider ~ '^(anthropic|openai|mcp:[a-z0-9][a-z0-9_-]{0,63}|research:[a-z0-9][a-z0-9_-]{0,63})$'),
  ciphertext bytea not null check (octet_length(ciphertext) between 1 and 4096),
  nonce bytea not null check (octet_length(nonce) = 12),
  kek_id text not null check (kek_id ~ '^[0-9a-f]{1,64}$'),
  created_at timestamptz not null default now(),
  primary key (org_id, provider)
);
revoke all on private.api_keys from public, anon, authenticated;
grant select, insert, update, delete on private.api_keys to service_role;

alter table public.outbox drop constraint if exists outbox_kind_check;
alter table public.outbox add constraint outbox_kind_check check (kind in ('check_run', 'draft_pr', 'ready_for_review', 'approval_check', 'merge', 'push_branch', 'web_push', 'harness_scan', 'harness_pr', 'proxy_restart', 'baseline'));

create or replace function private.store_api_key(p_org uuid, p_provider text, p_ciphertext bytea, p_nonce bytea, p_kek_id text)
  returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into private.api_keys (org_id, provider, ciphertext, nonce, kek_id) values (p_org, p_provider, p_ciphertext, p_nonce, p_kek_id)
    on conflict (org_id, provider) do update set ciphertext = excluded.ciphertext, nonce = excluded.nonce, kek_id = excluded.kek_id, created_at = now();
  insert into public.outbox (org_id, kind, idempotency_key, payload)
    values (p_org, 'proxy_restart', 'proxy_restart:' || p_org::text || ':' || gen_random_uuid()::text, jsonb_build_object('provider', p_provider));
end $$;
create or replace function private.delete_api_key(p_org uuid, p_provider text)
  returns void language sql security definer set search_path = '' as $$
  delete from private.api_keys where org_id = p_org and provider = p_provider;
$$;
revoke all on function private.store_api_key(uuid, text, bytea, bytea, text) from public, anon, authenticated;
revoke all on function private.delete_api_key(uuid, text) from public, anon, authenticated;
grant execute on function private.store_api_key(uuid, text, bytea, bytea, text) to service_role;
grant execute on function private.delete_api_key(uuid, text) to service_role;
