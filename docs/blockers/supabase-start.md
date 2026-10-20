# Blocker: `supabase start` не може да изтегли образите си (20.10.2026)

## Какво
`pnpm db:start` (= `supabase start -x studio,imgproxy,edge-runtime,logflare,vector,postgres-meta,mailpit,storage-api,supavisor`,
Supabase CLI 2.119.0) пада при теглене на `docker.io/supabase/postgres:17.11.0.002` и `postgrest/postgrest:v16.4`.

## Какво опитах
1. `supabase start` (15:3x UTC): `429 Too Many Requests` от registry-1.docker.io за supabase/postgres и postgrest (kong,
   realtime и gotrue се изтеглиха).
2. Алтернативни регистри: `public.ecr.aws/supabase/postgres:17.11.0.002` и `ghcr.io/supabase/postgres:17.11.0.002` →
   изтеглянето на слоевете (CloudFront / pkg-containers.githubusercontent.com) връща 403 от прокси-то на облачната сесия.
3. `supabase start` повторно (≈ 16:3x UTC): `Error response from daemon: error from registry: Data limit exceeded`.
4. `postgres:17.6-alpine` се изтегли; pgTAP не може да се инсталира в него (apk огледалото е блокирано, както Debian в D-151;
   архивът на pgTAP от GitHub → 403).

## Обход (работи, D-274)
- `pnpm test:db` = scripts/test-db.mjs: миграциите + supabase/tests/*.test.sql (pgTAP) в PGlite 0.5.8 (Postgres 17 в WASM,
  Apache-2.0) с pgcrypto и pglite-pgtap 0.0.9; минимален shim на Supabase (роли anon/authenticated/service_role,
  auth.users, auth.uid()) в supabase/shim/supabase-shim.sql. Влиза и в `pnpm check` (scripts/test-db.test.ts).
- apps/worker/src/online/db.docker.test.ts: истински Postgres 17 (postgres:17.6-alpine) за паралелните писачи в дневника,
  outbox със SKIP LOCKED, `verify-log --org` и `demo seed --minimal`.

## Предложение
На машината на Симо (без лимита на облачната сесия): `pnpm db:start && pnpm db:reset && pnpm test:db:supabase`
(docs/setup/supabase.md). Ако мине — в доклада на E1б се заменя SKIPPED с реалния изход.
