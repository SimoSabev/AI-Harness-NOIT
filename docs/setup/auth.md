# Незадължителен вход и синхрон — чеклист за Симо (D-490…D-499)

Входът НЕ е задължителен. Без него `pnpm local` и десктопът работят точно както досега: само на 127.0.0.1, нищо не
излиза от машината (тест: `device.test.ts` „without an account nothing leaves the machine“). Входът е само за това
настройките, връзките, MCP/скиловете, проектите и историята на задачите да те следват на всяко устройство.

Как е устроено (подробно в docs/decisions.md, D-490…D-499):

```
устройство (pnpm local / десктоп)            сървър за синхрон (същият apps/web, MANDAT_SYNC_SERVER=1)
  Настройки → Профил и синхрон                 Better Auth: GitHub, Google (имейл линк — Q-107)
  „Влез“ ──── device flow (RFC 8628) ────────► /api/account-auth/device/code
  системният браузър ◄─ /account/device ─────  човекът влиза и одобрява кода
  локалната база пази токена и ключа на трезора /api/sync/{pull,push,vault,wipe} (само bearer)
  ключовете — запечатани с паролата за синхрон  Postgres: схема sync, принудителен RLS
```

## Статус: [НП] — чака Симо

Всичко е проверено с тестови стойности (в процеса, без мрежа): вход с тестов доставчик (имейл линк, уловен в паметта),
device flow, CSRF, rate limit, изход от всички устройства, изтриване на данните, RLS върху PGlite. Не е пускано срещу
истински GitHub/Google OAuth, истински Supabase и истински домейн.

## Какво трябва да създадеш и да ми дадеш

Стойностите — само в твоя менажер на пароли и в env на сървъра. НИКОГА в репото и в чата.

1. **Адрес на сървъра за синхрон** (https), напр. `https://sync.<твоят-домейн>`. Това е същият `apps/web`, пуснат с
   `MANDAT_SYNC_SERVER=1` (Vercel или VPS — docs/setup/vercel.md, docs/setup/vps.md).
2. **Postgres за синхрона** — нов проект в Supabase (облак, регион eu-central-1) или собствен Postgres ≥ 15.
   Нужен е connection string (Project Settings → Database → Connection string, режим „Session“, порт 5432).
   НЕ ползвай базата на `pnpm local`.
3. **Тайна на Better Auth** — поне 32 случайни знака: `openssl rand -base64 32`.
4. **GitHub OAuth app** — https://github.com/settings/developers → OAuth Apps → New OAuth App:
   - Homepage URL: адресът от т. 1;
   - Authorization callback URL: `<адрес>/api/account-auth/callback/github`;
   - запиши Client ID и Client secret.
   [НП] пътят на callback-а е по документацията на Better Auth (`/callback/<provider>` под basePath); потвърди го при първия вход.
5. **Google OAuth client** (по избор) — https://console.cloud.google.com/apis/credentials → Create credentials → OAuth client ID
   → Web application:
   - Authorized JavaScript origins: адресът от т. 1;
   - Authorized redirect URIs: `<адрес>/api/account-auth/callback/google`;
   - OAuth consent screen: External, само обхватите email и profile; запиши Client ID и Client secret.
6. **Изпращач на имейли** — само ако искаш вход с линк по имейл (Q-107). Без него входът е с GitHub/Google.

## Пускане на сървъра за синхрон

1. Env на сървъра (имената са в `.env.example`):
   `MANDAT_SYNC_SERVER=1`, `BETTER_AUTH_URL=<адрес>`, `BETTER_AUTH_SECRET`, `MANDAT_SYNC_DB_URL`,
   `MANDAT_AUTH_GITHUB_ID`, `MANDAT_AUTH_GITHUB_SECRET`, по избор `MANDAT_AUTH_GOOGLE_ID`, `MANDAT_AUTH_GOOGLE_SECRET`,
   `MANDAT_SYNC_TRUSTED_ORIGINS` (допълнителни https адреси, със запетая).
2. Схемата на синхрона: `psql "$MANDAT_SYNC_DB_URL" -f deploy/sync-server/schema.sql`.
3. Ролята, с която сървърът пише: потребителят от connection string-а трябва да е член на `mandat_sync`:
   `grant mandat_sync to <потребител>;` (в Supabase: `postgres`).
4. Таблиците на Better Auth: `pnpm dlx auth@1.7.14 migrate` с env от т. 1 [НП]: командата е по документацията
   (https://www.better-auth.com/docs/adapters/postgresql, прочетено 04.11.2026); още не е пускана тук.
5. Проверка: `<адрес>/api/account-auth/ok` трябва да върне `{"ok":true}` [НП]; `<адрес>/account/device` показва бутоните.

## На всяко устройство

- В env на `pnpm local` (или на десктопа): `MANDAT_SYNC_URL=<адрес>`. Без нея профилът не се показва никъде (D-625).
- Настройки → Профил и синхрон → „Влез“ → отваря се системният браузър → влизаш → одобряваш кода.
- „Парола за синхрон“ (поне 10 знака): само с нея API ключовете отиват на сървъра — запечатани на устройството.
  Ако я забравиш, синхронизираните ключове не могат да се отворят; добавяш ги отново.

## Сигурност накратко

- Сесиите в браузъра на сървъра: httpOnly, SameSite=Lax, Secure на https (тест `auth-server.test.ts`).
- CSRF: Better Auth отказва POST с чужд Origin (изрично включено, и в тестовете); локалният API: Origin + double submit.
- Rate limit: 3 линка/мин, 10 OAuth входа/мин, 5 device кода/мин от един адрес; локално 10/мин на стъпка.
- Устройството пази токена в `private.account_link` (локалната база, само собственикът ѝ); браузърът никога не го вижда.
- Ключ в чист вид никога не стига до сървъра: проверка преди изпращане и пак на сървъра (тест `device.test.ts`).
- RLS на сървъра: принудителен, по `mandat.sync_uid` за всяка транзакция (тест `sync-store.test.ts`).
