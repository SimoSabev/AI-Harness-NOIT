# Зависимости

Проверено на registry.npmjs.org на 20.10.2026 (т. 4.3 на промпта); повторно сверено в E0.1 с `npm view <pkg>@<ver> version` — всички 19 версии съществуват.
Правило: точна версия, лиценз от license-allowlist.json, ≥ 3 дни от публикуването (pnpm `minimumReleaseAge: 4320`, D-036).
Нова зависимост = нов ред тук + въпрос към Симо, ако е извън таблицата.

Състояние след E0.3б: всички пакети от таблицата са инсталирани (picomatch и @types/picomatch в @mandat/core,
@modelcontextprotocol/sdk само в spikes; zod е пряка зависимост и на spikes заради s1-mcp-server.mjs). `pnpm licenses:check`:
`licenses ok (238 packages)`.

Състояние в E0.1: инсталирани са zod, canonicalize, tar (декларирана, още неползвана, D-076), commander и всички dev
инструменти. zod е пряка зависимост и на @mandat/ledger (`LedgerEntry.extend`, D-107). picomatch, @types/picomatch и
@modelcontextprotocol/sdk влизат в E0.2а–E0.3а.

| Пакет | Версия | Публикуван | Лиценз | Къде | Защо |
| --- | --- | --- | --- | --- | --- |
| zod | 4.6.7 | 12.10.2026 | MIT | contract (runtime) | zod схеми = единен източник на типовете |
| canonicalize | 5.1.0 | 18.09.2026 | Apache-2.0 | contract (runtime) | JCS RFC 8785 (авторът на RFC е съавтор); 0 зависимости |
| picomatch | 4.0.7 | 24.08.2026 | MIT | core (runtime) | glob за allowed_paths/protected_paths |
| tar | 7.5.22 | 24.07.2026 | BlueOak-1.0.0 | export (runtime) | поточно четене на tar с типа на всеки запис (symlink/hardlink); транзитивни chownr, minipass, minizlib, yallist, @isaacs/fs-minipass — лицензите им ги проверява check-licenses |
| commander | 15.0.0 | 29.05.2026 | MIT | cli (runtime) | разбор на аргументи |
| typescript | 6.0.3 | 16.04.2026 | Apache-2.0 | dev | D-002 |
| vitest | 5.0.5 | 15.10.2026 | MIT | dev | тестове; същата версия е и във fixtures/shop |
| @vitest/coverage-v8 | 5.0.5 | 15.10.2026 | MIT | dev | покритие |
| fast-check | 4.10.2 | 19.09.2026 | MIT | dev | property тестове |
| eslint | 10.13.0 | 16.10.2026 | MIT | dev | lint |
| @eslint/js | 10.0.1 | 06.02.2026 | MIT | dev | базови правила |
| typescript-eslint | 8.71.2 | 12.10.2026 | MIT | dev | TS правила (peerDependencies: typescript ">=4.8.4 <6.1.0", eslint "^8.57.0 или ^9.0.0 или ^10.0.0" (в npm записа с „||“) — 10.13.0 е включен; registry, 20.10.2026) |
| prettier | 3.9.10 | 10.10.2026 | MIT | dev | формат |
| turbo | 2.11.9 | 16.10.2026 | MIT | dev | задачи в monorepo |
| @types/node | 24.19.2 | 09.10.2026 | MIT | dev | типове за Node 24 |
| @types/picomatch | 4.0.3 | 03.04.2026 | MIT | dev | типове |
| pnpm | 12.14.0 | 15.10.2026 | MIT | инструмент (packageManager) | workspace |
| @modelcontextprotocol/server | 2.3.1 | 05.10.2026 | Apache-2.0 | packages/mcp (Apache), packages/mcp-bridge (харнес) | MCP сървърът `mandat`; бриджът stdio → streamable HTTP на sidecar-а (E8д); npm time, прочетено 22.10.2026 |
| @modelcontextprotocol/client | 2.3.1 | 05.10.2026 | Apache-2.0 | packages/mcp (dev), packages/mcp-bridge (харнес) | stdio клиент към MCP сървъра в sidecar-а (E8д); тестове |
| @modelcontextprotocol/sdk | 1.32.1 | 05.10.2026 | MIT | САМО spikes/ (dependency на private пакета spikes, D-086) | MCP сървър за спайк S1; не влиза в продукта |

## Извън npm (отделни процеси или образи, не се линкват)

| Компонент | Версия | Публикуван | Лиценз | Къде | Защо |
| --- | --- | --- | --- | --- | --- |
| Node.js | 24.22.0 | 14.10.2026 | MIT | хост + образи | D-001 |
| node:24.22.0-bookworm-slim | digest на OCI индекса (многоархитектурен) sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 (https://hub.docker.com/v2/repositories/library/node/tags/24.22.0-bookworm-slim, 20.10.2026; D-058) | | MIT (Node) + Debian | основа на трите образа | закрепена по digest на индекса |
| @anthropic-ai/claude-code | 2.1.302 (integrity sha512-+5GARMH0vX8a+o8xGrmx67KH+aDI5aYVO2qFustRhUJrSMdxzb4LtUmF2rL+PyaxCpHfXYZz38vfIuT2irg/Cg==) | 16.10.2026 | „SEE LICENSE IN README.md“ (несвободен; Anthropic Commercial Terms) | само в образа mandat-sandbox, отделен процес, не се публикува | агентът; bin `bin/claude.exe`, postinstall `node install.cjs`, 8 платформени optionalDependencies |
| @anthropic-ai/claude-code-linux-x64 / -linux-arm64 | 2.1.302 (integrity в D-056) | 16.10.2026 | „SEE LICENSE IN LICENSE.md“ (несвободен) | само в образа mandat-sandbox | native binary; закрепено по integrity (D-056), без TOFU |
| Docker Engine | ≥ 25.0.5 | | Apache-2.0 | хост | пясъчник |
| gitleaks | v8.30.1 (образ ghcr.io/gitleaks/gitleaks:v8.30.1, закрепен по digest при E0.1 с `docker buildx imagetools inspect`) | | MIT (https://raw.githubusercontent.com/gitleaks/gitleaks/v8.30.1/LICENSE, 20.10.2026) | CI + локално | тайни в хранилището; подкоманда `git` (`detect` е остаряла от v8.19.0: README v8.30.1); образът сам задава safe.directory '*' (Dockerfile v8.30.1) |
| git | ≥ 2.43.0 | | GPL-2.0 | хост, отделен процес | чист git (attr.tree) |
| apt в образа: curl, bind9-dnsutils, ca-certificates | версии от Debian bookworm при build | | разни свободни | само mandat-sandbox | пробите на R14 (curl, dig) |

Digest-и, сверени в E0.1 (D-146, D-145):
- node:24.22.0-bookworm-slim → sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 (OCI индекс)
- ghcr.io/gitleaks/gitleaks:v8.30.1 → sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f (OCI индекс)

## Нови в E1б (демо промпт; D-202: последната версия ≥ 14 дни преди 20.10.2026, точна; проверено в registry 20.10.2026)
| Пакет | Версия | Публикуван | Лиценз | Къде | Защо |
| --- | --- | --- | --- | --- | --- |
| yaml | 2.9.1 | 11.09.2026 | ISC | contract (runtime), worker (dev) | `.mandat.yml` v2 (https://registry.npmjs.org/yaml) |
| typescript | 6.0.3 | (E0) | Apache-2.0 | core (runtime) | AST на тестовите файлове за D2:weakened_assertions и report_mismatch (https://registry.npmjs.org/typescript) |
| tar | 7.5.22 | (E0) | BlueOak-1.0.0 | verify (runtime) | tar на дървото на агента за mandat-verify |
| pg | 8.23.1 | 30.09.2026 | MIT | worker (runtime) | Postgres клиент на worker-а (D-216; https://registry.npmjs.org/pg) |
| @types/pg | 8.23.1 | 17.08.2026 | MIT | worker (dev) | типове |
| pkijs | 3.4.1 | 20.09.2026 | BSD-3-Clause | ledger (runtime) | RFC 3161 заявка/проверка (https://registry.npmjs.org/pkijs); транзитивни asn1js, pvutils, pvtsutils, bytestreamjs, tslib, @noble/hashes |
| asn1js | 3.0.10 | 20.04.2026 | BSD-3-Clause | ledger (runtime) | ASN.1 за TSA заявката |
| supabase | 2.119.0 | 30.09.2026 | MIT | root (dev) | Supabase CLI (`db:start`, `test:db:supabase`); бинарникът идва като @supabase/cli-linux-x64 от npm |
| @electric-sql/pglite | 0.5.8 | 26.08.2026 | Apache-2.0 | root (dev) | Postgres в WASM за `pnpm test:db` (D-274) |
| @electric-sql/pglite-pgtap | 0.0.9 | 26.08.2026 | Apache-2.0 | root (dev) | pgTAP за PGlite |
| next | 16.3.8 | 30.09.2026 | MIT | web (runtime) | App Router UI на харнеса (E3а; https://registry.npmjs.org/next); `sharp` е изключен (D-284) |
| react, react-dom | 19.3.0 | 09.09.2026 | MIT | web (runtime) | UI |
| @supabase/supabase-js | 2.117.2 | 25.09.2026 | MIT | web (runtime) | Auth + Realtime клиент (https://registry.npmjs.org/@supabase/supabase-js) |
| @supabase/ssr | 0.12.7 | 08.09.2026 | MIT | web (runtime) | сесия в бисквитки за SSR |
| server-only | 0.0.1 | 03.09.2022 | MIT | web (runtime) | build грешка при импорт на сървърен модул от клиента (И: ключове само на сървъра) |
| zod, pg | 4.6.7, 8.23.1 | (вж. горе) | MIT | web (runtime) | валидиране; private.approve_changeset |
| @types/react, @types/react-dom | 19.3.0 | 09.09.2026 | MIT | web (dev) | типове |
| caniuse-lite (транзитивно) | 1.0.30001816 | — | CC-BY-4.0 | web (runtime, build) | данни на browserslist; поименно изключение D-284 |
| yaml (onboard) | 2.9.1 | (вж. contract) | ISC | onboard (runtime) | четене на .github/workflows и предложението (същата версия като в contract) |
| @openai/codex (образ mandat-sandbox) | 0.160.1 | 05.10.2026 | Apache-2.0 | sandbox image | Codex CLI като отделен процес; integrity на двата tarball-а в docker/sandbox/Dockerfile (D-288) |
| @electric-sql/pglite (worker) | 0.5.8 | 26.08.2026 | Apache-2.0 | worker (runtime) | офлайн база за `mandat demo spill --fake` (вече в root devDependencies) |
| web-push | 3.6.7 | 16.01.2024 | MPL-2.0 | worker (runtime) | само генериране на криптираната, VAPID-подписана заявка (generateRequestDetails); изпращането е наше (D-289). Риск: неподдържан пакет (последна версия 01.2024); mpl-notice.test.ts |
| @types/web-push | 3.6.4 | — | MIT | worker (dev) | типове |
| (allowlist на push хостове) | — | 20.10.2026 [НП] | — | worker/web | fcm.googleapis.com, updates.push.services.mozilla.com, push.apple.com, notify.windows.com — от т. 8.4; за проверка: https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers, https://firebase.google.com/docs/cloud-messaging/js/client, https://learn.microsoft.com/windows/apps/design/shell/tiles-and-notifications/windows-push-notification-services--wns--overview (Q-029) |
| tailwindcss | 4.3.3 | 16.07.2026 | MIT | web (dev, build) | стилове на UI (D-292) |
| @tailwindcss/postcss | 4.3.3 | 16.07.2026 | MIT | web (dev, build) | PostCSS плъгинът на Tailwind v4; транзитивно lightningcss (MPL-2.0) и @tailwindcss/oxide (MIT), само при build (D-292) |
| zod (cli) | 4.6.7 | — | MIT | cli (runtime) | валидация на ключовете на контролния адрес на `mandat local` (D-293); същата версия като в останалите пакети |
| pnpm (образ mandat-sandbox) | 12.14.0 | (вж. инструментите на хранилището) | MIT | sandbox image | инсталиране на репа с pnpm-lock.yaml v9 в пясъчника; integrity в docker/sandbox/Dockerfile (D-301) |
| yarn (образ mandat-sandbox) | 1.22.22 | 09.03.2024 | BSD-2-Clause | sandbox image | инсталиране на репа с yarn.lock v1; integrity в Dockerfile; собственият yarn на базовия образ се маха (D-301) |
| @yarnpkg/cli-dist (образ mandat-sandbox) | 4.18.1 | 24.09.2026 | BSD-2-Clause | sandbox image | yarn berry за репа с yarn.lock v8–10 (`__metadata`); един файл `/opt/yarn-berry/yarn.js`, integrity в Dockerfile; `YARN_IGNORE_PATH=1` (D-358) |
| @oven/bun-linux-x64-baseline, @oven/bun-linux-aarch64 (образ mandat-sandbox) | 1.4.3 | 10.10.2026 | MIT | sandbox image | `bun install` за репа с текстов bun.lock (спайк в docs/spikes/bun.md); само инсталиране, тестовете остават vitest/jest; integrity по архитектура в Dockerfile (D-358) |
| typescript, vite, vitest (само фикстура fixtures/shop-bun-vitest) | 6.0.3, 8.3.4, 5.0.5 | (вж. demo-shop) | Apache-2.0, MIT, MIT | fixture | Docker тест на bun (D-358) |
| typescript, vite, vitest (само фикстура fixtures/shop-yarn-berry) | 6.0.3, 8.3.4, 5.0.5 | (вж. demo-shop) | Apache-2.0, MIT, MIT | fixture | Docker тест на yarn berry (D-358) |
| jest (само фикстура fixtures/shop-pnpm-jest) | 30.2.0 | 28.09.2025 | MIT | fixture | Docker тест на pnpm + jest; не е зависимост на пакет (D-301) |
| vite, vitest, typescript (само фикстура fixtures/shop-yarn-vitest) | 8.3.4, 5.0.5, 6.0.3 | (вж. demo-shop) | MIT, MIT, Apache-2.0 | fixture | Docker тест на yarn v1; vite е изрично, защото yarn v1 не слага peer зависимости (D-301) |
| electron (само apps/desktop, извън workspace) | 44.9.0 | 17.10.2026 | MIT | desktop (dev) | прозорецът на харнеса около `pnpm local` (D-303); инсталира се само с `pnpm desktop`; бинарният файл го сваля собственият install.js на electron срещу checksums.json в пакета; извън `pnpm licenses:check` (отделен lockfile) |
| typescript, @types/node (apps/desktop) | 6.0.3, 24.19.2 | (вж. горе) | Apache-2.0, MIT | desktop (dev) | build на main.ts; същите версии като в корена |
| Шрифтове Tektur, Geologica, Martian Mono (apps/web/public/fonts) | Tektur v6, Geologica v5, Martian Mono v6 (Google Fonts, 21.10.2026) | — | OFL-1.1 | web, site (статични файлове; сайтът ги копира от apps/web/public при build, D-377) | собствени woff2 само latin + cyrillic, без заявка към Google по време на работа; текстът на лиценза до файловете (OFL-*.txt) (D-305) |
| node-pty (само apps/desktop, извън workspace) | 1.1.0 | 22.12.2025 | MIT | desktop | терминалът на хоста (D-375); native: install скриптовете не се пускат (`allowBuilds: false`), ползват се prebuilds (darwin/win32), `pnpm --dir apps/desktop run setup` прави `spawn-helper` изпълним; Linux — build в А5 [НП]; извън `pnpm licenses:check` (отделен lockfile) |
| @xterm/xterm (apps/web) | 6.0.0 | 22.12.2025 | MIT | web | панелът на терминала на хоста в десктопа (D-375); без зависимости; зарежда се динамично само в браузъра |
| electron-builder (само apps/desktop, извън workspace) | 26.17.0 | 26.09.2026 | MIT | desktop (dev) | инсталаторите dmg/nsis/AppImage/deb, неподписани, `--publish never` (D-376); само при build; транзитивни dev лицензи извън списъка: truncate-utf8-bytes (WTFPL), sanitize-filename (WTFPL OR ISC → ISC), utf8-byte-length (WTFPL OR MIT → MIT) — не влизат в приложението; electron-winstaller не пуска скриптове (`allowBuilds: false`, Squirrel.Windows не се ползва) |
| electron-updater (само apps/desktop, извън workspace) | 6.8.10 | 26.09.2026 | MIT | desktop (runtime) | auto-update, изключен без `MANDAT_UPDATE_FEED` (D-376, Q-054); зарежда се само при зададен feed; транзитивно argparse (Python-2.0, през js-yaml) — prodException в license-allowlist.json |
| zod, yaml, canonicalize (apps/desktop) | 4.6.7, 2.9.1, 5.1.0 | (вж. горе) | MIT, ISC, Apache-2.0 | desktop (runtime) | зависимостите на `@mandat/contract` (link:) изрично, за да влязат в app.asar — electron-builder не взема зависимостите на link: пакет (D-376); същите версии като в contract |
| @playwright/test (apps/desktop) | 1.63.0 | 04.09.2026 | Apache-2.0 | desktop (dev) | Electron e2e (`pnpm --dir apps/desktop e2e`, D-376); същата версия като в apps/web; без сваляне на браузър |
