# Vercel за apps/web (чака Симо; не блокира)

Демото върви локално (`pnpm --filter @mandat/web start`). Деплой на Vercel е по желание; прави го Симо.

1. Vercel → Add New Project → импорт на хранилището → Root Directory `apps/web`, Framework Next.js.
   Install `pnpm install --frozen-lockfile`, Build `pnpm --filter @mandat/web... build` (workspace пакетите се build-ват първи).
2. Environment Variables (Production): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY` (Sensitive; чете се само в `src/lib/server/admin.ts`), `MANDAT_DB_URL` (Supabase pooler,
   transaction mode), `MANDAT_WEB_ORIGIN` (https://<домейн>), `NEXT_PUBLIC_GITHUB_DEMO_REPO`.
   НЕ задавай `MANDAT_DEMO_DEV_AUTH` на Vercel (локален вход само за демото на лаптопа, D-285).
3. Supabase → Authentication → MFA: включи TOTP; approver@demo и owner@demo записват фактор (Authenticator app).
4. Проверка: `pnpm test:sentinel` локално (0 съвпадения на стойностите на сървърните ключове в .next) преди деплой.

Без Vercel: `MANDAT_DEMO_DEV_AUTH=1 MANDAT_DB_URL=… pnpm --filter @mandat/web start` → http://localhost:3000.
