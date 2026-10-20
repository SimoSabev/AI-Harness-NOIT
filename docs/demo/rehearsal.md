# Репетиция на демото (демо промпт т. 9.9)

Общо ≤ 9–10 мин: сцена 1 ≤ 4 мин, сцена 2 ≤ 2 мин, сцена 3 ≤ 3 мин, преходи ≤ 1 мин. Резерва: replay → офлайн → видео
(demo/recordings/playwright/**/video.webm, `pnpm --filter @mandat/web demo:record`).

## Преди журито
- [ ] `pnpm ci:local` (в облачната сесия: `MANDAT_EXTRA_CA_CERTS=… MANDAT_SANDBOX_APT=0` за build на образите)
- [ ] `node demo/run.mjs --offline --preflight` → `preflight: готово` (образи, записи, patch-ове, npm кеш на gate-а, build)
- [ ] `pnpm mandat verify-log --org d0000000-0000-4000-8000-000000000001` → OK
- [ ] бюджетът на ключовете (Anthropic/OpenAI spend cap), батерия, мрежа; телефонът с PWA на началния екран
- [ ] `pnpm mandat bench --fail-gate` → exit ≠ 0 („самопроверка на проверяващия“, T3-3)

## Сцена 1 — харнес → VERIFIED → стълбата расте → автоматично ниво (≤ 4 мин)
- Предусловия: `pnpm mandat demo seed --scene 1` (на живо) или само `node demo/run.mjs --scene 1 --offline --replay`.
- Prestage: задача 1 „Поправи отстъпката“ (fake:replay-claude, replay scene1-task1) е в „Чака теб“: ✔ ПРОВЕРЕНО, ниво 1, чернова на PR.
- На сцената: approver@demo → карта → Одобри → TOTP → ready for review + „Мандат approval“ → Merge (на живо в GitHub; офлайн:
  „симулирано човешко сливане“) → OUTCOME (прозорец 0 мин) → „ниво 1 → 2“ → задача 2 „Поправи закръглянето“ → ниво 2 →
  PR → D7 → слято само → известие → inbox „ПРОВЕРЕНО и слято само“.
- Казва: „seed-ът е близо до прага — надписано (демо: seed близо до прага + прозорец 0 мин)“.
- Ако CI на живо се бави > 90 s: говори по картата (D7 pending); резерва — офлайн вариантът.

## Сцена 2 — лимитът на Claude → Codex (≤ 2 мин)
- На живо: MANDAT_UPSTREAM_ANTHROPIC → stub-upstream `--429 7200`, OpenAI → истинският (docs/setup/keys.md).
- Офлайн: `node demo/run.mjs --scene 2 --offline --replay` (или `pnpm mandat demo spill --fake`).
- Кадър: /channels „anthropic-key-demo ✖ лимит · нулира се в HH:MM“ + „демо: лимитът е симулиран“ → картата „codex · опит 2 ·
  ниво 0“ → клон mandat/<task>-a2 + „Отвори чернова на PR“ → ✔ ПРОВЕРЕНО.

## Сцена 3 — външен агент трие/отслабва тест, CI зелено → Мандат FAILED (≤ 3 мин)
- Детерминистично: `node demo/run.mjs --scene 3 --offline --replay` (delete, после weaken).
- Живо: demo/scene3.md (промпт, headless команда, дърво на решенията, правило 90 s).
- Казва: „локалният MCP е съвет; авторитетната присъда е check run-ът от сървъра“; „честността на отчета е колкото пясъчника“.

## Времена (3 репетиции, офлайн replay в облачната сесия, 20.10.2026)
| Сцена | Опит 1 | Опит 2 | Опит 3 | Лимит |
| --- | --- | --- | --- | --- |
| 1 | 0:56 | 0:55 | 0:54 | 4:00 |
| 2 | 1:05 | 1:01 | 1:03 | 2:00 |
| 3 | 0:38 | 0:38 | 0:38 | 3:00 |

Това е времето на машината (без говорене); на живо сцената трае колкото Симо говори по кадрите, в рамките на лимита.

## Нулиране
Офлайн сцените ползват база в паметта (PGlite) — всяко пускане започва чисто. На живо: `pnpm db:reset && pnpm mandat demo seed`.

## Запис на живия транскрипт за replay (Симо)
`claude -p "<промпта от demo/scene3.md>" --output-format stream-json --verbose … > demo/recordings/scene3-live.jsonl`
