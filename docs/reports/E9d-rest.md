# E9г — останалото от ресърча без ключове (28.10.2026, клон claude/e9d-research-rest-8779b0)

Решения: D-440 (ключът за Exa в „Ключове“), D-441 (ресърчът в пясъчника през бриджа на E8д), D-442 (браузърното ниво с
UI образа). Отворени въпроси: Q-080, Q-081, Q-082. Ръководство: docs/integrations/research.md.

## Какво е направено
| Част | Къде | Тестове |
| --- | --- | --- |
| Поле „Търсене за ресърча (Exa)“ в „Ключове“ (bg/en); ключът → контролният адрес → запечатан `research:exa` → проксито се пуска наново и го взима от склада (без `EXA_API_KEY`); само Exa стига за старт; `MANDAT_PROXY_PROVIDERS` назовава `exa`; махане | apps/web/src/app/keys, components/research-key-form.tsx, lib/server/{api,keys}.ts, api/keys/research; packages/cli/src/commands/{proxy,local,local-control}.ts | keys.test.ts (web), local-control.test.ts, proxy-keys.test.ts |
| research-mcp без зависимост от worker-а (pg направо), `--searxng` и `--providers`, заключен хеш на инструментите | packages/research-mcp/src/{main,args,queue}.ts | pin.test.ts, research-mcp.test.ts |
| `RESEARCH_MCP_REF` — вграденият сървър като ред в слой E | packages/contract/src/research-mcp.ts | research-schemas.test.ts |
| Образът на пясъчника носи сървъра (`/opt/mandat/research-mcp`) до бриджа | docker/sandbox/Dockerfile | Docker тестът по-долу |
| `mandat-upstream` само за вратата и за сайдкара `mandat-mcp-<run>-research` (агентът и сървърите от каталога — отказ) | packages/sandbox/src/hardening.ts | mcp-role.test.ts |
| Сайдкар за ресърча: роля mcp, без volume/тайни/работно дърво, мрежа навън + вътрешната MCP мрежа; маршрут `/mcp/research` на вратата с бюджет | apps/worker/src/mcp-sidecar.ts, run.ts | research-sidecar.docker.test.ts |
| Браузърното ниво: режим с фикстури (`--network none`, папка само за четене), `fixtureFile` в render.mjs | packages/sandbox/src/hardening.ts, packages/research/render-runner/render.mjs | browser.test.ts, browser.docker.test.ts |

## Реални резултати
| Ред | Изход |
| --- | --- |
| `research-sidecar.docker.test.ts` | ✓ 1/1 (800 s под натоварване): 7-те инструмента през `http://egress-gate/mcp/research`, търсене в локален SearXNG фикстур, четене на частен адрес от резултат → отказ, измислен URL → отказ, research_ask → „needs the harness worker“, `mcp_serving: ["research"]`, VERIFIED |
| `browser.docker.test.ts` (нов проект `research`) | ✓ 2/2: HTTP „thin“ → Chromium пуска скрипта (тегли /data.json) → `tier: browser`; страница извън папката → чист отказ |
| `pnpm mandat images build --ui` | `mandat-sandbox:cc2.1.302-3f2c9731dd8d`, `mandat-sandbox-ui:pw1.63.0-845cd73687bb` (локално, нищо не е публикувано) |
| `pnpm check` | CHECK OK (309 файла, 1646 теста, 2 SKIPPED) |

## Проверки
- `pnpm check`: CHECK OK — 309 тестови файла, 1646 минават, 2 SKIPPED (старите, с решение).
- `mcp-sidecar.docker.test.ts` (регресия след общия код за сайдкари): ✓ 1/1 (233 s).
- Целият `pnpm test:docker` не е пускан (часове; паралелната сесия ползва същия Docker) — пуснати са новите два файла и
  регресията на сайдкара.

## Намерено по пътя
- `--filter "@mandat/research-mcp..."` в Dockerfile-а теглеше целия worker през devDependency → махната; етапът е малък.
- Кешът на BuildKit беше 41 GB и GC триеше снимка по средата на сглобяването („snapshot … does not exist“, все същата
  стъпка). `docker builder prune --filter until=24h` (кеш, по-стар от 24 ч.) + нов текст на последната стъпка (проверка, че
  сървърът е в образа) го оправи.
- Под натоварен Colima първото пускане на Chromium отне ~2 мин; тестът дава 90 s на страница.
- `pnpm check` в нов worktree иска `pnpm --dir apps/desktop install --frozen-lockfile` (apps/desktop е извън workspace-а).

## Чака Симо
- Живи ключове: Anthropic/OpenAI за ресърч с модели, Exa за търсене и contents през проксито (полето вече е в „Ключове“) —
  живият рън на ресърча (D-404…D-411) остава SKIPPED до тогава.
- Q-080: ресърчът в пясъчника по избор или във всеки профил.
- Q-081: текстът на заявките стига до търсачките — само собственият SearXNG по подразбиране? проверка на телата?
- Q-082: research_ask/recall и браузърното ниво в пясъчника (през вратата към работника).

## Разход API: $0
