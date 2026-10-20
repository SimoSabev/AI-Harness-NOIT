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
