# Mandat verify като GitHub Action

Независима присъда за всеки PR, написан от AI агент (Claude Code, Codex, Copilot, Cursor, Devin — няма значение кой).
Тестовете на PR-а вървят в пясъчника на Mandat (Docker на runner-а) срещу base клона и проверката хваща изтрити,
прескочени или отслабени тестове, промени извън обхвата и в защитени файлове, код, който „поправя“ само под тестовете,
и (по желание) lint/типове на проекта и вида на страниците в браузър.

## Най-кратко
`.github/workflows/mandat.yml` в твоето репо:

```yaml
name: Mandat
on:
  pull_request:
permissions:
  contents: read
jobs:
  verify:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          fetch-depth: 0          # нужна е историята на base клона (merge-base)
          persist-credentials: false
      - uses: SimoSabev/AI-Harness-NOIT@<commit sha>   # закачи по SHA
        id: mandat
        with:
          fail-on: FAILED          # или UNKNOWN: червено и когато човек трябва да погледне
          # type: bugfix           # тип от .mandat.yml; празно = строгите правила по подразбиране
          # lint: npm run lint
          # typecheck: npx tsc --noEmit
          # ui-paths: "src/pages/**,src/components/**"
          # dev: npm run dev
          # ui-routes: "/,/cart"
```

## Какво получаваш
- **Job summary**: присъдата (VERIFIED / UNKNOWN / FAILED), всяка причина с думи, таблица с проверките.
- **Анотации**: `::error` за FAILED, `::warning` за UNKNOWN.
- **Outputs**: `result`, `level`, `reasons` (JSON) — за следващи стъпки (етикет, коментар, auto-merge само при VERIFIED).
- **Exit**: червено при FAILED (и при UNKNOWN с `fail-on: UNKNOWN`); 2 = проверката не можа да върви (не е PR, липсва история).

## Доверие
Base-ът е `origin/<base>` от checkout-а, който прави твоят workflow (не PR-ът): копира се в отделно bare хранилище извън
работната папка и се подава като remote. Токен не стига до Mandat. Тестовете на PR-а вървят в контейнер без мрежа
(инсталацията — само през вратата с allowlist от lockfile-а). Агентът не е бил в пясъчника ни, затова нивото е най-много 1
(`external`).

## Цена и време
Първото пускане строи образите (~5–8 мин); `ui-paths` добавя образа на браузъра (~3,6 GB). Без LLM: $0.

## Ограничения
- Нужен е `.mandat.yml` в base клона за пълни правила; без него — строгите по подразбиране.
- Скритите тестове (D5) не са в Action-а: те не трябва да живеят в репото на агента. Ползвай `mandat verify --hidden` локално.
- PR от fork: работи (не ползва тайни).
