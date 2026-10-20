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
