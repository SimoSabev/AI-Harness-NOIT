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

## Обновление 20.10.2026, ≈ 16:50 UTC — РЕШЕНО (с обход за pg_prove)
Вторият `pnpm db:start` е минал след вътрешните повторни опити на CLI (логът завършва с „Applying migration … 3 файла“ и
DB_URL/API_URL). `pnpm db:reset` → „Finished supabase db reset“. `supabase test db` иска образа supabase/pg_prove:3.36,
който пак не се тегли (429 / 403) → `pnpm test:db:supabase` пуска СЪЩИТЕ pgTAP файлове през psql срещу истинската
Supabase база: 38/38. Сверката с истинската база откри грешка, която PGlite не виждаше: Supabase дава ALL на anon и
authenticated за всяка нова таблица в public, затова RLS без политика връщаше 0 реда вместо „permission denied“;
миграцията вече отнема правата и на двете роли, а shim-ът повтаря поведението на Supabase.
