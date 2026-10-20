# Доклад E1а — 20.10.2026, 15:20 UTC

## Статус: ГОТОВО

## Готово, когато
| Команда | Реален изход | |
| --- | --- | --- |
| `pnpm licenses:check` | `licenses ok (core: 9 packages, harness: 238 packages)` | ✓ |
| `pnpm check` | build, lint, typecheck, unit 204/204 (покритие: lines 91.5%), test:counts, licenses, no-dotenv — exit 0 | ✓ |
| `node scripts/check-test-counts.mjs` | `unit: 204 passed, 0 failed, 0 skipped` · `docker: 15 passed, 0 failed, 0 skipped` · `skipped: 0` | ✓ |
| ред от т. 0.8 (а) | блок `<!-- mandat-coder:begin -->…<!-- mandat-coder:end -->` в CLAUDE.md и AGENTS.md | ✓ |
| `node scripts/set-core-license.mjs --mode dual --dry-run` | 6 × `[dry-run] packages/<p>/package.json: license → Apache-2.0 OR GPL-3.0-or-later` + 6 × README ред; нищо не е записано (`git status` чист); `--mode apache --dry-run` → `no changes (core already Apache-2.0)` | ✓ |

## Тестове
unit 204/204 (нови: license-groups 7, check-test-counts 6, set-core-license 3, scripts 7) · property 6/6 · docker 15/15
(пуснати върху комита на E1а в отделно работно дърво; `MANDAT_EXTRA_CA_CERTS`, `MANDAT_SANDBOX_APT=0`, D-150/D-151) ·
pgTAP —, e2e —, live — (няма в тази фаза). Паднали 0 · SKIPPED 0. НЕПОКРИТИ: няма.

## Какво е направено
- Ядро (Apache-2.0): contract, core, ledger, export, sandbox, redaction — LICENSE (каноничен текст, sha256 cfc7749b…3d30),
  NOTICE, licenses/LICENSE-GPL-3.0-or-later.txt (неактивен), `"license": "Apache-2.0"`. verify, gate-github, mcp влизат в
  групата при създаването си (E1б, E1в, E2). Харнесът остава GPL-3.0-or-later (тест).
- license-allowlist.json по групи; scripts/license-groups.mjs; check-licenses.mjs по пакет със затварянето на
  `workspace:*` зависимостите (D-262).
- license-groups.test.ts откри нарушение: packages/sandbox/src/sandbox.docker.test.ts импортира @mandat/worker и
  @mandat/channels → тестът е преместен в apps/worker (D-260).
- check-test-counts.mjs + JSON отчети в test-results/ + `passWithNoTests: false` в двата конфига; в `pnpm check` (D-261).
- set-core-license.mjs (apache|dual, --dry-run).
- D-200…D-239 преписани; D-260…D-264 нови; questions-for-simo.md Q-001…Q-019; .env.example (т. 0.7); README „Лицензи“.

## Какво се мести в packages/verify (E1б, т. 4.1) — по реалния код
| Сега | Нов път | Импортира харнес? |
| --- | --- | --- |
| apps/worker/src/phases/test.ts (runTestProcedure) | packages/verify/src/test-procedure.ts | не (contract, export, sandbox, ./gate, ./sandbox-exec) |
| apps/worker/src/trees.ts (buildVerifyTree, mergePackageJson, snapshot) | packages/verify/src/trees.ts | не (contract, core) |
| apps/worker/src/gate.ts (startRunGate: gate-ът е контейнер = процес, D-238) | packages/verify/src/gate.ts | не (contract, sandbox) |
| apps/worker/src/sandbox-exec.ts, fsx.ts, lock.ts, host.ts, run-dir.ts | packages/verify/src/* | не (contract, sandbox, ledger, redaction) |
| кешът на baseline, D10.lockfile, оркестрацията на детекторите (в apps/worker/src/run.ts, VERIFY) | packages/verify/src/verify-change.ts | не |
Нищо от списъка не импортира харнес пакет → не е нужно разделяне (няма D-2xx „отворено“).

## Решения
D-200…D-239 (преписани, статуси по т. 12) · D-260 решено · D-261 решено · D-262 решено · D-263 решено · D-264 отворено за Симо.

## Отклонения от промпта
- TDD: тестовете и кодът на скриптовете са в един и същ комит (без отделен „test: red“ комит) — малки скриптове, тестът
  е написан първи и пуснат червен локално. От E1б нататък — отделни комити, където кодът е > 50 реда.
- docs/spec съдържа само двата промпта (D-264, Q-018).

## Сигурност
И1–И6: без промени по пясъчника/gate/проксито; лицензната граница пази ядрото от GPL кода (статичен тест по import-и и
по workspace зависимости). Никакви ключове, .env, push.

## Чака Симо
Избор apache/dual след регламента (Q-017) — не блокира. Файловете на спецификацията в docs/spec (Q-018) — частично
(E1б миграции, E3 UI). Push (Q-019).

## Часове и разход
план 4–5 ч / реално ≈ 2 ч · API $0

## Комити
`git log --oneline 97af966..phase/e1a-licenses` — 5 комита + този доклад.

## Следващо
E1б: fixtures/demo-shop + разширенията на типовете + packages/verify (клон phase/e1b-core-online).
