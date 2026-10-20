# Доклад E1б — 20.10.2026, 17:10 UTC

## Статус: ГОТОВО (live чака Симо)
Всичко без човек е зелено. `supabase start` е блокиран от лимита на Docker Hub в облачната сесия (docs/blockers/supabase-start.md);
обходът (PGlite + Postgres 17 в Docker) покрива миграциите, pgTAP и паралелните писачи. RFC 3161 live → SKIPPED (TSA хостовете
са блокирани тук).

## Готово, когато
| Команда | Реален изход | |
| --- | --- | --- |
| `pnpm db:start && pnpm db:reset` | `Error response from daemon: error from registry: Data limit exceeded` (2 опита + 2 обходни регистъра) | ✗ → обход |
| `pnpm test:db` (обход, D-274) | `ok ledger_append.test.sql: 12/12` · `ok outbox_approvals.test.sql: 9/9` · `ok rls_matrix.test.sql: 17/17` · `db tests ok (3 files, pglite)` | ✓ |
| Postgres 17 (docker) | двама паралелни писачи → seq 1..40 без дупки, веригата цяла; 2 drain-а → всеки ефект точно веднъж; `demo seed --minimal` идемпотентен | ✓ |
| `pnpm check` | build, lint, typecheck, unit 294/294, test:counts, licenses (core 18, harness 269), no-dotenv — exit 0; покритие lines: contract 100, core 99.7, ledger 95.8, verify 92.0 | ✓ |
| `pnpm mandat verify --repo <tmp копие на demo-shop, клон fix/discount, изтрит тест> --remote file://…/demo-shop.git --external --type bugfix` | `VERDICT: FAILED  reasons: D2:missing_test:tests/cart.spec.ts > cart > applies 10% over 50, D4:out_of_contract:tests/**` · `level: 1 (external cap, caller cap, no ruleset, no CI signal)` · `base: bc7b7b430e6d (trusted file://…/demo-shop.git main)` · exit 20 | ✓ |
| `node scripts/check-test-counts.mjs` | `unit: 294 passed` · `docker: …` (виж Тестове) · `НЕПОКРИТИ: packages/ledger/src/anchor.live.test.ts > … (D-276)` · `skipped: 1 (изброени)` | ✓ |
| `pnpm mandat verify-log --org <demo org uuid>` | срещу Postgres 17: `OK: chain intact (seq 1..40, last sha256:…)` (db.docker.test.ts) | ✓ |
| `pnpm mandat ladder sim --p 0.95 --h 5` | `mean 86.4 tasks to level 1 (spec ≈ 87; -0.7%)` — в рамките на 20% | ✓ |
| `pnpm mandat bench` | `RESULT 8/8 · false VERIFIED 0 · false FAILED 0 · 3m36s` | ✓ |
| `pnpm mandat bench --fail-gate` | `fail-gate: verifier fault detected (D1:report_invalid:missing) · verdict FAILED`, exit 1 | ✓ |

## Тестове
unit 294/294 (property: ladder, effective-level) · pgTAP 38/38 (PGlite) · docker: виж долу · live: 1 SKIPPED (MANDAT_LIVE_TSA) — не е минал.
Нови: ladder 10, effective-level/frame/codeSpan 6, policy 7, d2-weakened 7, d2-weakened-assertions 4, d2-weakened-fp 6, base-pinning 4,
verify-cli 14 (вкл. k1-base-policy, verify-no-write, retry-same-tree, unsupported-runner), test-procedure 3, git-safety 4, outbox 3,
lease 5, ledger online 3, anchor 2, cli (verify alias, ladder sim, verify-log --org, demo seed, anchor) 6, test-db 2, demo-shop 2.
Docker: verify-cli.docker 4/4 (изтрит тест, rm без git rm, честна поправка, external-weaken), db.docker 4/4, bench-fail-gate 1/1,
и E0 (gate 4, sandbox 5, worker 4, bench 2). НЕПОКРИТИ: anchor.live (D-276).

## Решения
D-265 отворено · D-266 отворено · D-267 решено · D-268 решено · D-269 отворено · D-270 решено · D-271 отворено · D-272 решено ·
D-273 отворено · D-274 отворено · D-275 отворено · D-276 решено.

## Отклонения от промпта
- `supabase start` → PGlite + Postgres контейнер (D-274; т. 0.3 (ж) обход).
- `mandat run` ползва общата verifyTrees, а не целия verifyChange (D-271, Q-021).
- loadPolicyFromBase е във verify (readAtBase), не в contract (D-266): contract остава без I/O.
- Daemon-ът (MANDAT_MODE=worker) — в E3а (D-275); тук са чистите части на т. 5.8.
- D2:weakened пример: в demo-shop отслабването е `toBe(1000) → toBe(0)` (бъгът дава 0), не `toBe(45) → toBe(50)`.

## Сигурност
И1: mandat-verify не вижда ключове; `mandat verify` маха SUPABASE_* от env на процеса (S35, тест). И2: никакъв push; огледалата са
само в MANDAT_HOME. И3: дървото на агента минава през износа на E0 (tar → scanTar → чист git). И4: всяка присъда е ред в дневника
(локален за CLI, Postgres за worker-а; append-only с тригер и REVOKE). И5: тестовете вървят в пясъчника без мрежа. И6: `.mandat.yml`
се чете само от доверения base (К-1, тест) и е винаги protected/config. T3-7: git-safety тест. T3-3: bench --fail-gate. T3-2/T3-8: outbox,
lease. S1/S2/S27/S31/S35: тестове по-горе. В .git на потребителя не се пише (verify-no-write).

## Чака Симо
Supabase облак (docs/setup/supabase.md) и `supabase start` локално (Q-022); TSA live (docs/setup/tsa.md). Нищо не блокира E1в.

## Часове и разход
план 44–56 ч / реално ≈ 6 ч работа на кодера · API $0

## Комити
`git log --oneline phase/e1a-licenses..phase/e1b-core-online` — 31 комита.

## Следващо
E1в: packages/gate-github (порт, fakeGitHub с ruleset, renderCheck), decideDelivery и D7.ci lite в core (клон phase/e1c-github-gate).
