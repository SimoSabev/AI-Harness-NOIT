# Спайк RUNNERS — yarn berry, bun, node --test, mocha (v5 т. 4.9, E8и)

Статус: **ГОТОВО за berry, bun и node --test; mocha — не** (22.10.2026). Без API, $0. Решение D-358.

## yarn berry (@yarnpkg/cli-dist 4.18.1, BSD-2-Clause, публикуван 24.09.2026)
- Истинският lockfile на fixtures/shop-yarn-berry: `__metadata.version: 10`, `cacheKey: 10c0`; запис
  `resolution: "<име>@npm:<версия>"` + `checksum: 10c0/…` (хеш на zip кеша, не integrity на tarball-а).
- Вграденият patch на typescript/fsevents: `typescript@patch:typescript@npm%3A6.0.3#optional!builtin<compat/typescript>::…`
  — tarball-ът е същият като на npm записа; мрежа не трябва.
- Бинарните пакети по платформа (`conditions: os=linux & cpu=x64 & libc=glibc`) нямат `checksum` — yarn 4 не го пише за тях
  дори на платформата, която ги е свалила (docker тестът: пясъчникът поиска своите linux-x64 бинарни → 403). Пинът е точното
  име@версия (registry-то не сменя публикувана версия).
- Scoped tarball-ите yarn 4 иска с кодирана наклонена черта: `/npm/@isaacs%2ffs-minipass/-/fs-minipass-4.0.1.tgz` (gate log) —
  allowlist-ът добавя и този точен път; правилото на вратата за `%2f` не се прилага към точни маршрути.
- В средата на install фазата има настройки на yarn v1 (`YARN_REGISTRY`, `YARN_DISABLE_SELF_UPDATE_CHECK`); berry отказва
  непознати `YARN_*` („Unrecognized or legacy configuration settings“) → командата ги `unset`-ва първо.
- Инсталиране в пясъчника: прикованият `node /opt/yarn-berry/yarn.js install --immutable` с env (`YARN_IGNORE_PATH=1`,
  `YARN_NPM_REGISTRY_SERVER=http://egress-gate/npm`, `YARN_UNSAFE_HTTP_WHITELIST=egress-gate`, `YARN_ENABLE_SCRIPTS=0`,
  `YARN_NODE_LINKER=node-modules`, `YARN_INSTALL_STATE_PATH=/tmp/…`, без глобален кеш). Имената на настройките:
  https://yarnpkg.com/configuration/yarnrc (22.10.2026); env с префикс `YARN_` ги презаписва.

## bun (@oven/bun-linux-x64-baseline / -aarch64 1.4.3, MIT, публикуван 10.10.2026)
- `bun.lock` е JSONC (запетаи в края): `{"lockfileVersion": 2, "workspaces": {…}, "packages": {"<ключ>": ["<име>@<версия>",
  "<registry или ''>", {мета}, "sha512-…"]}}` — https://bun.com/docs/install/lockfile (22.10.2026). Всички платформи са с integrity.
- `bun install --frozen-lockfile --ignore-scripts --verbose` с празен кеш: **38 GET, всичките `.tgz`, нито един packument**
  (61 записа; сваля само своята платформа).
- Срещу локална „врата“ на `http://127.0.0.1:…/npm/` (`BUN_CONFIG_REGISTRY`, https://bun.com/docs/install/registries,
  22.10.2026): 38 заявки, всичките `/npm/<име>/-/<файл>.tgz`; инсталирането и тестовете (vitest) минават.
- Обхват: `bun install` само. `bun test` пише свой формат (junit) → needs_human; `bun.lockb` (двоичен) → needs_human
  („`bun install --save-text-lockfile`“).

## node --test (вграден в Node; Node 24.22.0 в образа)
- Вградените репортери: `spec`, `tap`, `dot`, `junit`, `lcov`. junit в Node 22 няма атрибут за файла — id-тата по файл не
  стават; TAP също губи файла за вложени тестове.
- Решение: собствен репортер (https://nodejs.org/api/test.html#custom-reporters, 22.10.2026) `/opt/mandat/reporters/node-test.mjs`
  — събитията `test:start`/`test:pass`/`test:fail` имат `file`, `name`, `nesting`, `details.type`, `skip`, `todo`; пише
  Vitest JSON формата, така че парсерът, D1, D2 и MUST_PASS са същите. `tests.format: node-test`.
- Без аргументи `node --test` намира `**/*.test.mjs` сам; директория като аргумент (`tests/`) Node 22 приема за файл.

## mocha — не е направено
JSON репортерът на mocha дава `fullTitle` (заглавията слепени с интервал) — предците не се възстановяват еднозначно.
Пътят е същият като при node --test (собствен репортер с `test.titlePath()`), но иска фикстура с mocha и docker тест.
Остава `unsupported_runner npm/mocha` → needs_human (Q-058).
