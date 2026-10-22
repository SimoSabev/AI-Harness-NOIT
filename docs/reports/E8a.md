# Доклад E8а — контролен слой и компилатор на профила (22.10.2026)

## Статус: ГОТОВО (live чака Симо)
Нов пакет `packages/profile` (GPL): `compileProfile(profile, target, ctx)` → Materialized за Claude Code, Codex, Gemini/local
(подготвени). Таблица правило × цел (native | harness | unsupported). Шест куки на харнеса в образа (`/opt/mandat/hooks`).
`runTask(profile)` сийдва `/m/in/harness` (root, ro за агента) преди агента; Codex работи от писаемо копие в `/m/codex-home` и
след агента се сверява байт по байт (`config_change` → UNKNOWN). `mandat run --profile`. Решение D-350.

## Готово, когато
| Ред | Реален изход | |
| --- | --- | --- |
| compile-claude/codex (snapshot) | 13/13 | ✓ |
| hooks | 14/14 | ✓ |
| control-layer.docker | `✓ Claude layout (fake:sh2-probe) … ✓ Codex (fake-codex:hook-probe) …` (D3:protected_path:.claude/**; config_change → UNKNOWN) | ✓ |
| sh2.docker | A ✓, B ✓ | ✓ |
| AC-2.2/2.3/2.4/2.7 | ✓ | ✓ |
| live: `git push` отказан с истински Claude Code | SKIPPED: липсва ключ (чеклист стъпка 5) | чака |

## Бележка за облачната среда
Docker тестовете искат `MANDAT_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt` в същата команда (TLS прихващане; без него
install през вратата пада с INFRA:install_base).

## Разход API: $0
