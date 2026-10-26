# E9m — паметта на Мандат (26.10.2026, клон phase/e9m-memory)

Проучване и дизайн: docs/prd/research/memory.md. Решения: D-392 (нива на доверие, стеснен PRD-9), D-393 (търсене без
вектори засега, златен набор), D-394 (MCP сървър за собствените сесии), D-395 (раздел „Памет“ в менюто).

## Какво има
| Част | Къде | Тестове |
| --- | --- | --- |
| Договор: MemoryItem/Note/Search/Patch, бюджети (500 + 800 + 1500 токена), `memory_block` в договора на агента | packages/contract/src/memory.ts, agent-contract.ts | memory.test.ts |
| Скенер при запис (невидим Unicode, тайни, prompt injection/exfil, правила → отказ) и нива на доверие | packages/memory/src/policy.ts | policy.test.ts |
| Замразено ядро (детерминистичен ред, бюджет, хеш) и блокът за агента | core.ts | core.test.ts |
| Хибридно търсене: BM25 върху корени bg/en + същности + употреба, RRF, бюджет, въздържане | recall.ts, text.ts | recall.test.ts, text.test.ts |
| Обновяване при запис (противоречие → `invalid_at`, `superseded_by`), дубликати, предложения за архив | consolidate.ts | consolidate.test.ts |
| Граф (радиална детерминистична подредба) | graph.ts | graph.test.ts |
| Токени: ядро, цялата памет, средно на задача, спестено | metrics.ts | metrics.test.ts |
| Златен набор (23 въпроса): recall@5 ≥ 0,9, обновени 100%, въздържане 100% — минава | eval.ts | eval.test.ts |
| Таблици memory_items / memory_events / memory_usage с RLS (личното — само на човека; пише само сървърът) | supabase/migrations/20261026000027_memory.sql | memory.test.sql (11/11) |
| Хранилище: запис по доверие, история, употреба, консолидация | packages/memory/src/store.ts | store.test.ts (PGlite) |
| Worker: „запомни:“ от задачата → памет; ядро + извадка в договора (`memory_hash`), `memory_snapshot` в дневника, memory_usage; `MEMORY:` от бележките на агента → чака; подреждане след всяка задача | apps/worker/src/online/memory.ts, daemon.ts, run.ts | memory.test.ts, daemon.test.ts, run.test.ts |
| MCP сървър `mandat-memory-mcp`: ядрото като instructions (замразено за сесията), memory_search, memory_note, memory_core | packages/memory/src/mcp.ts, main.ts | mcp.test.ts, mcp-args.test.ts |
| Меню „Памет“: списък, „Връзки“ (граф), търсене, филтри, панел с произход и история, редакция, одобрение, закачане, архив, изтриване, „Подреди“, цена в токени; десктоп „Изглед → Памет“ | apps/web/src/app/memory, components/memory-*.tsx, lib/memory-view.ts, lib/server/memory.ts, api/memory/** | memory.test.ts, memory-view.test.ts, api.test.ts, nav.test.ts |

Проверено в браузъра срещу временна база (26.10.2026): списък, граф, избор на спомен, одобрение от „Чака теб“.

## Какво не е направено / граници
- Противоречията се хващат само за известни категории (мениджър на пакети, тест runner, език на отговорите); друго
  остаря чрез „Подреди“ → дубликати, или ръчно. По-общо разпознаване изисква LLM (само като предложение) — не е правено.
- Вектори (pgvector) няма: златният набор минава без тях (D-393). Реалната употреба може да покаже пропуски по смисъл.
- Агентът в пясъчника няма инструмент за търсене по време на работа: получава ядро + извадка по текста на задачата и
  предлага чрез `MEMORY:` в notes.txt. Подсказката за `MEMORY:` е в договора само когато вече има памет.
- Броенето на токени е приблизително (латиница ~4 знака, кирилица ~2 на токен) [О]; реалните числа от проксито не са
  вързани с паметта.
- На живо с истински Claude Code (MCP сървърът и задача с памет) чака Симо (docs/setup/memory.md).
- e2e (Playwright) на страницата не е добавен.
