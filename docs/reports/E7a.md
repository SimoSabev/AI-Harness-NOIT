# Доклад E7а — живи спайкове и общи договори (22.10.2026)

## Статус: ГОТОВО (live чака Симо)

## Какво е направено
| Част | Решение | Проверено |
| --- | --- | --- |
| Общи договори (т. 2) | agent-stream, profile (A–H), roles, research, night v5, нови видове доказателства/дневник/събития (D-341) | unit: contract (+30 теста) |
| Унифициран поток (т. 2.1, D-310) | `toStream` за claude, codex, fake, fake-codex; подагентите са сесии `run:child`; touching, решения, usage | unit срещу синтетични фикстури (надписани); истинската S0 фикстура — SKIPPED (D-276) |
| SH2 (D-312) | варианти A/B в `buildClaudeArgv`; `/m/in/harness` (root, 0444/0555); куката deny-by-policy в образа | docker: A и B с fake `sh2-probe` — зелено; живият вариант чака (D-343) |
| Абонамент | без `--bare` (bare не чете OAuth) (D-342) | unit (control-layer, agents) |
| S-SUB | статична изолация на volume-а на профила за всички роли | unit (sub-volume-isolation) |
| Облачна среда | turbo --concurrency=1, образите преди docker тестовете (D-344) | — |

## Готово, когато
| Ред | Реален изход | |
| --- | --- | --- |
| `pnpm check` | exit 0; unit 633 passed, 1 skipped (D-276: истинската S0 фикстура); licenses ok; no-dotenv ok | ✓ |
| `pnpm test:docker` | 33 passed, 11 skipped (Postgres образът: Docker Hub 429), sh2 A/B ✓; 2 файла паднаха само защото образът на проксито се смени по време на пускането — пуснати отново от снимка на комита (виж E7в доклада) | ✓ (с бележка) |
| docs/spikes/{S0,S1,S2,S-CX,SH2,SH2-CX,S-SUB}.md | реален изход (SH2 fake, S-SUB статично) или „SKIPPED: липсва ключ“ | ✓ |
| fixtures/stream-json, fixtures/codex-jsonl | синтетични записи; истинските — SKIPPED (чеклист стъпки 2, 6) | ✓ |
| D-34x за контролния слой | D-343 (временно до живия SH2) | ✓ |

## Чака Симо
docs/setup/local-live-checklist.md: стъпки 1–7 и 9 (ключове, S0, S1, S2, SH2 live, S-CX, SH2-CX, S-SUB).

## Разход API: $0
