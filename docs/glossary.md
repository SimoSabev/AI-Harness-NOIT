# Речник / Glossary (E7е, D-348)

Двуезичният речник на термините от PRD v1.1, раздел 4.1. Английският е източникът на интерфейса, българският е преводът
(U7, AC-12.10). Каталогът на UI е `apps/web/src/i18n/{en,bg}.ts`; терминалът (`mandat tui`) е в `packages/cli/src/i18n.ts`,
десктопът — в `apps/desktop/src/i18n.ts`. Нов термин се добавя първо тук, после в каталога.

The bilingual glossary of the PRD v1.1 §4.1 terms. English is the source language of the interface; Bulgarian is the
translation. Add a new term here first, then to the catalog.

## Термини от PRD 4.1 / PRD 4.1 terms

| English | Български | Значение (кратко) | В кода |
| --- | --- | --- | --- |
| Harness (no name yet, D-304) | Харнес (засега без име) | Цялата система: проекти, агенти, акаунти, пясъчници, оркестрация, екрани. | `apps/*`, `packages/cli` и харнес пакетите |
| Mandat (the judge) | Мандат (съдията) | Присъда, доказателства, стълба, дневник, врата, MCP `mandat`. | `brand.judge` |
| Project (repo) | Проект (хранилище, репо) | Git хранилище, свързано с харнеса. | `repos` |
| Policy (`.mandat.yml`) | Политика (`.mandat.yml`) | Машинно четимите правила на проекта; в UI: „Rules“ / „Правила“. | `nav.harness`, `harness.*` |
| Harness profile | Харнес-профил | Пълният персонализиран харнес на проекта с произход на всяко поле. | — (E8б) |
| Task | Задача | Единица работа за агент. | `tasks` |
| Attempt | Опит | Едно пускане на агент в нов пясъчник за задача. | `tasks.attempt` |
| Contract | Договор | Запечатаната проекция на задачата за агента. | `contracts/*.json` |
| Agent | Агент | Непроменен CLI на доставчик или fake/replay в пясъчник. | `agent.*` |
| Account / Channel | Акаунт / Канал | Начин за достъп до модел: API ключ, абонамент, локален модел. | `nav.keys`, `keys.*` |
| Verdict | Присъда | VERIFIED / FAILED / UNKNOWN + причини + доказателства + ниво. | `verdict.*` |
| Evidence | Доказателство | Ред от детектор: pass / fail / unknown / n/a. | `check.*`, `mark.*` |
| Ladder (trust ladder) | Стълба (стълба на доверие) | CUSUM по (проект, вид задача, агент): ниво 0–3. | `ladder.*`, `task.ladder` |
| Effective level | Ефективно ниво | Минимумът от стълбата и таваните; решава какво прави вратата. | `effectiveLevel()` |
| Gate | Врата | Доставката по ниво: 0 клон, 1 чернова + човек, 2 PR + авто-сливане, 3 без известие. | `task.ladderLegend` |
| Delivery | Доставка | Клон, PR, сливане, check run; винаги през outbox. | `board.col.6` |
| Outcome | Резултат | Слято → tree_match → 7 дни без revert = успех за стълбата. | `board.col.7` |
| Ledger | Дневник | Верижен хеш на всички решения; котви RFC 3161. | `task.ledger*` |
| Night shift | Нощна смяна | Опашка от задачи с бюджет, правила и прозорец; сутрешен доклад. | `night.*` |
| Agent session | Сесия на агента | Живият поток на агента: стъпки, инструменти, подагенти, разход. | `task.session*` |
| Tool | Инструмент | MCP сървър, скил, плъгин, вграден инструмент, bash, Мандат. | `tools.*` |
| Window | Прозорец | Жив изглед към терминал, преглед, сървър или лог (само localhost). | `wb.win.*` |
| Research | Ресърч | Въпрос → източници → твърдения с присъда. | `research.*` |

## Думи на екрана / Words on screen

| English | Български | Ключ |
| --- | --- | --- |
| VERIFIED | ПРОВЕРЕНО | `verdict.verified` |
| FAILED | ПРОВАЛ | `verdict.failed` |
| UNKNOWN | НЕИЗВЕСТНО | `verdict.unknown` |
| Waiting for you | Чака теб | `group.waiting`, `board.col.4` |
| Awaiting approval | Чака одобрение | `status.review.label` |
| Approve the change | Одобри промяната | `actions.approve` |
| Run again | Пусни отново | `actions.retry` |
| Sandbox | Пясъчник | `status.running.headline` |
| Proxy | Прокси | `keys.*` |
| Subagent | Подагент | `wb.subagent` |
| SAMPLE (labelled sample data) | ПРИМЕР | `sample.badge` |
| Settings | Настройки | `nav.settings` |
| Language | Език | `settings.lang` |

## Правила за превода / Translation rules
- Имената на продукти и команди не се превеждат: Claude Code, Codex, `pnpm local`, `.mandat.yml`, MCP.
- Думите на присъдата са с главни букви и в двата езика (знак + дума + цвят, WCAG 1.4.1).
- Имената на езиците в превключвателя са на самия език: English, Български.
- Числата, датите и относителното време идват от Intl по локала на езика (en-GB, bg-BG).
