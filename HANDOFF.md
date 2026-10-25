# HANDOFF — от облачната сесия към локален Claude Code (23.10.2026)

Един файл: какво е Мандат, докъде е стигнал, как да го пуснеш локално и **готов промпт** за локалния Claude Code (най-долу).
Всичко е в клона `claude/exciting-heisenberg-uekl8c` на `SimoSabev/AI-Harness-NOIT`.

---

## 1. Какво е Мандат (в едно изречение)
Задача → AI агент (Claude Code, Codex, …) в заключен Docker пясъчник → безопасен износ на промяната → **независима присъда**
(VERIFIED / UNKNOWN / FAILED) дали агентът наистина е свършил работата или е излъгал (изтрити/отслабени тестове, промени
извън обхвата, код само за тестовете, изтекли тайни…) → дневник с хешове. Плюс уеб табло, нощна смяна, GitHub доставка.

## 2. Докъде сме
| Готово и тествано в облака | Чака теб (жива машина, ключове) |
| --- | --- |
| пясъчник, износ, съдия (D1–D5, D8, D10–D12), дневник | истински агент с ключ/абонамент (досега само fake агенти!) |
| уеб (inbox, табло, карта на задача, преди/след снимки), bg/en | GitHub App-ове, демо репо, L1–L3 |
| нощна смяна (паркиране с въпрос), вид задача „без ограничения“ | една истинска нощ |
| скрити тестове (D5), lint/типове (D8), UI в браузър (D12) | D12 и скрити тестове по твой проект |
| bench **40/40, 0 лъжливо VERIFIED**; red team 10/10 | Q-059 (преглед на живо на 127.0.0.1) |
| **GitHub Action** `mandat verify` (`action.yml`), `mandat stats` | Action-ът на истински PR (чеклист 24) |

Подробно: `docs/progress.md` (таблица на фазите), `docs/reports/E9b.md` (последен доклад), `docs/setup/local-live-checklist.md`
(24 стъпки само за теб), `docs/decisions.md` (D-001…D-366, всяко с „защо“), `docs/questions-for-simo.md` (Q-0xx).

## 3. Препоръката (моето мнение, вече обсъдено)
1. **Първо 10 истински задачи с истински Claude Code** (чеклист 1, 2, 9, 13) — най-голямото непознато е колко често
   съдията казва UNKNOWN на реална работа. После `pnpm mandat stats`: цел UNKNOWN < 25%, лъжливо VERIFIED = 0.
2. **Калибрирай** по `stats` (свали прагове/класове, които дават шум), преди да добавяш функции.
3. **GitHub Action на истински PR** (docs/setup/github-action.md) — най-силният самостоятелен продукт: присъда за PR от всеки агент.
4. Едва после реши за E9в–E11 (Gemini, локални модели, ресърч, учене, GitLab, екипи, платформа) — според мен повечето
   могат да чакат реално търсене.

## 4. Локална настройка (macOS / Linux / Windows-WSL2)
Изисквания: Docker ≥ 25.0.5 (Docker Desktop: ≥ 2 CPU, ≥ 30 GB диск; образът на браузъра е 3,6 GB), git ≥ 2.43,
Node **24.22.0**, pnpm **12.14.0** (`corepack enable` или `npm i -g pnpm@12.14.0`). Windows: само в WSL2, клонирай в `~/`.

```bash
git clone https://github.com/SimoSabev/AI-Harness-NOIT.git && cd AI-Harness-NOIT
git checkout claude/exciting-heisenberg-uekl8c
pnpm install --frozen-lockfile
pnpm build
pnpm mandat images build          # + --ui за D12 (браузърът, 3,6 GB)
pnpm mandat fixtures build
pnpm mandat doctor                # всичко трябва да е ok
pnpm check                        # build, lint, типове, unit тестове, лицензи (~5 мин)
pnpm mandat bench --only B1,B2    # бърза проба в Docker
pnpm local                        # уеб + proxy + worker → браузър на localhost
```
Ключове (никога в .env, никога в репото): `ANTHROPIC_API_KEY=… pnpm mandat proxy start` в отделен терминал или „Ключове“
в UI-я. Абонамент вместо ключ: `pnpm mandat login --name lichno`, после агент `claude@lichno`.
Първа истинска задача: `pnpm mandat run --contract contracts/fix-discount.json --agent claude`.

Пълни тестове с Docker: `pnpm test:docker` (~40 мин; bench-ът е 13 мин). e2e на уеба:
`pnpm --filter @mandat/web build && cd apps/web && MANDAT_E2E_DB_URL=postgresql://postgres:postgres@127.0.0.1:5432/mandat_e2e npx playwright test`
(нужен е локален Postgres с база `mandat_e2e`).

## 5. Капани, които облакът ме научи
- **Остарял dist от turbo кеша** → странни грешки в Docker тестове: `npx turbo run build --force` (или изтрий `*.tsbuildinfo`).
- **Docker Hub 429** (лимит на pull-ове): пусни dockerd с `--registry-mirror https://mirror.gcr.io` (Docker Desktop:
  Settings → Docker Engine → `"registry-mirrors": ["https://mirror.gcr.io"]`).
- **Пълен диск**: `docker builder prune -af` и стари `mandat-*` тагове (`docker images | grep mandat`).
- `pnpm --filter X exec vitest` върви от папката на пакета — тестове с относителни пътища (`contracts/…`) минават само от корена:
  `npx vitest run packages/cli/src/commands.test.ts`.
- `pnpm check | tail` скрива изходния код — проверявай за `CHECK OK`, преди да комитваш.
- Tестът „drift“ на daemon-а е бавен (~5,5 s) — има 30 s таймаут.
- **Colima на Mac** споделя с VM-а само `$HOME`: папки от `/var/folders` или `/tmp` се виждат празни в контейнера. Docker
  тестовете затова ползват `<repo>/.mandat/tmp-docker` (D-389). Нова контрактна промяна сменя тага на образите →
  `pnpm mandat images build` преди `pnpm test:docker`.
- **Mac-ът спи** през нощта и Docker тестовете изтичат: `caffeinate -i pnpm test:docker` (D-389).

## 6. Карта на кода
- `packages/contract` — zod схеми (единен източник), хешове, explain (текстове на причините), профил, договори
- `packages/core` — детекторите и присъдата; **чисти функции, без I/O** (D1 base, D2 инвентар/отслабване, D3 защитени,
  D4 обхват, D5 скрити, D8 статика, D10 lockfile, D11 мутанти/специални случаи/test_env, D12 UI)
- `packages/verify` — дърветата base/A/B, тестовата процедура в Docker, `mandat-verify` CLI, **GitHub Action** (`action.ts`)
- `packages/sandbox` (SANDBOX_HARDENING, образи), `egress-gate`, `llm-proxy` (ключът живее само тук), `export`, `ledger`,
  `redaction`, `agents` (адаптери + fake агенти в `fakes/`), `review` (LLM-съветник), `cli`
- `apps/worker` (`mandat run`, daemon, нощна смяна), `apps/web` (Next.js), `apps/desktop`
- `bench/` (B1–B40 + red team), `fixtures/` (demo-shop, shop-*, ui-app), `supabase/` (миграции + pgTAP)

---

## 7. ПРОМПТ ЗА ЛОКАЛНИЯ CLAUDE CODE
Копирай всичко между линиите в първото съобщение на нова сесия в папката на репото:

---
Работиш в хранилището на Мандат (AI-Harness-NOIT), клон `claude/exciting-heisenberg-uekl8c`. Досега проектът е строен в
облачна сесия без истински агенти и ключове; сега си на моята машина и можеш да пускаш истински неща.

Прочети първо, в този ред: `HANDOFF.md`, `AGENTS.md` (задължителните правила), `docs/progress.md`, `docs/reports/E9b.md`,
`docs/setup/local-live-checklist.md`, последните ~10 решения в `docs/decisions.md` (D-357…D-366).

Цел на тази сесия (в този ред, спирай и ми казвай след всяка точка):
1. Провери средата: `pnpm install --frozen-lockfile && pnpm build && pnpm mandat doctor`; ако нещо липсва — кажи ми точно какво
   да инсталирам. После `pnpm check` (трябва `CHECK OK`) и `pnpm mandat bench --only B1,B2,B21`.
2. Водѝ ме през чеклиста за жива работа: ред 1 (ключ в проксито — аз въвеждам ключа в моя терминал, ти никога не го виждаш),
   ред 2 (първа задача с истински Claude Code по demo-shop), после ред 9 ако ползвам абонамент. Записвай фикстурите, които
   чеклистът казва, и обръщай SKIPPED → зелено.
3. 10 истински задачи по 2 проекта (ред 13): demo-shop + моето репо, което ще ти посоча. После `pnpm mandat stats` и анализ:
   дял UNKNOWN, топ причини, лъжливи присъди (провери ръчно поне всяко VERIFIED и 3 UNKNOWN). Предложи калибриране
   (кои класове дават шум) с конкретни промени и тестове; не добавяй нови детектори, преди да сме видели числата.
4. GitHub Action на истински PR (ред 24, docs/setup/github-action.md) в демо репото: един честен PR и един с изтрит тест.
5. Чак след това: доклад какво показаха реалните числа и препоръка дали и кои от E9в–E11 да правим.

Правила: AGENTS.md важи изцяло (особено: ключът само в llm-proxy, агентът получава само mdt_ токен; не четеш/печаташ .env;
не логваш ключове/токени/тела на заявки; Docker флаговете само от SANDBOX_HARDENING). Тестове първо за код в ядрото
(packages/core, contract, verify, sandbox); за UI и документация можеш по-леко. `pnpm check` зелено преди комит в код.
Push само в `claude/exciting-heisenberg-uekl8c`, само след като ти кажа. Без публикуване на образи/Marketplace без мое „да“.
Отговаряй ми на български, кратко и конкретно; когато не си сигурен — кажи го и предложи как да проверим.
---
