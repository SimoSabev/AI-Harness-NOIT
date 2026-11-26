# Доклад E10 „езици“ — Python, Go, Rust (26.11.2026, клон claude/phase-e10-languages-91a1db)

## Статус: ГОТОВО за Python и Go; Rust — адаптер и образ (без Docker тест)
Мандат вече съди проекти на Python и Go без зависимости. Пясъчникът е същият, а езикът е слой отгоре: образ
`mandat-sandbox-<език>` върху точния таг на основния. Отчетът на всяка тестова рамка (vitest/jest JSON, node --test,
pytest junit, `go test -json`, libtest JSON) става общ `TestReport` в `packages/contract`. D1/D2/D5/D11/D14/MUST_PASS
четат само него, а за JS/TS всичко е байт по байт като досега. Решения D-680…D-689, спайк docs/spikes/LANGUAGES.md.

## Готово, когато
| Ред | Реален изход | |
| --- | --- | --- |
| Python: честна поправка → VERIFIED, изтрит тест → FAILED в Docker тест | languages.docker.test.ts: Python (pytest 9.2.0) честна → VERIFIED (D11 убива мутантите), изтрит тест → FAILED D2:missing_test 5,2 s; чупещ граничен тест → FAILED D1:regression | ✓ |
| bench 40/40 остава, 0 лъжливи VERIFIED | bench.docker.test.ts: „bench 40/40, 0 false VERIFIED“ 901 s; redteam 10/10 | ✓ |
| `pnpm check` → CHECK OK | CHECK OK: 458 файла, 2801 теста, 7 skipped; licenses ok, no-dotenv ok (след поправка на типа в apps/web harness.ts за runtime с език, тест в harness-approve.test.ts) | ✓ |
| (отвъд) Go: честна → VERIFIED, изтрит → FAILED в Docker | Go 1.27.4 (shop-go): честна → VERIFIED, изтрит → FAILED D2:missing_test 31,8 s | ✓ |
| (отвъд) bench --languages L1–L7 | „bench --languages 7/7 (shop-py, shop-go), 0 false VERIFIED“ 102 s | ✓ |

## Какво има
| Част | Къде | Тестове |
| --- | --- | --- |
| `TestReport` (zod) + адаптери; `parseReport(format, raw, ctx)`; XML четец без DOCTYPE/ентитита | contract/test-report.ts, xml-lite.ts | test-report.test.ts (15), xml-lite.test.ts (4) |
| `.mandat.yml`: `runtime: {language, install: none}`, рамки pytest/go/cargo; RepoConfig `install: none`, `language?`, 3 нови формата; договорът на агента казва командата на езика | contract/policy.ts, schemas.ts, agent-contract.ts | policy.test.ts (+4), contract.test.ts (+1) |
| Скенер: pyproject.toml / go.mod / Cargo.toml, зависимостите, предложение за политика и профил | onboard/languages.ts, propose.ts, propose-profile.ts | languages.test.ts (10) |
| D11 по език: бланкиране на низове/коментари за целия файл, оператори, специален случай, „под тест ли съм“ | core/d11.ts | d11-languages.test.ts (11), detectors-languages.test.ts (4) |
| Проверката: без lockfile/врата/install, адаптерът по формат, образът на езика (иначе UNKNOWN images_missing) | verify/test-procedure.ts, verify-trees.ts, cli.ts; worker/run.ts | test-procedure.test.ts (+3), verify-cli.test.ts (+2), languages.docker.test.ts (3) |
| Образи python/go/rust, `mandat images build --lang` | docker/sandbox-{python,go,rust}, sandbox/images.ts, cli | sandbox.test.ts (+1), commands.test.ts (+1) |
| Фикстури shop-py, shop-go; 7 fake агента; запечатани договори; `mandat bench --languages` | fixtures/, packages/agents/fakes, contracts/, bench/ | fixtures.test.ts (+2), languages.test.ts (4), bench.docker.test.ts (+1) |

## Какво намери Docker тестът (и не биха го намерили unit тестовете)
1. Пясъчникът слага свой `PATH=/usr/local/bin:/usr/bin:/bin` (SANDBOX_HARDENING env), затова `ENV PATH` на образа не
   важи: `python3` беше този на Debian, без pytest, и отчет нямаше (`infra:baseline_invalid`). Образите вече слагат
   обвивки/връзки в `/usr/local/bin`, а при строежа има проверка под точно този PATH (`env -i PATH=…`).
2. pytest по подразбиране (xunit2) не пише `file=` → id по D-025 не става; затова е `-o junit_family=xunit1`.
3. libtest JSON на stable Rust иска `RUSTC_BOOTSTRAP=1`. cargo спира след първия провален бинарник, а името на
   бинарника го има само в stderr на cargo.

## Граници (отворено)
- Само проекти без зависимости. PyPI/Go proxy/crates.io през вратата с хешове е следващата стъпка; дотогава скенерът
  пише needs_human „runtime.dependencies“.
- Python е 3.11 (Debian bookworm). Проект за ≥ 3.12 пада при събирането, т.е. FAILED, никога лъжливо VERIFIED.
- D2 `weakened_assertions` (AST) е само за JS/TS. За другите езици D2 хваща изтрити, преименувани и пропуснати тестове
  и отслабване по A/B, а D4 пази тестовете извън обхвата.
- Rust: образът се строи (~210 MB), адаптерът е тестван върху записан изход. Docker тест с образа няма; [НП] форматът.

## Разход API: $0
