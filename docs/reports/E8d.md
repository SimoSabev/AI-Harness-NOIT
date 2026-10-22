# Доклад E8г — права с „ask“, насочване, срок на HELD (22.10.2026)

## Статус: ГОТОВО (live чака Симо)
(1) `tool_permissions` е източникът на слой C: промяна → нова одобрена версия на профила, в която базата проверява, че е
сменен само слой C; отваряне на `net:*` или `git push` иска TOTP ≤ 2 мин (решава базата). Матрицата в /tools е редактируема
с `tools.manage`. (2) „ask“: hook-ът отказва и пише asks.jsonl; worker-ът приема само молби за ask правила от поставената
политика → `tool_asks` + HELD `tool_approval` + известие; карти „Разреши веднъж / винаги / откажи“ (`approve.tool`).
(3) „Насочи“: `POST /api/tasks/:id/steer` → `task_activities`; при насочваем агент — по stdin (stream-json) до първия result;
иначе в договора на следващия опит; Codex — обяснение вместо поле. За истинския Claude Code е зад `MANDAT_STEER=1` до S2 live.
(4) HELD срок: `held_until` (тригер) + `closeExpiredHeld` в цикъла на ефектите → CLOSED `expired` + известие.
Намерен и поправен пропуск: `deny-by-policy` вървеше само за Bash (matcher от слой D) — ask правило за MCP инструмент никога
не стигаше до hook-а; компилаторът го пуска преди всеки инструмент (D-353 т. 5). Решения D-352, D-353.

## Готово, когато
| Ред | Реален изход | |
| --- | --- | --- |
| held-expiry.test.ts | 3/3 | ✓ |
| permissions (profile, web), tool_permissions.test.sql | 7/7, 5/5, 9/9 | ✓ |
| run/daemon E8g + steering | 4 + 4 | ✓ |
| ask-flow.docker | `✓ attempt 1: refused by the hook, the ask comes back; attempt 2 with the grant: allowed, the fix is VERIFIED` | ✓ |
| steer.docker | `✓ the steer text is in the transcript; the run finishes VERIFIED` | ✓ |
| e2e (вкл. asks.spec) | 25 passed | ✓ |
| AC-8.1 / AC-8.6 | ✓ (fake агенти) | ✓ |
| AC-8.5 с истински Claude Code | SKIPPED: S2 live (чеклист стъпка 4) | чака |
| ask с истински Claude Code | SKIPPED: ключ (чеклист стъпка 17) | чака |

## Тестове
unit 758 + 1 skipped (S0 фикстура); docker: ask-flow, steer, control-layer, sh2 — 6/6.

## Разход API: $0
