# Доклад E8и — monorepo, yarn berry, bun, node --test (22.10.2026)

## Статус: ГОТОВО
Пясъчникът вече проверява pnpm workspaces (един install и един тестов run в корена; глобове и пътища по пакет),
yarn berry (прикован yarn 4.18.1, никога `yarnPath` на репото), bun с текстов `bun.lock` (прикован bun 1.4.3, само
install) и `node --test` (собствен репортер във формата на Vitest JSON). Моделът е същият навсякъде: lockfile → точни
маршрути във вратата → прикован инструмент без скриптове. D10 `lock_missing` гледа и package.json на всеки пакет.
mocha → needs_human (Q-058). Решение D-358, спайк docs/spikes/RUNNERS.md.

## Готово, когато
| Ред | Реален изход | |
| --- | --- | --- |
| fixtures/monorepo-pnpm: поправка в пакет A → VERIFIED; изтрит тест в пакет B → FAILED | ✓ monorepo-pnpm (36 s): VERIFIED, после FAILED `D2:missing_test` за `pads cents` | ✓ |
| yarn berry fixture → VERIFIED | ✓ shop-yarn-berry (49 s): VERIFIED; изтрит тест → FAILED | ✓ |
| (отвъд) bun, node --test | ✓ shop-bun-vitest (28 s), ✓ shop-node-test (21 s) | ✓ |
| регресия pnpm+jest, yarn v1 | ✓ shop-pnpm-jest (50 s), ✓ shop-yarn-vitest (64 s) | ✓ |

`runners.docker.test.ts`: 6/6, 249 s.

## Какво намери docker тестът (и не биха го намерили unit тестовете)
1. В средата на install фазата има `YARN_*` настройки на yarn v1; berry спира с „Unrecognized or legacy configuration
   settings“ → командата ги `unset`-ва.
2. berry иска scoped tarball-ите като `/npm/@scope%2fname/-/…` → и този точен маршрут.
3. yarn 4 не пише checksum за бинарните пакети по платформа дори на платформата, която ги е свалила → пинът им е
   точното име@версия (D-358 записва компромиса).
4. Глобалната папка на berry е в `$HOME/.yarn` → `YARN_GLOBAL_FOLDER` в tmpfs дома на пясъчника.

## Разход API: $0
