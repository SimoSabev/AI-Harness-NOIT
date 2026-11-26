# Спайк LANGUAGES — pytest, go test -json, libtest JSON (v5 т. 6.3, E10 езици)

Статус: **ГОТОВО за Python и Go; Rust — адаптер и образ, без Docker тест** (26.11.2026). Без API, $0. Решения D-680…D-689.
Всички изходи по-долу са записани от истинските инструменти в Docker и стоят във `fixtures/test-reports/` (по тях вървят
unit тестовете на адаптерите).

## Python — pytest 9.2.0 (MIT), Python 3.11.2 (Debian bookworm)
- `--junitxml=<файл>` е вграден в pytest; форматът по подразбиране е `xunit2`, а той **няма атрибутите `file` и `line`**
  на `<testcase>`. Те има само с `-o junit_family=xunit1`
  (https://docs.pytest.org/en/stable/reference/reference.html#confval-junit_family, 26.11.2026; проверено в Docker: xunit2
  дава само `classname`, `name`, `time`). Без `file` id-то по D-025 („<файл> > … > <име>“) не може да се построи надеждно
  от `classname` (`tests.test_cart.TestCart` — къде свършва модулът?) → адаптерът изисква xunit1 и иначе казва точно това.
- Какво пише pytest (записано): `classname="tests.test_cart.TestCart" name="test_x" file="tests/test_cart.py" line="29"
  time="0.000"`; параметризиран тест `name="test_formats_cents_as_euros[-1234--12.34 EUR]"`; `<skipped>` за skip **и** за
  xfail (`type="pytest.xfail"`); `<failure>` за провал; `<error>` за грешка в setup/teardown.
- Грешка при събиране (ImportError в тестов модул): **един** `<testcase classname="" name="tests.test_broken"
  file="tests/test_broken.py">` с `<error message="collection failure">`; pytest спира („Interrupted: 1 error during
  collection“), exit 2. Другите тестове липсват → D1 ги вижда като регресии.
- Exit кодове: 0 всичко минава, 1 има провали, 2 прекъснато, 4 грешка в употребата, 5 няма събрани тестове
  (https://docs.pytest.org/en/stable/reference/exit-codes.html, 26.11.2026).
- `-p no:cacheprovider`: без `.pytest_cache` в дървото (https://docs.pytest.org/en/stable/how-to/cache.html, 26.11.2026).
- pytest-json-report (третата страна) не е нужен: junit е вграден. Нищо не се инсталира от проекта.
- Образът: `python3`, `python3-venv` от Debian bookworm (apt проверява подписания архив; дава 3.11.2); pytest и
  зависимостите му (pluggy 1.7.0, iniconfig 2.3.1, packaging 26.3, pygments 2.21.0) от PyPI като wheel-ове, всеки
  с sha256 (`pip install --require-hashes --only-binary=:all: --no-deps`, `docker/sandbox-python/requirements.lock`).
  Хешовете и датите — от https://pypi.org/pypi/<пакет>/json (26.11.2026). packaging 26.4 е от 23.11 → по-млад от 3 дни → 26.3.

## Go — go 1.27.4 (BSD-3-Clause), пуснат 10.11.2026
- Архивът и sha256 от https://go.dev/dl/?mode=json (26.11.2026); датата от https://go.dev/doc/devel/release (26.11.2026).
- `go test -json` (test2json, https://pkg.go.dev/cmd/test2json, 26.11.2026): по едно JSON събитие на ред
  `{"Time","Action","Package","Test","Elapsed","Output"}`; Action ∈ start, run, pause, cont, pass, fail, skip, output, bench.
  Подтест: `"Test":"TestFormat/positive"` (интервалите в името стават `_`). Пакет без тест: `fail` без `Test`.
- Счупен build (записано, go 1.27.4): `{"ImportPath":"…","Action":"build-output"}`, `{"ImportPath":"…","Action":"build-fail"}`,
  после `{"Action":"fail","Package":"…","FailedBuild":"…"}`; тестовете на пакета изобщо не се появяват.
- Пакетите са пътища на модула (`example.com/shop/cart`) → id-то е пътят спрямо `module` от go.mod (`cart > TestX`,
  коренът е `.`). go.mod се чете на хоста (не symlink), никога не се изпълнява.
- Средата на образа: `GOTOOLCHAIN=local` (без сваляне на toolchain), `GOPROXY=off`, `GOSUMDB=off`, `GOTELEMETRY=off`
  (https://go.dev/ref/mod#environment-variables, https://go.dev/doc/toolchain, https://go.dev/doc/telemetry, 26.11.2026);
  кешът в tmpfs дома, `CGO_ENABLED=0`.

## Rust — 1.100.0 (MIT OR Apache-2.0), пуснат 12.11.2026 [НП: libtest JSON е нестабилен]
- Архивът и sha256: https://static.rust-lang.org/dist/rust-1.100.0-<target>.tar.xz(.sha256); датата от
  https://static.rust-lang.org/dist/channel-rust-stable.toml (26.11.2026).
- Записано с `rust:1-slim-bookworm` (cargo 1.100.0, rustc 1.100.0):
  - `cargo test -- --format json` → „The "json" format is only accepted on the nightly compiler with -Z unstable-options“;
  - `cargo test -- -Z unstable-options --format json` → „the option `Z` is only accepted on the nightly compiler“;
  - с `RUSTC_BOOTSTRAP=1` минава на stable. Това е вратичка на компилатора, не обещан интерфейс → **[НП]**: форматът може да
    се смени без предупреждение; командата е фиксирана (`RUST_TEST_COMMAND`) и всяка промяна на версията иска нов спайк.
  - cargo спира след първия провален тестов бинарник → `--no-fail-fast`.
  - Събитията: `{"type":"suite","event":"started","test_count":3}`, `{"type":"test","event":"started","name":"tests::adds"}`,
    `{"type":"test","name":"tests::adds","event":"ok","exec_time":…}`, `"event":"ignored"`, `"event":"failed"`, и
    `{"type":"suite","event":"ok"|"failed",…}`. **Името на бинарника го няма** → един и същ `adds` в lib и в `tests/cart.rs`
    би се сблъскал. Затова stderr на cargo се слива в отчета (`2>&1`): редовете `Running unittests src/lib.rs (…)`,
    `Running tests/cart.rs (…)`, `Doc-tests shop` дават файла. С `-q` тези редове изчезват → командата е без `-q`.
  - doc-тестовете се казват `src/lib.rs - add (line 2)`.
- Образът: стандартният архив, `install.sh --components=rustc,cargo,rust-std-<target>` (без документацията), Debian
  `gcc`, `libc6-dev` за линкера; `CARGO_NET_OFFLINE=true`, `CARGO_HOME` и `CARGO_TARGET_DIR` в tmpfs дома.
- Не е минал Docker тест с образа (тегли ~210 MB); адаптерът е тестван върху записания изход.

## Обхват и граници
- Само проекти **без зависимости**: `runtime.install: none`, нищо не се тегли (пясъчникът на тестовете е `--network none`
  както винаги). pyproject `[project].dependencies`, requirements*.txt, poetry/uv/pdm/Pipfile заключвания, `require` в go.mod,
  `[dependencies]`/`[dev-dependencies]` в Cargo.toml → скенерът пише needs_human. Инсталиране през вратата (PyPI файлове с
  хешове, Go module proxy, crates.io) е следваща стъпка.
- D2 `weakened_assertions` (AST) е само за JS/TS; за другите езици D2 хваща изтрити, преименувани и пропуснати тестове и
  отслабването по A/B (`weakened`), а D4 пази тестовете извън обхвата на задачата.
