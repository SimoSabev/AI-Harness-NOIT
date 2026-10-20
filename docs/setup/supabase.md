# Supabase (облачен проект) — чеклист за Симо

Локално всичко върви без облака (`pnpm db:start`, демо промпт т. 5.1). Облачният проект е нужен едва за онлайн демото
(apps/web във Vercel + worker на VPS). Не блокира E1б–E3.

1. https://supabase.com/dashboard → New project: име `mandat-demo`, регион `eu-central-1` (Frankfurt), силна DB парола.
2. Project Settings → API: запиши в своя менажер на пароли (НЕ в репото): Project URL, `anon` key, `service_role` key.
3. Authentication → Providers → Email: включи; „Confirm email“ = on. Authentication → Multi-Factor: TOTP = enabled (D-220).
4. SQL: миграциите се пускат с CLI от твоя терминал:
   `pnpm exec supabase link --project-ref <SUPABASE_PROJECT_ID>` → `pnpm exec supabase db push`.
   Схемата `private` не трябва да е в Settings → API → Exposed schemas (по подразбиране е само `public`).
5. Env имена (стойностите са само на сървъра и в Vercel/VPS; виж .env.example): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_ACCESS_TOKEN, SUPABASE_DB_PASSWORD, SUPABASE_PROJECT_ID.
6. Проверка: `pnpm exec supabase test db --linked` → всички pgTAP тестове зелени; `pnpm mandat verify-log --org <uuid>`
   (с `MANDAT_DB_URL` към проекта) → „OK: chain intact …“.
7. Какво пуска кодерът след това: нищо — облачните live тестове ги пускаш ти (docs/setup/live-tests.md).
