# Доклад E7г — базова линия при свързване, flaky, рисков профил v1 (22.10.2026)

## Статус: ГОТОВО
| Част | Решение (D-346) | Проверено |
| --- | --- | --- |
| Базова линия | outbox `baseline` → два пускания на base в пясъчника → ново предложение (докато е `proposed`) | unit (PGlite), docker (demo-shop: валиден отчет, 0 flaky) |
| flaky | `tests.flaky` (незадължително); D1 не ги брои, `data.flaky` | unit |
| Рисков профил v1 | папки → high (защитени, `rule:<име>`), src → medium, docs → low | unit + snapshot-и на 6 fixtures |
| Инструкции | `mergeInstructions` (дедупликация с произход, без невидими знаци и опасни команди) | unit |
| CLI | `mandat init --baseline` | unit |

## Готово, когато
| Ред | Реален изход | |
| --- | --- | --- |
| AC-1.2 | baseline-on-connect.docker.test.ts ✓ (снимка на комита: 45 passed, 1 skipped — Postgres образът: Docker Hub 429) | ✓ |
| AC-1.6, AC-1.7 | unit ✓ | ✓ |
| `init --baseline` | печата `baseline: ok · N tests · …` | ✓ |

## Разход API: $0
